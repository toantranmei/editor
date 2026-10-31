/** Point budget per chart (contract 1.7: never draw more than 5000 points). */
export const MAX_POINTS = 5000

type Point = [number, number]

const yOf = (v: number) => (Number.isFinite(v) ? v : 0)

/**
 * Indices kept by Largest-Triangle-Three-Buckets (Steinarsson 2013): always the first and last point, plus the
 * point of each bucket that forms the largest triangle with the previous kept point and the next bucket's average.
 */
export function lttbIndices(xs: ArrayLike<number>, ys: ArrayLike<number>, threshold: number): number[] {
  const n = ys.length
  if (threshold >= n || threshold <= 0) return Array.from({ length: n }, (_, i) => i)
  if (threshold === 1) return [0]
  if (threshold === 2) return [0, n - 1]
  const out = [0]
  const every = (n - 2) / (threshold - 2)
  let a = 0
  for (let i = 0; i < threshold - 2; i++) {
    // Average of the next bucket.
    const nextStart = Math.floor((i + 1) * every) + 1
    const nextEnd = Math.min(Math.floor((i + 2) * every) + 1, n)
    let avgX = 0
    let avgY = 0
    for (let j = nextStart; j < nextEnd; j++) {
      avgX += xs[j]!
      avgY += yOf(ys[j]!)
    }
    const len = nextEnd - nextStart || 1
    avgX /= len
    avgY /= len

    const start = Math.floor(i * every) + 1
    const end = Math.floor((i + 1) * every) + 1
    const ax = xs[a]!
    const ay = yOf(ys[a]!)
    let max = -1
    let pick = start
    for (let j = start; j < end; j++) {
      const area = Math.abs((ax - avgX) * (yOf(ys[j]!) - ay) - (ax - xs[j]!) * (avgY - ay))
      if (area > max) {
        max = area
        pick = j
      }
    }
    out.push(pick)
    a = pick
  }
  out.push(n - 1)
  return out
}

/**
 * Downsamples to `threshold` points with LTTB. Takes `[x, y]` pairs, or plain values (x = index).
 * Returns `[x, y]` pairs; shorter input comes back unchanged (as pairs).
 */
export function lttb(points: Point[] | number[], threshold: number): Point[] {
  const pairs: Point[] = typeof points[0] === 'number' || points.length === 0
    ? (points as number[]).map((y, i) => [i, y] as Point)
    : (points as Point[])
  const xs = pairs.map(p => p[0])
  const ys = pairs.map(p => p[1])
  return lttbIndices(xs, ys, threshold).map(i => pairs[i]!)
}
