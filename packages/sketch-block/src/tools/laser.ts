import type { Point } from '../geometry'
import type { PointerInput, Tool, ToolHost } from './controller'

/** A trail point in scene coords; `t` is the host clock time it was added; `start` begins a new stroke. */
export interface LaserPoint {
  x: number
  y: number
  t: number
  start?: boolean
}

/** How long a trail point stays visible (it fades linearly to 0 over this time). */
export const LASER_FADE_MS = 1000

/** Laser pointer: appends trail points while down. Nothing is written to Y; the trail expires on its own. */
export class LaserTool implements Tool {
  private down_ = false

  constructor(private readonly host: ToolHost) {}

  down(_e: PointerInput, p: Point): void {
    this.down_ = true
    this.add(p, true)
  }

  move(e: PointerInput, p: Point): void {
    if (!this.down_) return
    const { viewport } = this.host.ctx
    if (e.coalesced?.length) for (const s of e.coalesced) this.add(viewport.toScene(s), false)
    else this.add(p, false)
  }

  up(_e: PointerInput, p: Point): void {
    if (!this.down_) return
    this.add(p, false)
    this.down_ = false
  }

  cancel(): void {
    this.down_ = false
  }

  private add(p: Point, start: boolean): void {
    const trail = this.host.laser
    const last = trail[trail.length - 1]
    const t = this.host.now()
    if (!start && last && last.x === p.x && last.y === p.y) {
      last.t = t
    } else {
      trail.push(start ? { x: p.x, y: p.y, t, start: true } : { x: p.x, y: p.y, t })
    }
    this.host.ctx.invalidate()
  }
}
