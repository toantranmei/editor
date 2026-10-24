// Heavy part of the package (roughjs, rbush, board UI). Loaded lazily by the node view.
import { toRaw } from 'vue'
import { History } from './model/history'
import { BoardStore } from './model/store'
import type { BoardConnection } from './providers/types'

export { default as SketchBoard } from './ui/SketchBoard.vue'
export { makePreview } from './io/svg'
export { loadFonts, onFontsLoaded } from './text/fonts'

/**
 * Model state that outlives one board mount: the inline board and the fullscreen board share it, so the
 * undo stack survives switching between them. Boards given a session never destroy it.
 */
export interface BoardSession {
  readonly store: BoardStore
  readonly history: History
  destroy(): void
}

export function createBoardSession(connection: BoardConnection): BoardSession {
  // toRaw: Vue proxies around Yjs types break Yjs identity checks (UndoManager scope, origins)
  const doc = toRaw(toRaw(connection).doc)
  const store = new BoardStore(doc)
  const history = new History(store)
  let destroyed = false
  return {
    store,
    history,
    destroy() {
      if (destroyed) return
      destroyed = true
      history.destroy()
    },
  }
}
