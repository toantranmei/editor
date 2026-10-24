import type { SketchElement } from '../model/types'
import { boxCenter } from './bounds'
import { type Point, rotatePoint } from './math'

/** Signed-ish distance info in the local frame: inside flag and approx distance to outline. */
function shapeMetrics(type: SketchElement['type'], dx: number, dy: number, hw: number, hh: number) {
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  if (type === 'ellipse') {
    if (hw === 0 || hh === 0) return { inside: false, dist: Math.hypot(ax, ay) }
    const f = Math.sqrt((dx / hw) ** 2 + (dy / hh) ** 2)
    return { inside: f <= 1, dist: Math.abs(f - 1) * Math.min(hw, hh) }
  }
  if (type === 'diamond') {
    if (hw === 0 || hh === 0) return { inside: false, dist: Math.hypot(ax, ay) }
    const s = ax / hw + ay / hh
    return { inside: s <= 1, dist: Math.abs(s - 1) * (hw * hh) / Math.hypot(hw, hh) }
  }
  const ox = ax - hw
  const oy = ay - hh
  if (ox <= 0 && oy <= 0) return { inside: true, dist: Math.min(-ox, -oy) }
  return { inside: false, dist: Math.hypot(Math.max(ox, 0), Math.max(oy, 0)) }
}

/** `tolerance` is in scene units (caller divides by zoom). */
export function hitElement(el: SketchElement, p: Point, tolerance: number): boolean {
  const c = boxCenter(el)
  const q = rotatePoint(p, c, -el.angle)
  const m = shapeMetrics(el.type, q.x - c.x, q.y - c.y, el.w / 2, el.h / 2)
  const isFilled = el.fillStyle !== 'none' && el.fill !== 'transparent'
  if (isFilled && m.inside) return true
  return m.dist <= tolerance + el.strokeWidth / 2
}
