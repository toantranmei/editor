import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { outlineToPath, strokeOutline, strokeSize } from '../src/elements/freedraw'
import { kindOf, shapeKeyOf } from '../src/elements/kind'
import { polylineDistance } from '../src/geometry/math'
import { simplify, simplifyIndices } from '../src/geometry/simplify'
import { DEFAULT_STYLE, type FreedrawElement, type LocalPoint } from '../src/model/types'
import { type FakeCtx, stubCanvas } from './helpers/canvas'

beforeEach(() => stubCanvas())
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const fd = (over: Partial<FreedrawElement> = {}): FreedrawElement => ({
  id: 'f', type: 'freedraw', x: 0, y: 0, w: 100, h: 50, angle: 0, index: 'a0',
  ...DEFAULT_STYLE, seed: 7, version: 1, locked: false,
  points: [[0, 0], [50, 50], [100, 0]], pressures: [], highlighter: false, ...over,
})

const newCtx = () => document.createElement('canvas').getContext('2d') as unknown as FakeCtx

/** Distance from p to segment a–b. */
function segDist(p: LocalPoint, a: LocalPoint, b: LocalPoint): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

describe('simplify (RDP)', () => {
  it('simplifyIndices returns the kept indices, matching simplify', () => {
    const pts: [number, number][] = [[0, 0], [1, 0.01], [2, 0], [3, 5], [4, 0]]
    const idx = simplifyIndices(pts, 0.5)
    expect(idx).toEqual([0, 2, 3, 4])
    expect(simplify(pts, 0.5)).toEqual(idx.map(i => pts[i]))
    expect(simplifyIndices([[1, 1]], 0.5)).toEqual([0])
    expect(simplifyIndices([], 0.5)).toEqual([])
  })

  it('simplify keeps endpoints and stays within tolerance', () => {
    const pts: LocalPoint[] = Array.from({ length: 50 }, (_, i) => [i * 2, Math.sin(i / 4) * 10] as LocalPoint)
    const out = simplify(pts, 1)
    expect(out[0]).toEqual(pts[0])
    expect(out[out.length - 1]).toEqual(pts[pts.length - 1])
    expect(out.length).toBeLessThan(pts.length)
    // every original point lies within tolerance of the simplified polyline
    for (const p of pts) {
      let best = Infinity
      for (let i = 0; i < out.length - 1; i++) best = Math.min(best, segDist(p, out[i]!, out[i + 1]!))
      expect(best).toBeLessThanOrEqual(1 + 1e-9)
    }
  })

  it('simplify reduces a dense straight line to 2 points', () => {
    const pts: LocalPoint[] = Array.from({ length: 100 }, (_, i) => [i, i * 0.5] as LocalPoint)
    expect(simplify(pts, 0.5)).toEqual([[0, 0], [99, 49.5]])
  })

  it('handles tiny inputs', () => {
    expect(simplify([], 1)).toEqual([])
    expect(simplify([[1, 2]], 1)).toEqual([[1, 2]])
  })
})

describe('freedraw outline', () => {
  it('outline is closed and non-empty for a single point', () => {
    const outline = strokeOutline(fd({ points: [[5, 5]], w: 0, h: 0 }))
    expect(outline.length).toBeGreaterThan(2)
    const d = outlineToPath(outline)
    expect(d.startsWith('M')).toBe(true)
    expect(d.trim().endsWith('Z')).toBe(true)
  })

  it('stroke size: pen 1→5, 2→8, 4→14', () => {
    expect(strokeSize(fd({ strokeWidth: 1 }))).toBe(5)
    expect(strokeSize(fd({ strokeWidth: 2 }))).toBe(8)
    expect(strokeSize(fd({ strokeWidth: 4 }))).toBe(14)
  })

  it('highlighter size is 3× plus 6', () => {
    expect(strokeSize(fd({ strokeWidth: 1, highlighter: true }))).toBe(15)
    expect(strokeSize(fd({ strokeWidth: 2, highlighter: true }))).toBe(24)
    expect(strokeSize(fd({ strokeWidth: 4, highlighter: true }))).toBe(42)
  })

  it('committed strokes reach the last point (last: true); live drafts may not', () => {
    const e = fd({ points: [[0, 0], [100, 0]], w: 100, h: 0 })
    expect(Math.max(...strokeOutline(e).map(p => p[0]!))).toBeGreaterThanOrEqual(100)
    expect(strokeOutline(e, { live: true })).not.toBe(strokeOutline(e))
  })

  it('simulates pressure whenever pressures do not match the points', () => {
    const pts: LocalPoint[] = [[0, 0], [40, 10], [100, 0]]
    expect(strokeOutline(fd({ points: pts, pressures: [0.2] }))).toEqual(strokeOutline(fd({ points: pts, pressures: [] })))
  })

  it('uses real pressures when present', () => {
    const light = strokeOutline(fd({ points: [[0, 0], [100, 0]], pressures: [0.1, 0.1] }))
    const heavy = strokeOutline(fd({ points: [[0, 0], [100, 0]], pressures: [1, 1] }))
    const spread = (o: number[][]) => Math.max(...o.map(p => p[1]!)) - Math.min(...o.map(p => p[1]!))
    expect(spread(heavy)).toBeGreaterThan(spread(light))
  })
})

