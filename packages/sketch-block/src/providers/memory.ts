import * as Y from 'yjs'
import type { BoardConnection, SketchProvider } from './types'
import { assertBoardId, boardMissingError } from '../block/board-ids'

/** In-memory provider for tests and demos. */
export function memory(): SketchProvider {
  const store = new Map<string, Uint8Array>()
  return {
    async connect(boardId: string): Promise<BoardConnection> {
      assertBoardId(boardId)
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
    async clone(from: string, to: string): Promise<void> {
      assertBoardId(from)
      assertBoardId(to)
      const state = store.get(from)
      if (!state) throw boardMissingError(from)
      const doc = new Y.Doc()
      try {
        // merge (never replace) whatever `to` already holds
        const existing = store.get(to)
        if (existing) Y.applyUpdate(doc, existing)
        Y.applyUpdate(doc, state)
        store.set(to, Y.encodeStateAsUpdate(doc))
      } finally {
        doc.destroy()
      }
    },
  }
}
