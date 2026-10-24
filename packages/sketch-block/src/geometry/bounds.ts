import type { SketchElement } from '../model/types'
import { type Box, type Point, rotatePoint } from './math'

export interface RotBox { x: number; y: number; w: number; h: number; angle: number }

export function boxCenter(b: { x: number; y: number; w: number; h: number }): Point {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 }
}

/** Axis-aligned bounds of the rotated element, padded by strokeWidth / 2. */
export function elementBounds(el: SketchElement): Box {
  const c = boxCenter(el)
  const corners = [
    { x: el.x, y: el.y }, { x: el.x + el.w, y: el.y },
    { x: el.x + el.w, y: el.y + el.h }, { x: el.x, y: el.y + el.h },
  ].map(p => rotatePoint(p, c, el.angle))
  const pad = el.strokeWidth / 2
  return {
    minX: Math.min(...corners.map(p => p.x)) - pad,
    minY: Math.min(...corners.map(p => p.y)) - pad,
    maxX: Math.max(...corners.map(p => p.x)) + pad,
    maxY: Math.max(...corners.map(p => p.y)) + pad,
  }
}
