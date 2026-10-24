import type { LocalPoint, ShapeType } from '../model/types'

/**
 * A shape's outline in its local box (0,0)–(w,h): a polygon, or an SVG path (closed) plus a polygon sampled from it
 * for hit-testing. `detail` is extra stroke-only path data drawn on top (the cylinder's front cap edge).
 */
export type ShapeOutline =
  | { kind: 'polygon'; points: LocalPoint[] }
  | { kind: 'path'; d: string; hitPolygon: LocalPoint[]; detail?: string }

/** Segments each curve is sampled into for `hitPolygon`. */
const CURVE_SEGMENTS = 24
const DEG = Math.PI / 180

/** Path-data number: 3 decimals, never exponent notation. */
const f = (n: number): string => String(Math.round(n * 1000) / 1000)
/** Arc radius for path data, rounded up so rounding never makes it shorter than the chord needs. */
const r = (n: number): string => String(Math.ceil(n * 1000) / 1000)

/** Points of the axis-aligned ellipse arc (center c, radii rx/ry) from angle a0 to a1 (radians), start excluded. */
function arcPoints(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number): LocalPoint[] {
  const out: LocalPoint[] = []
  for (let i = 1; i <= CURVE_SEGMENTS; i++) {
    const a = a0 + ((a1 - a0) * i) / CURVE_SEGMENTS
    out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)])
  }
  return out
}

/** Points of the quadratic Bézier p0 → p2 (control p1), start excluded. */
function quadPoints(p0: LocalPoint, p1: LocalPoint, p2: LocalPoint): LocalPoint[] {
  const out: LocalPoint[] = []
  for (let i = 1; i <= CURVE_SEGMENTS; i++) {
    const t = i / CURVE_SEGMENTS
    const u = 1 - t
    out.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]])
  }
  return out
}

/** Maps unit-space points onto the box so their bounds fill it exactly. */
function fitToBox(unit: LocalPoint[], w: number, h: number): LocalPoint[] {
  const clean = unit.map(([x, y]): LocalPoint => [Math.round(x * 1e12) / 1e12, Math.round(y * 1e12) / 1e12])
  const xs = clean.map(p => p[0])
  const ys = clean.map(p => p[1])
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const sx = Math.max(...xs) - minX
  const sy = Math.max(...ys) - minY
  return clean.map(([x, y]) => [((x - minX) / sx) * w, ((y - minY) / sy) * h])
}

/** Regular polygon / star vertices (first vertex at the top), radius per vertex index. */
function radial(n: number, radius: (i: number) => number, w: number, h: number): LocalPoint[] {
  const unit: LocalPoint[] = []
  for (let i = 0; i < n; i++) {
    const a = (-90 + (360 / n) * i) * DEG
    unit.push([radius(i) * Math.cos(a), radius(i) * Math.sin(a)])
  }
  return fitToBox(unit, w, h)
}

/** Half extents of the unit cloud: six semicircles on the chords of a unit hexagon (anchors at 0°, 60°, …). */
const CLOUD_X = 1.25
const CLOUD_Y = (Math.sqrt(3) + 1) / 2

function cloud(w: number, h: number): ShapeOutline {
  const sx = w / 2 / CLOUD_X
  const sy = h / 2 / CLOUD_Y
  const anchor = (k: number): LocalPoint => [w / 2 + Math.cos(k * 60 * DEG) * sx, h / 2 + Math.sin(k * 60 * DEG) * sy]
  const rx = sx / 2
  const ry = sy / 2
  const start = anchor(0)
  let d = `M ${f(start[0])} ${f(start[1])}`
  const hit: LocalPoint[] = [start]
  for (let k = 0; k < 6; k++) {
    // semicircle centered on the chord midpoint (distance cos 30° from the center), bulging outward
    const mid = (k * 60 + 30) * DEG
    const cx = w / 2 + Math.cos(mid) * (Math.sqrt(3) / 2) * sx
    const cy = h / 2 + Math.sin(mid) * (Math.sqrt(3) / 2) * sy
    const end = anchor(k + 1)
    d += ` A ${r(rx)} ${r(ry)} 0 0 1 ${f(end[0])} ${f(end[1])}`
    hit.push(...arcPoints(cx, cy, rx, ry, mid - 90 * DEG, mid + 90 * DEG))
  }
  hit.pop() // the last arc ends on the start point
  return { kind: 'path', d: `${d} Z`, hitPolygon: hit }
}

function cylinder(w: number, h: number): ShapeOutline {
  const rx = w / 2
  const ry = Math.min(h * 0.2, 24) / 2
  const d = `M 0 ${f(ry)} A ${r(rx)} ${r(ry)} 0 0 1 ${f(w)} ${f(ry)} L ${f(w)} ${f(h - ry)}`
    + ` A ${r(rx)} ${r(ry)} 0 0 1 0 ${f(h - ry)} Z`
  const hit: LocalPoint[] = [
    [0, ry],
    ...arcPoints(rx, ry, rx, ry, Math.PI, 2 * Math.PI),
    [w, h - ry],
    ...arcPoints(rx, h - ry, rx, ry, 0, Math.PI),
  ]
  hit.pop() // back at (0, h - ry); the polygon closes to (0, ry)
  hit.push([0, h - ry])
  return { kind: 'path', d, hitPolygon: hit, detail: `M 0 ${f(ry)} A ${r(rx)} ${r(ry)} 0 0 0 ${f(w)} ${f(ry)}` }
}

