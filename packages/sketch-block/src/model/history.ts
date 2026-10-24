import { type Ref, ref } from 'vue'
import * as Y from 'yjs'
import { LOCAL_ORIGIN, type BoardStore } from './store'

const CAPTURE_TIMEOUT = 300

/** Local-only undo/redo: only transactions with LOCAL_ORIGIN are tracked. */
export class History {
  readonly canUndo: Ref<boolean> = ref(false)
  readonly canRedo: Ref<boolean> = ref(false)
  private readonly manager: Y.UndoManager

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
  }

  /** End the gesture: restores time-based capturing and closes the current undo step. */
  endGesture(): void {
    this.manager.captureTimeout = CAPTURE_TIMEOUT
    this.manager.stopCapturing()
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
