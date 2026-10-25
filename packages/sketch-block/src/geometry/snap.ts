import type { Box, Point } from './math'

/** Grid cell, scene units (the static layer draws the same grid). */
export const GRID_SIZE = 20
/** Object snap distance, screen px (divided by zoom → scene units). */
export const SNAP_PX = 6

/** A snap guide line, scene coords. */
export interface Guide { x1: number; y1: number; x2: number; y2: number }

/** Matching tolerance when collecting the guides of a chosen snap. */
const EPS = 1e-6

/** `v` rounded to the nearest multiple of `grid`. */
export function snapValue(v: number, grid: number): number {
  return Math.round(v / grid) * grid
}

/** `p` rounded to the grid (unchanged without one). */
export function snapPoint(p: Point, grid: number | null): Point {
  return grid ? { x: snapValue(p.x, grid), y: snapValue(p.y, grid) } : p
}

const xs = (b: Box): number[] => [b.minX, (b.minX + b.maxX) / 2, b.maxX]
const ys = (b: Box): number[] => [b.minY, (b.minY + b.maxY) / 2, b.maxY]

/** Smallest offset (|d| ≤ threshold) bringing one of `values` onto one of `targets`; null when none is close enough. */
function bestDelta(values: readonly number[], targets: readonly number[], threshold: number): number | null {
  let best: number | null = null
  for (const v of values) {
    for (const t of targets) {
      const d = t - v
      if (Math.abs(d) <= threshold && (best === null || Math.abs(d) < Math.abs(best))) best = d
    }
  }
  return best
}

/**
 * Guides for `values` (already snapped) on one axis: one line per value that some candidate shares, spanning the
 * moving extent and every candidate sharing it. `vertical` = lines at an x (span along y).
 */
function axisGuides(
  values: readonly number[], span: [number, number], candidates: readonly Box[], vertical: boolean,
): Guide[] {
  const out: Guide[] = []
  const seen = new Set<number>()
  for (const v of values) {
    if (seen.has(v)) continue
    let lo = span[0]
    let hi = span[1]
    let hit = false
    for (const c of candidates) {
      if (!(vertical ? xs(c) : ys(c)).some(t => Math.abs(t - v) <= EPS)) continue
      hit = true
      lo = Math.min(lo, vertical ? c.minY : c.minX)
      hi = Math.max(hi, vertical ? c.maxY : c.maxX)
    }
    if (!hit) continue
    seen.add(v)
    out.push(vertical ? { x1: v, y1: lo, x2: v, y2: hi } : { x1: lo, y1: v, x2: hi, y2: v })
  }
  return out
}

/**
 * Offset aligning `moving`'s left / center / right and top / middle / bottom with the nearest such edge of a
 * candidate within `threshold` (per axis, 0 when nothing is close), plus the guides of the alignment.
 */
export function snapMove(moving: Box, candidates: readonly Box[], threshold: number): { dx: number; dy: number; guides: Guide[] } {
  return new Snapper(candidates, null, threshold).move(moving)
}

function guidesFor(m: Box, candidates: readonly Box[], onX: boolean, onY: boolean): Guide[] {
  return [
    ...(onX ? axisGuides(xs(m), [m.minY, m.maxY], candidates, true) : []),
    ...(onY ? axisGuides(ys(m), [m.minX, m.maxX], candidates, false) : []),
  ]
}

/**
 * Snapping for one gesture: the candidate boxes (built once, at the gesture's start), the grid (null = off) and
 * whether object snap is on. Per axis, an object snap within `threshold` wins; otherwise the grid applies.
 */
export class Snapper {
  private readonly tx: number[]
  private readonly ty: number[]

  constructor(
    private readonly candidates: readonly Box[],
    private readonly grid: number | null,
    private readonly threshold: number,
  ) {
    this.tx = candidates.flatMap(xs)
    this.ty = candidates.flatMap(ys)
  }

  /** Nothing to snap to: callers can skip the work. */
  get idle(): boolean {
    return !this.grid && !this.candidates.length
  }

  /** Offset to apply to a box being moved: object alignment, else its top-left on the grid. */
  move(b: Box): { dx: number; dy: number; guides: Guide[] } {
    const ox = bestDelta(xs(b), this.tx, this.threshold)
    const oy = bestDelta(ys(b), this.ty, this.threshold)
    const g = this.grid
    const dx = ox ?? (g ? snapValue(b.minX, g) - b.minX : 0)
    const dy = oy ?? (g ? snapValue(b.minY, g) - b.minY : 0)
    const m: Box = { minX: b.minX + dx, minY: b.minY + dy, maxX: b.maxX + dx, maxY: b.maxY + dy }
    return { dx, dy, guides: guidesFor(m, this.candidates, ox !== null, oy !== null) }
  }

  /** `p` snapped on the axes asked for (a moving edge or corner): onto a candidate edge, else the grid. */
  point(p: Point, axes: { x: boolean; y: boolean } = { x: true, y: true }): { p: Point; guides: Guide[] } {
    const g = this.grid
    const ox = axes.x ? bestDelta([p.x], this.tx, this.threshold) : null
    const oy = axes.y ? bestDelta([p.y], this.ty, this.threshold) : null
    const x = !axes.x ? p.x : ox !== null ? p.x + ox : g ? snapValue(p.x, g) : p.x
    const y = !axes.y ? p.y : oy !== null ? p.y + oy : g ? snapValue(p.y, g) : p.y
    const at: Box = { minX: x, minY: y, maxX: x, maxY: y }
    return { p: { x, y }, guides: guidesFor(at, this.candidates, ox !== null, oy !== null) }
  }
}
