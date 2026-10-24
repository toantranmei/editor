import { kindOf } from '../elements/kind'
import type { SketchElement } from '../model/types'
import { type Box, type Point, rotatePoint } from './math'

export interface RotBox { x: number; y: number; w: number; h: number; angle: number }

export function boxCenter(b: { x: number; y: number; w: number; h: number }): Point {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 }
}

/** The 4 corners of the element's unpadded box, rotated by its angle (clockwise from top-left). */
export function elementCorners(el: RotBox): Point[] {
  const c = boxCenter(el)
  const corners = [
    { x: el.x, y: el.y }, { x: el.x + el.w, y: el.y },
    { x: el.x + el.w, y: el.y + el.h }, { x: el.x, y: el.y + el.h },
  ]
  return el.angle ? corners.map(p => rotatePoint(p, c, el.angle)) : corners
}

/** Axis-aligned bounds of the rotated element, padded by its kind's visual pad (ink beyond the box). */
export function elementBounds(el: SketchElement): Box {
  const corners = elementCorners(el)
  const pad = kindOf(el).visualPad(el)
  return {
    minX: Math.min(...corners.map(p => p.x)) - pad,
    minY: Math.min(...corners.map(p => p.y)) - pad,
    maxX: Math.max(...corners.map(p => p.x)) + pad,
    maxY: Math.max(...corners.map(p => p.y)) + pad,
  }
}
