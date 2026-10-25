import { IndexeddbPersistence } from 'y-indexeddb'
import * as Y from 'yjs'
import { createStatus } from './status'
import type { BoardConnection, SketchProvider } from './types'

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

      let serverState: Uint8Array | null = null
      let serverVector: Uint8Array | null = null
      try {
        const data = await opts.load(boardId)
        if (data) {
          const update = data instanceof Uint8Array ? data : new Uint8Array(data)
          Y.applyUpdate(doc, update, loadOrigin)
          serverState = update
          serverVector = Y.encodeStateVectorFromUpdate(update)
        } else {
          serverVector = new Uint8Array([0])
        }
      } catch (err) {
        if (!persistence) {
          doc.destroy()
          throw err
        }
        // the cache keeps the board usable; its whole state is pushed once the server answers again
      }

      let pending: Uint8Array | null = null
      let inFlight: Promise<void> | null = null
      let timer: ReturnType<typeof setTimeout> | null = null
      let attempt = 0
      let destroyed = false

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
        status.set('saving')
        inFlight = send(update).then(
          () => {
            inFlight = null
            attempt = 0
            if (destroyed) return
            if (pending) schedule(debounceMs)
            else status.set('saved')
          },
          () => {
            inFlight = null
            pending = pending ? Y.mergeUpdates([update, pending]) : update
            if (destroyed) return
            status.set('error')
            schedule(Math.min(BACKOFF_START_MS * 2 ** attempt, BACKOFF_MAX_MS))
            attempt++
          },
        )
      }

      const queue = (update: Uint8Array) => {
        pending = pending ? Y.mergeUpdates([pending, update]) : update
        if (attempt > 0) return // a backoff retry is already scheduled and will carry this edit
        if (status.get() !== 'saving') status.set('saving')
        if (!inFlight) schedule(debounceMs)
      }

      const onUpdate = (update: Uint8Array, origin: unknown) => {
        if (origin === loadOrigin || (persistence && origin === persistence)) return
        queue(update)
      }
      doc.on('update', onUpdate)

      // Offline edits (in the cache but not on the server) go up once, computed by state vector.
      const unsynced = serverVector ? Y.encodeStateAsUpdate(doc, serverVector) : Y.encodeStateAsUpdate(doc)
      status.set(serverVector ? 'saved' : 'offline')
      if (changesServer(serverState, unsynced)) {
        pending = unsynced
        schedule(debounceMs)
      }

      return {
        doc,
        existed: doc.getMap('elements').size > 0,
        status,
        networked: true,
        destroy() {
          if (destroyed) return
          if (timer !== null) clearTimeout(timer)
          timer = null
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
  return provider
}
