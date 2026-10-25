import { kindOf } from '../elements/kind'
import type { SketchElement } from '../model/types'
import { boxCenter } from './bounds'
import { type Point, rotatePoint } from './math'

/** `tolerance` is in scene units (caller divides by zoom). */
export function hitElement(el: SketchElement, p: Point, tolerance: number): boolean {
  const q = rotatePoint(p, boxCenter(el), -el.angle)
  return kindOf(el).hit(el, { x: q.x - el.x, y: q.y - el.y }, tolerance)
}
