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
  /**
   * An inner level closed with `endGesture` after writing: its edits were never reverted, so the outermost close
   * keeps the undo step even when it is a discard (dropping it would leave those edits in the doc, un-undoable).
   */
  private innerCommitted = false
  /** Local edits recorded on the undo stack (new or merged into the open item); compared per nesting level. */
  private edits = 0
  /** `edits` when each nested level (depth 2, 3, ...) began. */
  private readonly levelMarks: number[] = []

  constructor(store: BoardStore) {
    this.manager = new Y.UndoManager(store.doc.getMap('elements'), {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
      captureTimeout: CAPTURE_TIMEOUT,
    })
    this.manager.on('stack-item-added', this.sync)
    this.manager.on('stack-item-popped', this.sync)
    this.manager.on('stack-cleared', this.sync)
    this.manager.on('stack-item-added', this.countEdit)
    this.manager.on('stack-item-updated', this.countEdit)
  }

  /** Whether `origin` is this history's undo / redo (Yjs gives those transactions the UndoManager as origin). */
  isOwnOrigin(origin: unknown): boolean {
    return origin === this.manager
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
    if (this.depth++ > 0) {
      this.levelMarks.push(this.edits)
      return
    }
    this.manager.stopCapturing()
    this.manager.captureTimeout = Number.POSITIVE_INFINITY
    this.gestureBase = this.manager.undoStack.length
    this.discarded = false
    this.innerCommitted = false
  }

  /**
   * End the gesture: restores time-based capturing and closes the current undo step. Inside a nested gesture it
   * only leaves that level; the outermost end closes the step (or discards it when an inner level discarded).
   * With no gesture open it just closes the current step.
   */
  endGesture(): void {
    if (this.depth > 1) {
      this.depth--
      if (this.edits > (this.levelMarks.pop() ?? this.edits)) this.innerCommitted = true
      return
    }
    const discard = this.depth === 1 && this.discarded && !this.innerCommitted
    const base = this.close()
    if (discard) this.dropSince(base)
  }

  /**
   * End a gesture whose edits the caller has already reverted: closes it and drops the (net no-op) undo
   * step it produced, so the undo stack is as it was before `beginGesture`. Inside a nested gesture it only
   * marks the gesture discarded and leaves that level; the outermost close then discards. When an inner level
   * committed edits (closed with `endGesture` after writing), the outermost discard closes normally instead, so
   * those edits stay undoable.
   */
  discardGesture(): void {
    if (this.depth > 1) {
      this.depth--
      this.levelMarks.pop()
      this.discarded = true
      return
    }
    const keep = this.depth === 1 && this.innerCommitted
    const base = this.close()
    if (!keep) this.dropSince(base)
  }

  /** Runs `fn` as one gesture (begin, then end even when `fn` throws, so the nesting depth never leaks). */
  gesture<T>(fn: () => T): T {
    this.beginGesture()
    try {
      return fn()
    } finally {
      this.endGesture()
    }
  }

  /**
   * Force-closes any open gesture (all nesting levels), restoring time-based capture and closing the current step.
   * Self-heals a leaked depth (a begin whose end never ran); call it only when no gesture should be open.
   */
  resetGestures(): void {
    this.close()
  }

  /** Closes the outermost gesture (or the current step when none is open); returns its base (null = none). */
  private close(): number | null {
    const base = this.gestureBase
    this.depth = 0
    this.levelMarks.length = 0
    this.discarded = false
    this.innerCommitted = false
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
    this.manager.off('stack-item-added', this.countEdit)
    this.manager.off('stack-item-updated', this.countEdit)
    this.manager.destroy()
  }

  private readonly countEdit = (e: { type: 'undo' | 'redo' }): void => {
    if (e.type === 'undo') this.edits++
  }

  private readonly sync = (): void => {
    this.canUndo.value = this.manager.undoStack.length > 0
    this.canRedo.value = this.manager.redoStack.length > 0
  }
}
