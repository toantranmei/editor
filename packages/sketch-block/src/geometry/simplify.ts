import type { LocalPoint } from '../model/types'

/** Squared distance from p to segment a–b. */
function segDist2(p: LocalPoint, a: LocalPoint, b: LocalPoint): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2))
  const ex = p[0] - (a[0] + t * dx)
  const ey = p[1] - (a[1] + t * dy)
  return ex * ex + ey * ey
}

/**
 * Ramer–Douglas–Peucker: drops points closer than `tolerance` to the simplified polyline.
 * Keeps the first and last point; iterative, so long strokes cannot overflow the stack.
 */
export function simplify(points: LocalPoint[], tolerance: number): LocalPoint[] {
  return simplifyIndices(points, tolerance).map(i => points[i]!)
}

/** Ramer–Douglas–Peucker like `simplify`, returning the ascending indices of the kept points. */
export function simplifyIndices(points: readonly LocalPoint[], tolerance: number): number[] {
  const n = points.length
  if (n <= 2) return Array.from({ length: n }, (_, i) => i)
  const keep = new Uint8Array(n)
  keep[0] = keep[n - 1] = 1
  const tol2 = tolerance * tolerance
  const stack: [number, number][] = [[0, n - 1]]
  while (stack.length) {
    const [first, last] = stack.pop()!
    let maxD = -1
    let idx = -1
    for (let i = first + 1; i < last; i++) {
      const d = segDist2(points[i]!, points[first]!, points[last]!)
      if (d > maxD) {
        maxD = d
        idx = i
      }
    }
    if (idx !== -1 && maxD > tol2) {
      keep[idx] = 1
      stack.push([first, idx], [idx, last])
    }
  }
  const out: number[] = []
  for (let i = 0; i < n; i++) if (keep[i]) out.push(i)
  return out
}
