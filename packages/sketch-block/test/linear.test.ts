import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { kindOf, shapeKeyOf } from '../src/elements/kind'
import { arrowheadPoints, boxFromPoints, linearDrawables, routePoints } from '../src/elements/linear'
import { DEFAULT_STYLE, type LinearElement, type LocalPoint, normalizeElement } from '../src/model/types'
import { type FakeCtx, stubCanvas } from './helpers/canvas'

beforeEach(() => stubCanvas())
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const ln = (over: Partial<LinearElement> = {}): LinearElement => ({
  id: 'l', type: 'line', x: 0, y: 0, w: 100, h: 50, angle: 0, index: 'a0',
  ...DEFAULT_STYLE, groupIds: [], frameId: null, label: '', startBinding: null, endBinding: null, seed: 3, version: 1, locked: false,
  points: [[0, 0], [100, 50]], routing: 'straight', startArrowhead: 'none', endArrowhead: 'none', ...over,
})

const newCtx = () => document.createElement('canvas').getContext('2d') as unknown as FakeCtx
const deg = (r: number) => (r * 180) / Math.PI
const pathCount = (svg: string) => (svg.match(/<path /g) ?? []).length

describe('routePoints', () => {
  it('straight and curved keep the points as is', () => {
    const pts: LocalPoint[] = [[0, 0], [30, 40], [100, 50]]
    expect(routePoints(ln({ points: pts }))).toEqual(pts)
    expect(routePoints(ln({ points: pts, routing: 'curved' }))).toEqual(pts)
  })

  it('elbow route is orthogonal and starts/ends at endpoints', () => {
    // |dx| ≥ |dy|: horizontal-first, split at mid x; intermediate points ignored
    const wide = routePoints(ln({ routing: 'elbow', points: [[0, 0], [70, 5], [100, 50]] }))
    expect(wide).toEqual([[0, 0], [50, 0], [50, 50], [100, 50]])
    // |dx| < |dy|: vertical-first, split at mid y
    const tall = routePoints(ln({ routing: 'elbow', w: 20, h: 100, points: [[0, 0], [20, 100]] }))
    expect(tall).toEqual([[0, 0], [0, 50], [20, 50], [20, 100]])
    for (const r of [wide, tall]) {
      for (let i = 1; i < r.length; i++) {
        const [a, b] = [r[i - 1]!, r[i]!]
        expect(a[0] === b[0] || a[1] === b[1]).toBe(true)
      }
    }
  })
})

describe('arrowheadPoints', () => {
  it('arrowhead arrow points at the tip with 25° half-angle', () => {
    const tip: LocalPoint = [100, 0]
    const head = arrowheadPoints('arrow', tip, [0, 0], 2)
    expect(head.kind).toBe('polyline')
    expect(head.points).toHaveLength(3)
    expect(head.points[1]).toEqual(tip)
    const len = 10 + 2 * 3
    for (const p of [head.points[0]!, head.points[2]!]) {
      expect(Math.hypot(p[0] - tip[0], p[1] - tip[1])).toBeCloseTo(len, 6)
      // wings point back towards `from`, 25° off the shaft
      const a = Math.atan2(p[1] - tip[1], p[0] - tip[0])
      expect(Math.abs(180 - Math.abs(deg(a)))).toBeCloseTo(25, 6)
    }
    expect(Math.sign(head.points[0]![1])).toBe(-Math.sign(head.points[2]![1]))
  })

  it('triangle is a closed polygon with the tip; dot is a circle; bar is perpendicular', () => {
    const tri = arrowheadPoints('triangle', [0, 0], [0, 100], 1)
    expect(tri.kind).toBe('polygon')
    expect(tri.points).toContainEqual([0, 0])
    expect(tri.points).toHaveLength(3)
    const dot = arrowheadPoints('dot', [5, 5], [0, 5], 4)
    expect(dot).toEqual({ kind: 'circle', points: [[5, 5]], r: 7 })
    const bar = arrowheadPoints('bar', [100, 0], [0, 0], 2)
    expect(bar.kind).toBe('line')
    const [a, b] = bar.points as [LocalPoint, LocalPoint]
    expect(a[0]).toBeCloseTo(100, 6)
    expect(b[0]).toBeCloseTo(100, 6)
    expect(Math.abs(a[1] - b[1])).toBeCloseTo(16, 6)
  })
})

describe('boxFromPoints', () => {
  it('boxFromPoints normalizes negative directions', () => {
    const r = boxFromPoints([[100, 80], [40, 20], [60, 90]])
    expect(r).toEqual({ x: 40, y: 20, w: 60, h: 70, points: [[60, 60], [0, 0], [20, 70]] })
  })

  it('a single point is a zero box', () => {
    expect(boxFromPoints([[5, -3]])).toEqual({ x: 5, y: -3, w: 0, h: 0, points: [[0, 0]] })
  })
})

