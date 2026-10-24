import type { Box, Point } from './math'

/** Even-odd point-in-polygon test (the polygon closes implicitly; fewer than 3 points → false). */
export function pointInPolygon(p: Point, poly: readonly Point[]): boolean {
  const n = poly.length
  if (n < 3) return false
  let inside = false
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = poly[i]!
    const b = poly[j]!
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** Axis-aligned bounds of a non-empty point list. */
export function pointsBox(points: readonly Point[]): Box {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}
