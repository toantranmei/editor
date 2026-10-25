import { FRAME_MIN } from '../elements/frame'
import type { Point } from '../geometry'
import { DEFAULT_STYLE, type SketchElement } from '../model/types'
import type { Snapper } from '../geometry/snap'
import type { PointerInput, Tool, ToolHost } from './controller'
import { dragBox, snapCorner } from './shape'

/** A press that moves less than this (screen px) is a click: no frame. */
const CLICK_PX = 4

/**
 * Frame tool (F): drag to create a frame (at least FRAME_MIN square units) named "Frame N"; it goes to the back
 * and takes in the elements inside it. The draft stays out of Y until pointerUp.
 */
export class FrameTool implements Tool {
  private start: Point | null = null
  private dragging = false
  private snap: Snapper | null = null
  /** Raw press point (click detection ignores snapping). */
  private downAt: Point = { x: 0, y: 0 }

  constructor(private readonly host: ToolHost) {}

  down(e: PointerInput, p: Point): void {
    if (this.host.ctx.readonly()) return
    this.downAt = p
    this.snap = this.host.snapper()
    this.start = e.alt || this.snap.idle ? p : this.snap.point(p).p
    this.dragging = false
  }

  move(e: PointerInput, p: Point): void {
    if (!this.start) return
    const { zoom } = this.host.ctx.viewport
    if (!this.dragging && Math.hypot(p.x - this.downAt.x, p.y - this.downAt.y) * zoom < CLICK_PX) return
    this.dragging = true
    this.host.draft = this.draft(this.box(e, p))
    this.host.ctx.invalidate()
  }

  up(e: PointerInput, p: Point): void {
    if (!this.start) return
    const dragging = this.dragging || Math.hypot(p.x - this.downAt.x, p.y - this.downAt.y) * this.host.ctx.viewport.zoom >= CLICK_PX
    const box = dragging ? this.box(e, p) : null
    this.cancel()
    if (!box || this.host.ctx.readonly()) return
    this.host.createFrame(box)
  }

  cancel(): void {
    this.start = null
    this.dragging = false
    this.snap = null
    if (this.host.draft) {
      this.host.draft = null
      this.host.ctx.invalidate()
    }
  }

  private box(e: PointerInput, p: Point) {
    const b = dragBox(this.start!, snapCorner(this.host, this.snap, e, p), e.shift, e.alt)
    return { ...b, w: Math.max(FRAME_MIN, b.w), h: Math.max(FRAME_MIN, b.h) }
  }

  private draft(box: { x: number; y: number; w: number; h: number }): SketchElement {
    return {
      ...DEFAULT_STYLE, ...box, type: 'frame', name: '', angle: 0, locked: false,
      id: 'draft', index: 'a0', seed: 0, version: 1, groupIds: [], frameId: null, link: null,
    }
  }
}
