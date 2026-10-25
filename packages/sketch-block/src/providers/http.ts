import { IndexeddbPersistence } from 'y-indexeddb'
import * as Y from 'yjs'
import { createStatus } from './status'
import { type BoardConnection, DEFAULT_MAX_INLINE_IMAGE_BYTES, type SketchProvider } from './types'

export interface HttpProviderOptions {
  /** The board's stored Yjs state (an update), or null when the board doesn't exist yet. */
  load(boardId: string): Promise<ArrayBuffer | Uint8Array | null>
  /** Persists a Yjs update. The server merges it into the stored state (updates are idempotent). */
  save(boardId: string, update: Uint8Array): Promise<void>
  savePreview?(boardId: string, preview: Blob): Promise<string>
  uploadImage?(file: File): Promise<string>
  /** Local edits are merged and sent this long after the last one (default 1000 ms). */
  debounceMs?: number
  /** Also keep the board in IndexedDB (`mei-sketch:<id>`) and push offline edits after loading (default true). */
  offline?: boolean
  /** Without `uploadImage`, inline (data URL) images larger than this are refused (default 256 000 bytes). */
  maxInlineImageBytes?: number
  /** See `SketchProvider.resolveImageSrc`. */
  resolveImageSrc?(src: string): string | null
}

const BACKOFF_START_MS = 1000
const BACKOFF_MAX_MS = 30_000

/**
 * Whether `diff` (the doc's state minus the server's) changes the server's state. A diff always carries the
 * whole delete set, so deletions the server already has must not count.
 */
function changesServer(server: Uint8Array | null, diff: Uint8Array): boolean {
  const { structs, ds } = Y.decodeUpdate(diff)
  if (structs.length > 0) return true
  if (ds.clients.size === 0) return false
  if (!server) return true
  const probe = new Y.Doc()
  try {
    Y.applyUpdate(probe, server)
    let changed = false
    probe.on('update', () => { changed = true })
    Y.applyUpdate(probe, diff)
    return changed
  } finally {
    probe.destroy()
  }
}

/**
 * Loads each board from your HTTP backend and saves local edits as merged, debounced Yjs updates. Failed saves
 * keep the pending merge and retry with exponential backoff (1 s, 2 s, 4 s … 30 s).
 */
