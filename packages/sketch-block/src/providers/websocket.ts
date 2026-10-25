import { IndexeddbPersistence } from 'y-indexeddb'
import * as Y from 'yjs'
import { createStatus } from './status'
import { type BoardConnection, DEFAULT_MAX_INLINE_IMAGE_BYTES, type SketchProvider } from './types'

export interface WebsocketProviderOptions {
  /** The y-websocket server, e.g. `wss://sync.example.com`. The room is the board id. */
  url: string
  /** URL query parameters (e.g. an auth token), read on every (re)connect. */
  params?: () => Record<string, string>
  /** Also keep the board in IndexedDB (`mei-sketch:<id>`) so it opens offline (default true). */
  offline?: boolean
  /** `connect` resolves after the first sync or after this long, whichever comes first (default 4000 ms). */
  connectTimeoutMs?: number
  WebSocketPolyfill?: typeof WebSocket
  /** Uploads inserted images (else they are stored inline as data URLs, see `maxInlineImageBytes`). */
  uploadImage?(file: File): Promise<string>
  /** Without an uploader, inline (data URL) images larger than this are refused (default 256 000 bytes). */
  maxInlineImageBytes?: number
  /** See `SketchProvider.resolveImageSrc`. */
  resolveImageSrc?(src: string): string | null
}

type YWebsocket = typeof import('y-websocket')

/**
 * Realtime boards through a y-websocket server, with presence on `connection.awareness`. Needs the optional peer
 * dependency `y-websocket`, loaded only when a board connects. Some bundlers resolve that dynamic import at build
 * time, so install `y-websocket` or mark it external even if you never call `websocket()`.
 */
export function websocket(opts: WebsocketProviderOptions): SketchProvider {
  const offline = opts.offline ?? true
  const connectTimeoutMs = opts.connectTimeoutMs ?? 4000
  const maxInlineImageBytes = opts.maxInlineImageBytes ?? DEFAULT_MAX_INLINE_IMAGE_BYTES
  const provider: SketchProvider = {
    async connect(boardId: string): Promise<BoardConnection> {
      let mod: YWebsocket
      try {
        mod = await import('y-websocket')
      } catch (err) {
        throw new Error('websocket() needs the optional peer dependency "y-websocket"', { cause: err })
      }

      const doc = new Y.Doc()
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

      const status = createStatus('connecting')
      let provider: InstanceType<YWebsocket['WebsocketProvider']>
      try {
        provider = new mod.WebsocketProvider(opts.url, boardId, doc, {
          params: opts.params?.() ?? {},
          ...(opts.WebSocketPolyfill ? { WebSocketPolyfill: opts.WebSocketPolyfill } : {}),
          connect: true,
        })
      } catch (err) {
        persistence?.destroy().catch(() => {})
        doc.destroy()
        throw err
      }

      let synced = false
      let firstSync: () => void = () => {}
      const onStatus = ({ status: s }: { status: 'connected' | 'disconnected' | 'connecting' }) => {
        if (s === 'connected') status.set(synced ? 'online' : 'connecting')
        else if (s === 'disconnected') status.set('offline')
        // reconnect attempts while offline keep the dot offline instead of flickering
        else if (status.get() !== 'offline') status.set('connecting')
      }
      const onSync = (isSynced: boolean) => {
        synced = isSynced
        if (isSynced) {
          status.set('online')
          firstSync()
        } else if (status.get() === 'online') {
          status.set('connecting')
        }
      }
      // fresh params (e.g. a renewed token) for the next connection attempt
      const onClose = () => {
        if (opts.params) provider.params = opts.params()
      }
      // the server refused for good (shouldReconnect false, e.g. 4401 unauthorized): no more retries
      const onClosed = () => status.set('error')
      provider.on('status', onStatus)
      provider.on('sync', onSync)
      provider.on('connection-close', onClose)
      provider.on('closed', onClosed)

      if (!provider.synced) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            firstSync = () => {}
            if (!synced) status.set('offline')
            resolve()
          }, connectTimeoutMs)
          firstSync = () => {
            firstSync = () => {}
            clearTimeout(timer)
            resolve()
          }
        })
      } else {
        synced = true
        status.set('online')
      }

      let destroyed = false
      return {
        doc,
        awareness: provider.awareness,
        existed: doc.getMap('elements').size > 0,
        status,
        networked: true,
        offline: persistence !== null,
        maxInlineImageBytes,
        destroy() {
          if (destroyed) return
          destroyed = true
          status.clear()
          try {
            provider.off('status', onStatus)
            provider.off('sync', onSync)
            provider.off('connection-close', onClose)
            provider.off('closed', onClosed)
            provider.destroy()
          } catch (err) {
            console.error(err)
          }
          persistence?.destroy().catch(() => {})
          doc.destroy()
        },
      }
    },
  }
  if (opts.uploadImage) provider.uploadImage = opts.uploadImage
  if (opts.resolveImageSrc) provider.resolveImageSrc = opts.resolveImageSrc
  return provider
}
