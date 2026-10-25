import type { Awareness } from 'y-protocols/awareness'
import type * as Y from 'yjs'

/** Default `maxInlineImageBytes` of networked connections (http, websocket). */
export const DEFAULT_MAX_INLINE_IMAGE_BYTES = 256_000

export type ConnectionStatusValue = 'connecting' | 'online' | 'offline' | 'saving' | 'saved' | 'error'

/** Live connection / save state of a board (shown as a status dot in the block bar). */
export interface ConnectionStatus {
  get(): ConnectionStatusValue
  /** Subscribes to changes; returns the unsubscribe function. */
  on(cb: (status: ConnectionStatusValue) => void): () => void
}

export interface BoardConnection {
  doc: Y.Doc
  awareness?: Awareness
  /** false when nothing was stored for this id */
  existed: boolean
  status?: ConnectionStatus
  /** true when the board is shared through a server (http, websocket) */
  networked?: boolean
  /**
   * true when the connection also keeps the board in a local offline cache (http / websocket with `offline`):
   * edits the server has not acknowledged yet are not lost.
   */
  offline?: boolean
  /**
   * Networked boards without an image uploader refuse inline (data URL) images larger than this many bytes
   * (default 256 000 when `networked`).
   */
  maxInlineImageBytes?: number
  destroy(): void
}

export interface SketchProvider {
  connect(boardId: string): Promise<BoardConnection>
  savePreview?(boardId: string, preview: Blob): Promise<string>
  uploadImage?(file: File): Promise<string>
  /**
   * Maps an image element's stored src to the URL to load (an allowlist or a proxy), or null to block it (the
   * placeholder is drawn). Called before every image load and lookup, so keep it cheap and pure; the document
   * keeps the original src.
   */
  resolveImageSrc?(src: string): string | null
  /**
   * Copies board `from` into the new board `to` (clone on paste / duplicate). Optional: without it the block
   * connects to both boards and copies the Yjs state. Should reject when `from` cannot be copied.
   */
  clone?(from: string, to: string): Promise<void>
}
