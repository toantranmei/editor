import { IndexeddbPersistence } from 'y-indexeddb'
import * as Y from 'yjs'
import type { BoardConnection, SketchProvider } from './types'

/** Persists each board in its own IndexedDB database `${prefix}:${boardId}`. */
export function indexeddb(opts: { prefix?: string } = {}): SketchProvider {
  const prefix = opts.prefix ?? 'mei-sketch'
  return {
    async connect(boardId: string): Promise<BoardConnection> {
      const doc = new Y.Doc()
      const persistence = new IndexeddbPersistence(`${prefix}:${boardId}`, doc)
      try {
        await persistence.whenSynced
      } catch (err) {
        persistence.destroy().catch(() => {})
        doc.destroy()
        throw err
      }
      return {
        doc,
        existed: doc.getMap('elements').size > 0,
        destroy() {
          persistence.destroy().catch(() => {})
          doc.destroy()
        },
      }
    },
  }
}