function stadium(w: number, h: number): ShapeOutline {
  const rx = Math.min(h / 2, w / 2)
  const ry = h / 2
  const d = `M ${f(rx)} 0 L ${f(w - rx)} 0 A ${r(rx)} ${r(ry)} 0 0 1 ${f(w - rx)} ${f(h)} L ${f(rx)} ${f(h)}`
    + ` A ${r(rx)} ${r(ry)} 0 0 1 ${f(rx)} 0 Z`
  const hit: LocalPoint[] = [
    [rx, 0],
    [w - rx, 0],
    ...arcPoints(w - rx, ry, rx, ry, -Math.PI / 2, Math.PI / 2),
    [rx, h],
    ...arcPoints(rx, ry, rx, ry, Math.PI / 2, 1.5 * Math.PI),
  ]
  hit.pop() // back at the start
  return { kind: 'path', d, hitPolygon: hit }
}

function documentShape(w: number, h: number): ShapeOutline {
  const a = h * 0.08
  const yb = h - a
  // two quadratics with control offset 2a peak at ±a around the baseline
  const c1: LocalPoint = [w * 0.75, yb - 2 * a]
  const m: LocalPoint = [w * 0.5, yb]
  const c2: LocalPoint = [w * 0.25, yb + 2 * a]
  const d = `M 0 0 L ${f(w)} 0 L ${f(w)} ${f(yb)} Q ${f(c1[0])} ${f(c1[1])} ${f(m[0])} ${f(m[1])}`
    + ` Q ${f(c2[0])} ${f(c2[1])} 0 ${f(yb)} Z`
  const hit: LocalPoint[] = [[0, 0], [w, 0], [w, yb], ...quadPoints([w, yb], c1, m), ...quadPoints(m, c2, [0, yb])]
  return { kind: 'path', d, hitPolygon: hit }
}

function ellipse(w: number, h: number): ShapeOutline {
  const rx = w / 2
  const ry = h / 2
  const d = `M 0 ${f(ry)} A ${r(rx)} ${r(ry)} 0 1 1 ${f(w)} ${f(ry)} A ${r(rx)} ${r(ry)} 0 1 1 0 ${f(ry)} Z`
  const hit: LocalPoint[] = [[0, ry], ...arcPoints(rx, ry, rx, ry, Math.PI, 3 * Math.PI)]
  hit.pop()
  return { kind: 'path', d, hitPolygon: hit }
}

/** The outline of a `type` shape filling the box (0,0)–(w,h). */
export function shapeOutline(type: ShapeType, w: number, h: number): ShapeOutline {
  const poly = (points: LocalPoint[]): ShapeOutline => ({ kind: 'polygon', points })
  switch (type) {
    case 'rectangle':
      return poly([[0, 0], [w, 0], [w, h], [0, h]])
    case 'ellipse':
      return ellipse(w, h)
    case 'diamond':
      return poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]])
    case 'triangle':
      return poly([[w / 2, 0], [w, h], [0, h]])
    case 'pentagon':
      return poly(radial(5, () => 1, w, h))
    case 'hexagon':
      return poly([[w * 0.25, 0], [w * 0.75, 0], [w, h / 2], [w * 0.75, h], [w * 0.25, h], [0, h / 2]])
    case 'star':
      return poly(radial(10, i => (i % 2 ? 0.5 : 1), w, h))
    case 'parallelogram': {
      const s = w * 0.2
      return poly([[s, 0], [w, 0], [w - s, h], [0, h]])
    }
    case 'trapezoid': {
      const s = w * 0.2
      return poly([[s, 0], [w - s, 0], [w, h], [0, h]])
    }
    case 'callout': {
      // body is the top 80%; the tail (20% of the width) drops into the bottom 20% at the left
      const b = h * 0.8
      return poly([[0, 0], [w, 0], [w, b], [w * 0.3, b], [w * 0.1, h], [w * 0.1, b], [0, b]])
    }
    case 'blockArrow': {
      const hx = w * 0.65
      return poly([[0, h * 0.25], [hx, h * 0.25], [hx, 0], [w, h / 2], [hx, h], [hx, h * 0.75], [0, h * 0.75]])
    }
    case 'cylinder':
      return cylinder(w, h)
    case 'cloud':
      return cloud(w, h)
    case 'document':
      return documentShape(w, h)
    case 'stadium':
      return stadium(w, h)
  }
}

/** The outline as a closed polygon (implicitly closed: the last point connects to the first). */
export function outlinePoints(o: ShapeOutline): LocalPoint[] {
  return o.kind === 'polygon' ? o.points : o.hitPolygon
}
