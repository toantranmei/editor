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
  /** Open gesture nesting depth (0 = none). */
  private depth = 0
  /** An inner level of the open gesture was discarded: the outermost close discards the whole gesture. */
  private discarded = false

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

  /**
   * Start a continuous gesture: every edit until the matching `endGesture` is one undo step, however long the
   * pauses. Reentrant: a begin inside an open gesture only nests (the outermost begin / end bracket the step).
   */
  beginGesture(): void {
    if (this.depth++ > 0) return
    this.manager.stopCapturing()
    this.manager.captureTimeout = Number.POSITIVE_INFINITY
    this.gestureBase = this.manager.undoStack.length
    this.discarded = false
  }

  /**
   * End the gesture: restores time-based capturing and closes the current undo step. Inside a nested gesture it
   * only leaves that level; the outermost end closes the step (or discards it when an inner level discarded).
   * With no gesture open it just closes the current step.
   */
  endGesture(): void {
    if (this.depth > 1) {
      this.depth--
      return
    }
    const discard = this.depth === 1 && this.discarded
    const base = this.close()
    if (discard) this.dropSince(base)
  }

  /**
   * End a gesture whose edits the caller has already reverted: closes it and drops the (net no-op) undo
   * step it produced, so the undo stack is as it was before `beginGesture`. Inside a nested gesture it only
   * marks the gesture discarded and leaves that level; the outermost close then discards.
   */
  discardGesture(): void {
    if (this.depth > 1) {
      this.depth--
      this.discarded = true
      return
    }
    this.dropSince(this.close())
  }

  /** Closes the outermost gesture (or the current step when none is open); returns its base (null = none). */
  private close(): number | null {
    const base = this.gestureBase
    this.depth = 0
    this.discarded = false
    this.gestureBase = null
    this.manager.captureTimeout = CAPTURE_TIMEOUT
    this.manager.stopCapturing()
    return base
  }

  /** Drops the undo steps added since stack depth `base` (null = no gesture: nothing). */
  private dropSince(base: number | null): void {
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
