import type { Awareness } from 'y-protocols/awareness'
import type * as Y from 'yjs'

export interface BoardConnection {
  doc: Y.Doc
  awareness?: Awareness
  /** false when nothing was stored for this id */
  existed: boolean
  destroy(): void
}

export interface SketchProvider {
  connect(boardId: string): Promise<BoardConnection>
  savePreview?(boardId: string, preview: Blob): Promise<string>
  uploadImage?(file: File): Promise<string>
}
