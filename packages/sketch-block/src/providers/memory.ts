import * as Y from 'yjs'
import type { BoardConnection, SketchProvider } from './types'

/** In-memory provider for tests and demos. */
export function memory(): SketchProvider {
  const store = new Map<string, Uint8Array>()
  return {
    async connect(boardId: string): Promise<BoardConnection> {
      const doc = new Y.Doc()
      const stored = store.get(boardId)
      if (stored) Y.applyUpdate(doc, stored)
      const existed = doc.getMap('elements').size > 0
      const onUpdate = () => store.set(boardId, Y.encodeStateAsUpdate(doc))
      doc.on('update', onUpdate)
      return {
        doc,
        existed,
        destroy() {
          doc.off('update', onUpdate)
          doc.destroy()
        },
      }
    },
  }
}
