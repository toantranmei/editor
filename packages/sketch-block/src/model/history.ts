import { type Ref, ref } from 'vue'
import * as Y from 'yjs'
import { LOCAL_ORIGIN, type BoardStore } from './store'

const CAPTURE_TIMEOUT = 300

/** Local-only undo/redo: only transactions with LOCAL_ORIGIN are tracked. */
export class History {
  readonly canUndo: Ref<boolean> = ref(false)
  readonly canRedo: Ref<boolean> = ref(false)
  private readonly manager: Y.UndoManager
  /** Undo stack depth when the current gesture began (null = no gesture). */
  private gestureBase: number | null = null

  constructor(store: BoardStore) {
    this.manager = new Y.UndoManager(store.doc.getMap('elements'), {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
      captureTimeout: CAPTURE_TIMEOUT,
    })
    this.manager.on('stack-item-added', this.sync)
    this.manager.on('stack-item-popped', this.sync)
    this.manager.on('stack-cleared', this.sync)
  }

  undo(): void {
    this.manager.undo()
    this.sync()
  }

  redo(): void {
    this.manager.redo()
    this.sync()
  }

  stopCapturing(): void {
    this.manager.stopCapturing()
  }

  /** Start a continuous gesture: every edit until `endGesture` is one undo step, however long the pauses. */
  beginGesture(): void {
    this.manager.stopCapturing()
    this.manager.captureTimeout = Number.POSITIVE_INFINITY
    this.gestureBase = this.manager.undoStack.length
  }

  /** End the gesture: restores time-based capturing and closes the current undo step. */
  endGesture(): void {
    this.manager.captureTimeout = CAPTURE_TIMEOUT
    this.manager.stopCapturing()
    this.gestureBase = null
  }

  /**
   * End a gesture whose edits the caller has already reverted: closes it and drops the (net no-op) undo
   * step it produced, so the undo stack is as it was before `beginGesture`.
   */
  discardGesture(): void {
    const base = this.gestureBase
    this.endGesture()
    if (base === null) return
    const stack = this.manager.undoStack
    if (stack.length > base) stack.splice(base)
    this.sync()
  }

  destroy(): void {
    this.manager.off('stack-item-added', this.sync)
    this.manager.off('stack-item-popped', this.sync)
    this.manager.off('stack-cleared', this.sync)
    this.manager.destroy()
  }

  private readonly sync = (): void => {
    this.canUndo.value = this.manager.undoStack.length > 0
    this.canRedo.value = this.manager.redoStack.length > 0
  }
}