describe('linear kind', () => {
  it('registers line and arrow to the same kind', () => {
    expect(kindOf(ln())).toBe(kindOf(ln({ type: 'arrow' })))
  })

  it('hit near segment true, far false, respects elbow route', () => {
    const e = ln()
    const k = kindOf(e)
    expect(k.hit(e, { x: 50, y: 26 }, 1)).toBe(true)
    expect(k.hit(e, { x: 50, y: 0 }, 1)).toBe(false)
    const elbow = ln({ routing: 'elbow' }) // [0,0] → [50,0] → [50,50] → [100,50]
    expect(k.hit(elbow, { x: 25, y: 0 }, 1)).toBe(true)
    expect(k.hit(elbow, { x: 50, y: 25 }, 1)).toBe(true)
    expect(k.hit(elbow, { x: 25, y: 12.5 }, 1)).toBe(false) // on the straight diagonal, off the route
  })

  it('resize scales points', () => {
    const e = ln({ points: [[0, 0], [50, 10], [100, 50]] })
    expect(kindOf(e).resize(e, { x: 5, y: 6, w: 50, h: 100 }))
      .toEqual({ x: 5, y: 6, w: 50, h: 100, points: [[0, 0], [25, 20], [50, 100]] })
  })

  it('visualPad adds head room only with arrowheads', () => {
    const e = ln({ strokeWidth: 2, roughness: 1 })
    expect(kindOf(e).visualPad(e)).toBe(6)
    const a = ln({ strokeWidth: 2, roughness: 1, endArrowhead: 'arrow' })
    expect(kindOf(a).visualPad(a)).toBe(6 + 16)
  })

  it('line has no heads by default; arrow has end arrow', () => {
    const base = { id: 'x', x: 0, y: 0, w: 100, h: 0, angle: 0, index: 'a0', seed: 1, version: 1, locked: false, points: [[0, 0], [100, 0]] }
    const line = normalizeElement({ ...base, type: 'line' }) as LinearElement
    const arrow = normalizeElement({ ...base, type: 'arrow' }) as LinearElement
    expect([line.startArrowhead, line.endArrowhead]).toEqual(['none', 'none'])
    expect([arrow.startArrowhead, arrow.endArrowhead]).toEqual(['none', 'arrow'])
    expect(linearDrawables(line)).toHaveLength(1)
    expect(linearDrawables(arrow)).toHaveLength(2)
    expect(linearDrawables(ln({ startArrowhead: 'dot', endArrowhead: 'triangle' }))).toHaveLength(3)
  })

  it('svg contains head paths', () => {
    const line = ln()
    const arrow = ln({ type: 'arrow', endArrowhead: 'triangle' })
    const k = kindOf(line)
    const lineSvg = k.svg(line, 'light')
    const arrowSvg = k.svg(arrow, 'light')
    expect(pathCount(lineSvg)).toBeGreaterThan(0)
    expect(pathCount(arrowSvg)).toBeGreaterThan(pathCount(lineSvg))
    // triangle head is filled with the stroke color
    expect(arrowSvg).toContain('fill="#1e1e1e"')
  })

  it('dashes the shaft but not the heads', () => {
    const e = ln({ strokeStyle: 'dashed', endArrowhead: 'arrow' })
    const svg = kindOf(e).svg(e, 'light')
    const paths = svg.match(/<path [^>]*>/g)!
    expect(paths[0]).toContain('stroke-dasharray')
    expect(paths[paths.length - 1]).not.toContain('stroke-dasharray')
  })

  it('curved routing draws a curve, straight a linear path', () => {
    expect(linearDrawables(ln({ points: [[0, 0], [50, 40], [100, 50]] }))[0]!.shape).toBe('linearPath')
    expect(linearDrawables(ln({ routing: 'curved', points: [[0, 0], [50, 40], [100, 50]] }))[0]!.shape).toBe('curve')
  })

  it('shapeKey covers routing, heads and points', () => {
    const a = ln()
    expect(shapeKeyOf(a)).not.toBe(shapeKeyOf(ln({ routing: 'elbow' })))
    expect(shapeKeyOf(a)).not.toBe(shapeKeyOf(ln({ endArrowhead: 'arrow' })))
    expect(shapeKeyOf(a)).not.toBe(shapeKeyOf(ln({ points: [[0, 0], [100, 49]] })))
    expect(shapeKeyOf(a)).toBe(shapeKeyOf(ln({ x: 9, y: 9, angle: 1, version: 4 })))
  })

  it('draw renders through rough.canvas; drawLod strokes in the centered frame', () => {
    const e = ln({ endArrowhead: 'arrow' })
    const ctx = newCtx()
    kindOf(e).draw(ctx, e, 'light')
    expect(ctx.calls.some(c => c.name === 'stroke')).toBe(true)
    const lod = newCtx()
    kindOf(e).drawLod(lod, e, 'light', 0.1)
    expect(lod.calls).toContainEqual({ name: 'translate', args: [-50, -25] })
    expect(lod.calls).toContainEqual({ name: 'moveTo', args: [0, 0] })
    expect(lod.calls.filter(c => c.name === 'stroke').length).toBeGreaterThanOrEqual(2)
  })
})
