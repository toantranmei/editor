import { boxFromPoints } from '../elements/linear'
import { type Point, snapSegment } from '../geometry'
import { DEFAULT_STYLE, type LinearElement, type LocalPoint, TYPE_DEFAULTS } from '../model/types'
import type { PointerInput, Tool, ToolHost } from './controller'

/** A press that travels farther than this (screen px) is a drag; less is a click. */
const DRAG_PX = 4
/** Clicking within this distance (screen px) of the last point finishes a multi-point draft. */
const FINISH_PX = 8

type LinearType = LinearElement['type']
type LinearStyle = Pick<LinearElement, 'routing' | 'startArrowhead' | 'endArrowhead'>

const samePoint = (a: LocalPoint, b: LocalPoint): boolean => a[0] === b[0] && a[1] === b[1]

/**
 * Line / arrow. Drag A→B creates a 2-point element. A click instead starts a multi-point draft: each further
 * click adds a point (with a live preview segment to the pointer) until Enter, Escape or a click on the last
 * point finishes it. The draft stays out of Y; finishing commits one element (one undo step). Shift snaps the
 * segment being drawn to 15°.
 */
export class LinearTool implements Tool {
  /** Absolute scene points placed so far (null = idle). */
  private pts: LocalPoint[] | null = null
  /** The multi-point draft is open between clicks. */
  private multi = false
  private pressed = false
  private downAt: Point = { x: 0, y: 0 }
  private seed = 0

  constructor(private readonly host: ToolHost, private readonly type: LinearType) {}

  /** A multi-point draft is open (spans several clicks; the controller treats it as an active gesture). */
  pending(): boolean {
    return this.multi
  }

  down(_e: PointerInput, p: Point): void {
    if (this.host.ctx.readonly()) return
    this.pressed = true
    this.downAt = p
    if (this.pts) return
    this.pts = [[p.x, p.y]]
    this.seed = Math.floor(Math.random() * 2 ** 31)
  }

  move(e: PointerInput, p: Point): void {
    if (!this.pts) return
    if (this.multi) {
      this.hover(e, p)
      return
    }
    // first press being dragged: a 2-point draft
    const end = this.target(e, p)
    this.setDraft([...this.pts, [end.x, end.y]])
  }

  up(e: PointerInput, p: Point): void {
    if (!this.pts || !this.pressed) return
    this.pressed = false
    const zoom = this.host.ctx.viewport.zoom
    const end = this.target(e, p)
    if (!this.multi) {
      if (Math.hypot(p.x - this.downAt.x, p.y - this.downAt.y) > DRAG_PX / zoom) {
        this.pts.push([end.x, end.y])
        this.finish()
        return
      }
      // a click: open the multi-point draft
      this.multi = true
      this.hover(e, p)
      return
    }
    const last = this.pts[this.pts.length - 1]!
    if (Math.hypot(p.x - last[0], p.y - last[1]) <= FINISH_PX / zoom) {
      this.finish()
      return
    }
    this.pts.push([end.x, end.y])
    this.hover(e, p)
  }

  hover(e: PointerInput, p: Point): void {
    if (!this.multi || !this.pts) return
    const last = this.pts[this.pts.length - 1]!
    const end = this.target(e, p)
    this.host.previewSegment = [{ x: last[0], y: last[1] }, end]
    this.setDraft(this.pts)
  }

  /** Commits the draft if it has at least 2 distinct points, then resets (and leaves the tool unless locked). */
  finish(): void {
    const pts = this.pts
    const seed = this.seed
    this.cancel()
    if (!pts) return
    const distinct = pts.filter((pt, i) => i === 0 || !samePoint(pt, pts[i - 1]!))
    const { store, history, readonly } = this.host.ctx
    if (distinct.length < 2 || readonly()) return
    history.beginGesture()
    const el = store.create({ ...this.props(), ...boxFromPoints(distinct), seed })
    this.host.created([el.id])
    history.endGesture()
    this.host.setSelection([el.id])
    if (!this.host.toolLocked.value) this.host.setTool('select')
  }

  cancel(): void {
    this.pts = null
    this.multi = false
    this.pressed = false
    if (this.host.draft || this.host.previewSegment) {
      this.host.draft = null
      this.host.previewSegment = null
      this.host.ctx.invalidate()
    }
  }

  /** Pointer position for the next point; Shift snaps the segment from the last placed point to 15°. */
  private target(e: PointerInput, p: Point): Point {
    const last = this.pts?.[this.pts.length - 1]
    return e.shift && last ? snapSegment({ x: last[0], y: last[1] }, p) : p
  }

  /**
   * Style for the element: the current style, routing included. Arrows take the current arrowheads; a line keeps
   * its type defaults (none), so drawing a line never sprouts the arrow tool's heads.
   */
  private props() {
    const style = this.host.currentStyle.value
    const heads: Pick<LinearStyle, 'startArrowhead' | 'endArrowhead'> = this.type === 'arrow' ? style : TYPE_DEFAULTS.line as LinearStyle
    // lines and arrows have no background: they never take the current fill
    const { stroke, strokeWidth, strokeStyle, roughness, roundness, opacity, fontFamily, fontSize, textAlign } = style
    const { fill, fillStyle } = DEFAULT_STYLE
    return {
      stroke, fill, fillStyle, strokeWidth, strokeStyle, roughness, roundness, opacity, fontFamily, fontSize, textAlign,
      label: '',
      startBinding: null,
      endBinding: null,
      groupIds: [],
      frameId: null,
      routing: style.routing,
      startArrowhead: heads.startArrowhead,
      endArrowhead: heads.endArrowhead,
      type: this.type,
      angle: 0,
      locked: false,
    }
  }

  private setDraft(abs: LocalPoint[]): void {
    const draft: LinearElement | null = abs.length < 2
      ? null
      : { ...this.props(), ...boxFromPoints(abs), id: 'draft', index: 'a0', seed: this.seed, version: 1 }
    this.host.draft = draft
    this.host.ctx.invalidate()
  }
}
