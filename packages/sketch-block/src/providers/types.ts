import type { Awareness } from 'y-protocols/awareness'
import type * as Y from 'yjs'

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
  destroy(): void
}

export interface SketchProvider {
  connect(boardId: string): Promise<BoardConnection>
  savePreview?(boardId: string, preview: Blob): Promise<string>
  uploadImage?(file: File): Promise<string>
}
