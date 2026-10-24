import type { Point } from '../geometry'
import type { ShapeType, SketchElement } from '../model/types'
import type { PointerInput, Tool, ToolHost } from './controller'

/** Min committed size, in screen px. */
const MIN_SIZE_PX = 2

/** Normalized (w,h ≥ 0) box from the drag; Shift = square, Alt = from center. */
export function dragBox(start: Point, p: Point, square: boolean, fromCenter: boolean) {
  let dx = p.x - start.x
  let dy = p.y - start.y
  if (square) {
    const s = Math.max(Math.abs(dx), Math.abs(dy))
    dx = (dx < 0 ? -1 : 1) * s
    dy = (dy < 0 ? -1 : 1) * s
  }
  if (fromCenter) {
    const w = 2 * Math.abs(dx)
    const h = 2 * Math.abs(dy)
    return { x: start.x - w / 2, y: start.y - h / 2, w, h }
  }
  return { x: Math.min(start.x, start.x + dx), y: Math.min(start.y, start.y + dy), w: Math.abs(dx), h: Math.abs(dy) }
}

/** Drag-to-create for rectangle / ellipse / diamond. The draft stays out of Y until pointerUp. */
export class ShapeTool implements Tool {
  private start: Point | null = null
  private seed = 0

  constructor(private readonly host: ToolHost, private readonly type: ShapeType) {}

  down(_e: PointerInput, p: Point): void {
    if (this.host.ctx.readonly()) return
    this.start = p
    this.seed = Math.floor(Math.random() * 2 ** 31)
  }

  move(e: PointerInput, p: Point): void {
    if (!this.start) return
    this.host.draft = this.makeDraft(e, p)
    this.host.ctx.invalidate()
  }

  up(e: PointerInput, p: Point): void {
    if (!this.start) return
    const draft = this.makeDraft(e, p)
    this.cancel()
    const { store, history, viewport, readonly } = this.host.ctx
    const min = MIN_SIZE_PX / viewport.zoom
    if (readonly() || draft.w < min || draft.h < min) return
    const { id: _id, index: _index, seed, version: _v, ...init } = draft
    history.stopCapturing()
    const el = store.create(init)
    // keep the draft's rough outline (store.create picks its own seed); same undo step
    store.update(el.id, { seed })
    history.stopCapturing()
    this.host.setSelection([el.id])
    if (!this.host.toolLocked.value) this.host.setTool('select')
  }

  cancel(): void {
    this.start = null
    if (this.host.draft) {
      this.host.draft = null
      this.host.ctx.invalidate()
    }
  }

  private makeDraft(e: PointerInput, p: Point): SketchElement {
    const box = dragBox(this.start!, p, e.shift, e.alt)
    return {
      ...this.host.ctx.style(),
      ...box,
      id: 'draft',
      type: this.type,
      label: '',
      angle: 0,
      index: 'a0',
      seed: this.seed,
      version: 1,
      locked: false,
    }
  }
}
