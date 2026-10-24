import type { Point } from '../geometry'
import { type SketchElement, STICKY_SIZE, stickyInit } from '../model/types'
import type { PointerInput, Tool, ToolHost } from './controller'
import { dragBox } from './shape'

/** A press that moves less than this (screen px) is a click: a default-size sticky centered at the pointer. */
const CLICK_PX = 4
/** Min width / height of a dragged sticky, scene units. */
export const STICKY_MIN = 40

/**
 * Sticky note: a click creates a STICKY_SIZE square centered at the pointer, a drag one of the dragged size
 * (at least STICKY_MIN), in the last used sticky color; either way its text editor opens.
 */
export class StickyTool implements Tool {
  private start: Point | null = null
  private dragging = false

  constructor(private readonly host: ToolHost) {}

  down(_e: PointerInput, p: Point): void {
    if (this.host.ctx.readonly()) return
    this.start = p
    this.dragging = false
  }

  move(e: PointerInput, p: Point): void {
    if (!this.start) return
    const { zoom } = this.host.ctx.viewport
    if (!this.dragging && Math.hypot(p.x - this.start.x, p.y - this.start.y) * zoom < CLICK_PX) return
    this.dragging = true
    this.host.draft = this.draft(this.box(e, p))
    this.host.ctx.invalidate()
  }

  up(e: PointerInput, p: Point): void {
    if (!this.start) return
    const box = this.dragging
      ? this.box(e, p)
      : { x: p.x - STICKY_SIZE / 2, y: p.y - STICKY_SIZE / 2, w: STICKY_SIZE, h: STICKY_SIZE }
    this.cancel()
    if (this.host.ctx.readonly()) return
    this.host.createSticky(box)
  }

  cancel(): void {
    this.start = null
    this.dragging = false
    if (this.host.draft) {
      this.host.draft = null
      this.host.ctx.invalidate()
    }
  }

  private box(e: PointerInput, p: Point) {
    const b = dragBox(this.start!, p, e.shift, e.alt)
    return { ...b, w: Math.max(STICKY_MIN, b.w), h: Math.max(STICKY_MIN, b.h) }
  }

  private draft(box: { x: number; y: number; w: number; h: number }): SketchElement {
    const { color, fontFamily, textAlign, opacity } = this.host.currentStyle.value
    return {
      ...stickyInit(box.x, box.y, { ...box, color, fontFamily, textAlign, opacity }),
      id: 'draft', index: 'a0', seed: 0, version: 1, groupIds: [], frameId: null,
    } as SketchElement
  }
}