export function http(opts: HttpProviderOptions): SketchProvider {
  const debounceMs = opts.debounceMs ?? 1000
  const offline = opts.offline ?? true
  const maxInlineImageBytes = opts.maxInlineImageBytes ?? DEFAULT_MAX_INLINE_IMAGE_BYTES
  const provider: SketchProvider = {
    async connect(boardId: string): Promise<BoardConnection> {
      const doc = new Y.Doc()
      /** Origin of the server load; such updates are never saved back. Never the store's LOCAL_ORIGIN. */
      const loadOrigin = Symbol('sketch-http-load')
      const status = createStatus('connecting')
      let persistence: IndexeddbPersistence | null = null

      if (offline) {
        persistence = new IndexeddbPersistence(`mei-sketch:${boardId}`, doc)
        try {
          await persistence.whenSynced
        } catch {
          persistence.destroy().catch(() => {})
          persistence = null
        }
      }

      let pending: Uint8Array | null = null
      let inFlight: Promise<void> | null = null
      let timer: ReturnType<typeof setTimeout> | null = null
      let attempt = 0
      /** When the current burst of unsaved edits began (for maxWait). */
      let burstStart: number | null = null
      let loadTimer: ReturnType<typeof setTimeout> | null = null
      let loadAttempt = 0
      /** false until a server load succeeds; status stays `offline` until then (never a false `saved`). */
      let loaded = false
      let destroyed = false
      const maxWait = debounceMs * 5

      const report = (next: 'saving' | 'saved' | 'error') => {
        if (loaded) status.set(next)
      }

      const schedule = (ms: number) => {
        if (timer !== null) clearTimeout(timer)
        timer = setTimeout(() => {
          timer = null
          flush()
        }, ms)
      }

      const send = (update: Uint8Array): Promise<void> => {
        try {
          return Promise.resolve(opts.save(boardId, update))
        } catch (err) {
          return Promise.reject(err)
        }
      }

      const flush = () => {
        if (destroyed || inFlight || !pending) return
        const update = pending
        pending = null
        burstStart = null
        report('saving')
        inFlight = send(update).then(
          () => {
            inFlight = null
            attempt = 0
            if (destroyed) return
            if (pending) schedule(debounceMs)
            else report('saved')
          },
          () => {
            inFlight = null
            pending = pending ? Y.mergeUpdates([update, pending]) : update
            if (destroyed) return
            report('error')
            schedule(Math.min(BACKOFF_START_MS * 2 ** attempt, BACKOFF_MAX_MS))
            attempt++
          },
        )
      }

      /** Debounced, but a continuous burst of edits still saves at least every `maxWait`. */
      const queue = (update: Uint8Array) => {
        pending = pending ? Y.mergeUpdates([pending, update]) : update
        if (attempt > 0) return // a backoff retry is already scheduled and will carry this edit
        if (status.get() !== 'saving') report('saving')
        if (inFlight) return
        const now = Date.now()
        burstStart ??= now
        schedule(Math.max(0, Math.min(debounceMs, burstStart + maxWait - now)))
      }

      /**
       * Applies the server state, then queues the edits only this client has (offline cache, edits made before
       * the load), computed by state vector.
       */
      const applyServer = (data: ArrayBuffer | Uint8Array | null) => {
        let serverState: Uint8Array | null = null
        let serverVector: Uint8Array = new Uint8Array([0])
        if (data) {
          serverState = data instanceof Uint8Array ? data : new Uint8Array(data)
          Y.applyUpdate(doc, serverState, loadOrigin)
          serverVector = Y.encodeStateVectorFromUpdate(serverState)
        }
        loaded = true
        const unsynced = Y.encodeStateAsUpdate(doc, serverVector)
        if (changesServer(serverState, unsynced)) {
          status.set('saving')
          queue(unsynced)
        } else {
          status.set(pending || inFlight ? 'saving' : 'saved')
        }
      }

      const load = () => {
        try {
          return Promise.resolve(opts.load(boardId))
        } catch (err) {
          return Promise.reject(err)
        }
      }

      /** Background load retries (cache-only start), same backoff as saves. */
      const retryLoad = () => {
        const delay = Math.min(BACKOFF_START_MS * 2 ** loadAttempt, BACKOFF_MAX_MS)
        loadAttempt++
        loadTimer = setTimeout(() => {
          loadTimer = null
          load().then(
            (data) => {
              if (!destroyed) applyServer(data)
            },
            () => {
              if (!destroyed) retryLoad()
            },
          )
        }, delay)
      }

      const onUpdate = (update: Uint8Array, origin: unknown) => {
        if (origin === loadOrigin || (persistence && origin === persistence)) return
        queue(update)
      }

      let initial: ArrayBuffer | Uint8Array | null = null
      let reachable = true
      try {
        initial = await load()
      } catch (err) {
        // only a non-empty offline cache can stand in for the server
        if (!persistence || doc.store.clients.size === 0) {
          persistence?.destroy().catch(() => {})
          doc.destroy()
          throw err
        }
        reachable = false
      }
      doc.on('update', onUpdate)
      if (reachable) {
        applyServer(initial)
      } else {
        status.set('offline')
        retryLoad()
      }

      return {
        doc,
        existed: doc.getMap('elements').size > 0,
        status,
        networked: true,
        offline: persistence !== null,
        maxInlineImageBytes,
        destroy() {
          if (destroyed) return
          if (timer !== null) clearTimeout(timer)
          if (loadTimer !== null) clearTimeout(loadTimer)
          timer = null
          loadTimer = null
          // final flush: best effort, never throws (the offline cache still has everything)
          const finalFlush = () => {
            if (!pending) return
            const update = pending
            pending = null
            send(update).catch(() => {})
          }
          if (inFlight) inFlight.then(finalFlush, finalFlush)
          else finalFlush()
          destroyed = true
          doc.off('update', onUpdate)
          status.clear()
          persistence?.destroy().catch(() => {})
          doc.destroy()
        },
      }
    },
  }
  if (opts.savePreview) provider.savePreview = opts.savePreview
  if (opts.uploadImage) provider.uploadImage = opts.uploadImage
  if (opts.resolveImageSrc) provider.resolveImageSrc = opts.resolveImageSrc
  return provider
}
