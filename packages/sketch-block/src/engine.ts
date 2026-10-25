// Heavy part of the package (roughjs, rbush, board UI). Loaded lazily by the node view.
import { type Ref, ref, toRaw } from 'vue'
import { History } from './model/history'
import { BoardStore } from './model/store'
import type { ShapeType } from './model/types'
import type { BoardConnection } from './providers/types'

export { default as SketchBoard } from './ui/SketchBoard.vue'
export { makePreview } from './io/svg'
export { loadFonts, onFontsLoaded } from './text/fonts'
export { installRepair, REPAIR_ORIGIN } from './collab/repair'

/**
 * State that outlives one board mount: the inline board and the fullscreen board share it, so the undo stack and
 * the local view settings (zen, view mode, snapping, the shapes button's last shape) survive switching between
 * them. None of it is persisted. Boards given a session never destroy it.
 */
export interface BoardSession {
  readonly store: BoardStore
  readonly history: History
  /** Zen mode: tool bars hidden. */
  readonly zen: Ref<boolean>
  /** View mode: read-only, hand tool only. */
  readonly viewMode: Ref<boolean>
  /** Grid shown and snapped to (off by default). */
  readonly grid: Ref<boolean>
  /** Object snap (on by default). */
  readonly objectSnap: Ref<boolean>
  /** Shape last chosen from the shapes popover (null = none yet). */
  readonly lastShape: Ref<ShapeType | null>
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
    zen: ref(false),
    viewMode: ref(false),
    grid: ref(false),
    objectSnap: ref(true),
    lastShape: ref<ShapeType | null>(null),
    destroy() {
      if (destroyed) return
      destroyed = true
      history.destroy()
    },
  }
}