describe('points hash memo', () => {
  /** JSON.stringify calls that serialize `points` (alone or as the first entry). */
  function countPointHashes(points: unknown, run: () => void): number {
    const spy = vi.spyOn(JSON, 'stringify')
    run()
    const n = spy.mock.calls.filter(([v]) => v === points || (Array.isArray(v) && v[0] === points)).length
    spy.mockRestore()
    return n
  }

  it('hashes the points once for snapshots sharing the points array (freedraw and linear)', () => {
    const points: LocalPoint[] = Array.from({ length: 200 }, (_, i) => [i, i % 7])
    const a = fd({ points })
    const b = { ...a, x: 50, version: 2 }
    const k = kindOf(a)
    expect(countPointHashes(points, () => {
      expect(k.shapeKey(a)).toBe(k.shapeKey(b))
    })).toBe(1)
    // a different points array changes the key
    expect(k.shapeKey({ ...a, points: [...points, [1, 1]] })).not.toBe(k.shapeKey(a))

    const linePoints: LocalPoint[] = [[0, 0], [10, 10], [20, 0]]
    const l1 = { ...fd(), type: 'line', points: linePoints, routing: 'straight', startArrowhead: 'none', endArrowhead: 'none' } as never
    const l2 = { ...(l1 as object), y: 99 } as never
    const lk = kindOf(l1)
    expect(countPointHashes(linePoints, () => {
      expect(lk.shapeKey(l1)).toBe(lk.shapeKey(l2))
    })).toBe(1)
  })
})

