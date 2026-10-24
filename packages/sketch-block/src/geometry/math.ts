export interface Point { x: number; y: number }
export interface Box { minX: number; minY: number; maxX: number; maxY: number }

export function rotatePoint(p: Point, center: Point, angle: number): Point {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const dx = p.x - center.x
  const dy = p.y - center.y
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos }
}

export function boxesIntersect(a: Box, b: Box): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY
}

export function boxContains(outer: Box, inner: Box): boolean {
  return outer.minX <= inner.minX && outer.minY <= inner.minY && outer.maxX >= inner.maxX && outer.maxY >= inner.maxY
}

/** Shortest distance from `p` to the polyline through `points` (a single point → distance to it; none → Infinity). */
export function polylineDistance(points: readonly (readonly [number, number])[], p: Point): number {
  if (points.length === 0) return Infinity
  const [x0, y0] = points[0]!
  let best = Math.hypot(p.x - x0, p.y - y0)
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1]!
    const [bx, by] = points[i]!
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / len2))
    best = Math.min(best, Math.hypot(p.x - (ax + t * dx), p.y - (ay + t * dy)))
  }
  return best
}

/**
 * Scales local points from the box `w × h` to `next.w × next.h`. An axis of zero size has no scale
 * to apply, so its coordinates are kept.
 */
export function scalePoints<P extends readonly [number, number]>(
  points: readonly P[],
  from: { w: number; h: number },
  next: { w: number; h: number },
): [number, number][] {
  const sx = from.w === 0 ? 1 : next.w / from.w
  const sy = from.h === 0 ? 1 : next.h / from.h
  return points.map(([x, y]) => [x * sx, y * sy])
}