describe('freedraw kind', () => {
  it('visualPad is 0.8 * size + 2 (perfect-freehand radius at pressure 1)', () => {
    const e = fd({ strokeWidth: 2 })
    expect(kindOf(e).visualPad(e)).toBeCloseTo(8.4, 9)
    const h = fd({ strokeWidth: 2, highlighter: true })
    expect(kindOf(h).visualPad(h)).toBeCloseTo(21.2, 9)
  })

  it('outline stays within visualPad of the points at pressure 1 and simulated pressure', () => {
    const points: LocalPoint[] = Array.from({ length: 30 }, (_, i) => [i * 4, Math.sin(i / 3) * 20 + 20] as LocalPoint)
    for (const strokeWidth of [1, 2, 4] as const) {
      for (const highlighter of [false, true]) {
        for (const pressures of [points.map(() => 1), []]) {
          const e = fd({ points, pressures, strokeWidth, highlighter })
          const pad = kindOf(e).visualPad(e)
          const far = Math.max(...strokeOutline(e).map(([x, y]) => polylineDistance(points, { x: x!, y: y! })))
          expect(far).toBeLessThanOrEqual(pad)
        }
      }
    }
  })

  it('hit on stroke true, far false', () => {
    const e = fd()
    const k = kindOf(e)
    expect(polylineDistance(e.points, { x: 25, y: 25 })).toBeCloseTo(0, 6)
    expect(k.hit(e, { x: 25, y: 27 }, 1)).toBe(true)
    expect(k.hit(e, { x: 50, y: 0 }, 1)).toBe(false)
    expect(k.hit(e, { x: 50, y: 20 }, 1)).toBe(false)
  })

  it('hit half-width: size / 2 when simulated, 0.8 * size with real pressures', () => {
    const k = kindOf(fd())
    const sim = fd({ points: [[0, 0], [100, 0]], h: 0 }) // size 8 → 4
    const real = fd({ points: [[0, 0], [100, 0]], h: 0, pressures: [1, 1] }) // → 6.4
    expect(k.hit(sim, { x: 50, y: 4 }, 0)).toBe(true)
    expect(k.hit(sim, { x: 50, y: 6 }, 0)).toBe(false)
    expect(k.hit(real, { x: 50, y: 6 }, 0)).toBe(true)
    expect(k.hit(real, { x: 50, y: 7 }, 0)).toBe(false)
  })

  it('resize scales points proportionally', () => {
    const e = fd()
    const patch = kindOf(e).resize(e, { x: 10, y: 20, w: 200, h: 25 })
    expect(patch).toEqual({ x: 10, y: 20, w: 200, h: 25, points: [[0, 0], [100, 25], [200, 0]] })
  })

  it('resize of a zero-size axis keeps coordinates', () => {
    const e = fd({ points: [[0, 0], [100, 0]], h: 0 })
    const patch = kindOf(e).resize(e, { x: 0, y: 0, w: 50, h: 10 })
    expect(patch.points).toEqual([[0, 0], [50, 0]])
  })

  it('svg path present with fill = stroke color', () => {
    const e = fd({ stroke: '#e03131' })
    const svg = kindOf(e).svg(e, 'light')
    expect(svg).toMatch(/^<path d="M[^"]+Z" fill="#e03131"/)
    expect(svg).not.toContain('mix-blend-mode')
  })

  it('highlighter svg has opacity 0.4; multiply blend in light theme only', () => {
    const e = fd({ highlighter: true, stroke: '#f08c00' })
    const light = kindOf(e).svg(e, 'light')
    expect(light).toContain('fill="#f08c00"')
    expect(light).toContain('opacity="0.4"')
    expect(light).toContain('mix-blend-mode:multiply')
    const dark = kindOf(e).svg(e, 'dark')
    expect(dark).toContain('opacity="0.4"')
    expect(dark).not.toContain('mix-blend-mode')
  })

  it('shapeKey changes when points change', () => {
    const a = fd()
    const b = fd({ points: [[0, 0], [50, 49], [100, 0]] })
    const c = fd({ pressures: [0.5, 0.5, 0.5] })
    expect(shapeKeyOf(a)).not.toBe(shapeKeyOf(b))
    expect(shapeKeyOf(a)).not.toBe(shapeKeyOf(c))
    expect(shapeKeyOf(a)).toBe(shapeKeyOf(fd({ x: 99, y: 3, angle: 1, version: 9 })))
    expect(shapeKeyOf(a)).not.toBe(shapeKeyOf(fd({ highlighter: true })))
  })

  it('draw fills a Path2D with the stroke color', () => {
    const paths: string[] = []
    vi.stubGlobal('Path2D', class { constructor(d: string) { paths.push(d) } })
    const ctx = newCtx()
    const e = fd({ stroke: '#1e1e1e' })
    kindOf(e).draw(ctx, e, 'dark')
    expect(paths).toHaveLength(1)
    expect(paths[0]).toBe(outlineToPath(strokeOutline(e)))
    expect(ctx.fillStyle).toBe('#e3e3e3')
    expect(ctx.calls.some(c => c.name === 'fill' && c.args[0] !== undefined)).toBe(true)
  })

  it('draw without Path2D traces the outline on the context', () => {
    vi.stubGlobal('Path2D', undefined)
    const ctx = newCtx()
    const e = fd()
    kindOf(e).draw(ctx, e, 'light')
    expect(ctx.calls.some(c => c.name === 'quadraticCurveTo')).toBe(true)
    expect(ctx.calls.some(c => c.name === 'fill')).toBe(true)
  })

  it('highlighter draw multiplies alpha by 0.4 with source-over (the blend is applied by the caller)', () => {
    vi.stubGlobal('Path2D', class {})
    const e = fd({ highlighter: true })
    for (const theme of ['light', 'dark'] as const) {
      const ctx = newCtx()
      ctx.globalAlpha = 0.5
      kindOf(e).draw(ctx, e, theme)
      expect(ctx.calls).toContainEqual({ name: 'set:globalAlpha', args: [0.2] })
      expect(ctx.calls.some(c => c.name === 'set:globalCompositeOperation' && c.args[0] === 'multiply')).toBe(false)
    }
  })

  it('highlighter drawLod multiplies in light theme only', () => {
    const e = fd({ highlighter: true })
    const light = newCtx()
    kindOf(e).drawLod(light, e, 'light', 0.1)
    expect(light.calls).toContainEqual({ name: 'set:globalCompositeOperation', args: ['multiply'] })
    const dark = newCtx()
    kindOf(e).drawLod(dark, e, 'dark', 0.1)
    expect(dark.calls.some(c => c.name === 'set:globalCompositeOperation' && c.args[0] === 'multiply')).toBe(false)
  })

  it('drawLod strokes a plain polyline in the centered frame', () => {
    const ctx = newCtx()
    const e = fd()
    kindOf(e).drawLod(ctx, e, 'light', 0.1)
    expect(ctx.calls).toContainEqual({ name: 'moveTo', args: [-50, -25] })
    expect(ctx.calls.some(c => c.name === 'stroke')).toBe(true)
  })
})
