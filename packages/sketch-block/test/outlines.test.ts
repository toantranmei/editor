import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { kindOf } from '../src/elements/kind'
import { outlinePoints, shapeOutline } from '../src/elements/outlines'
import { DEFAULT_STYLE, SHAPE_TYPES, type ShapeElement, type ShapeType } from '../src/model/types'
import { type FakeCtx, stubCanvas } from './helpers/canvas'

beforeEach(() => stubCanvas())
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const el = (over: Partial<ShapeElement> = {}): ShapeElement => ({
  id: 's', type: 'triangle', x: 0, y: 0, w: 100, h: 100, angle: 0, index: 'a0',
  ...DEFAULT_STYLE, groupIds: [], frameId: null, label: '', seed: 5, version: 1, locked: false, ...over,
})
const filled = { fill: '#ffc9c9', fillStyle: 'solid' } as const
const NEW_TYPES = SHAPE_TYPES.filter(t => t !== 'rectangle' && t !== 'ellipse' && t !== 'diamond')

describe('shapeOutline', () => {
  it('every shape type yields a closed outline inside its box', () => {
    for (const type of SHAPE_TYPES) {
      for (const [w, h] of [[160, 90], [40, 120]] as const) {
        const o = shapeOutline(type, w, h)
        if (o.kind === 'path') expect(o.d.trim().endsWith('Z'), type).toBe(true)
        const pts = outlinePoints(o)
        expect(pts.length, type).toBeGreaterThanOrEqual(3)
        const xs = pts.map(p => p[0])
        const ys = pts.map(p => p[1])
        const eps = 1e-6
        for (const v of [...xs, ...ys]) expect(Number.isFinite(v), type).toBe(true)
        expect(Math.min(...xs), type).toBeGreaterThanOrEqual(-eps)
        expect(Math.min(...ys), type).toBeGreaterThanOrEqual(-eps)
        expect(Math.max(...xs), type).toBeLessThanOrEqual(w + eps)
        expect(Math.max(...ys), type).toBeLessThanOrEqual(h + eps)
        // the outline fills its box
        expect(Math.max(...xs) - Math.min(...xs), type).toBeGreaterThan(w * 0.99)
        expect(Math.max(...ys) - Math.min(...ys), type).toBeGreaterThan(h * 0.99)
      }
    }
  })

  it('uses the exact polygon geometry', () => {
    expect(shapeOutline('triangle', 100, 50)).toEqual({ kind: 'polygon', points: [[50, 0], [100, 50], [0, 50]] })
    expect(shapeOutline('hexagon', 100, 50)).toEqual({
      kind: 'polygon', points: [[25, 0], [75, 0], [100, 25], [75, 50], [25, 50], [0, 25]],
    })
    expect(shapeOutline('parallelogram', 100, 50)).toEqual({ kind: 'polygon', points: [[20, 0], [100, 0], [80, 50], [0, 50]] })
    expect(shapeOutline('trapezoid', 100, 50)).toEqual({ kind: 'polygon', points: [[20, 0], [80, 0], [100, 50], [0, 50]] })
    expect(shapeOutline('blockArrow', 100, 40)).toEqual({
      kind: 'polygon', points: [[0, 10], [65, 10], [65, 0], [100, 20], [65, 40], [65, 30], [0, 30]],
    })
    const star = shapeOutline('star', 100, 100)
    expect(star.kind === 'polygon' && star.points.length).toBe(10)
    const pent = shapeOutline('pentagon', 100, 100)
    expect(pent.kind === 'polygon' && pent.points.length).toBe(5)
    if (pent.kind === 'polygon') expect(pent.points[0]).toEqual([50, 0])
  })

  it('curved outlines sample 24 segments per curve', () => {
    const doc = shapeOutline('document', 100, 100)
    expect(doc.kind).toBe('path')
    if (doc.kind === 'path') {
      // wavy bottom: amplitude h * 0.08 around h - 8, reaching the box bottom
      const bottom = doc.hitPolygon.filter(p => p[1] > 80)
      expect(Math.max(...bottom.map(p => p[1]))).toBeCloseTo(100, 5)
      expect(Math.min(...bottom.map(p => p[1]))).toBeCloseTo(84, 5)
    }
    const cloud = shapeOutline('cloud', 100, 100)
    expect(cloud.kind === 'path' && (cloud.d.match(/A/g) ?? []).length).toBe(6)
    expect(cloud.kind === 'path' && cloud.hitPolygon.length).toBe(6 * 24)
    const cyl = shapeOutline('cylinder', 100, 400)
    // caps are min(h * 0.2, 24) tall
    expect(cyl.kind === 'path' && cyl.d.includes(' 12 0 0 1 ')).toBe(true)
  })
})

describe('extended shape kind', () => {
  it('triangle hit inside/outside', () => {
    const t = el({ type: 'triangle', ...filled })
    const k = kindOf(t)
    expect(k.hit(t, { x: 50, y: 60 }, 1)).toBe(true)
    expect(k.hit(t, { x: 5, y: 10 }, 1)).toBe(false)
    expect(k.hit(t, { x: 95, y: 10 }, 1)).toBe(false)
    // unfilled: only near the outline
    const u = el({ type: 'triangle' })
    expect(k.hit(u, { x: 50, y: 60 }, 1)).toBe(false)
    expect(k.hit(u, { x: 50, y: 100 }, 1)).toBe(true)
  })

  it('unfilled star hit near edge only', () => {
    const s = el({ type: 'star' })
    const k = kindOf(s)
    expect(k.hit(s, { x: 50, y: 55 }, 2)).toBe(false)
    expect(k.hit(s, { x: 50, y: 0.5 }, 2)).toBe(true)
    expect(k.hit(s, { x: 2, y: 2 }, 2)).toBe(false)
    expect(k.hit(el({ type: 'star', ...filled }), { x: 50, y: 55 }, 2)).toBe(true)
  })

  it('svg for each type renders without NaN', () => {
    for (const type of NEW_TYPES as ShapeType[]) {
      for (const over of [{}, filled, { strokeStyle: 'dashed' as const, roughness: 0 as const, label: 'Hi' }]) {
        const e = el({ type, w: 120, h: 80, ...over })
        const svg = kindOf(e).svg(e, 'light')
        expect(svg, type).toContain('<path')
        expect(svg, type).not.toContain('NaN')
      }
      const tiny = el({ type, w: 0, h: 0 })
      expect(kindOf(tiny).svg(tiny, 'light'), `${type} 0×0`).not.toContain('NaN')
    }
  })

  it('draws (full and LOD) every new type', () => {
    const ctx = document.createElement('canvas').getContext('2d') as unknown as FakeCtx
    for (const type of NEW_TYPES) {
      const e = el({ type, ...filled, label: 'x' })
      expect(() => kindOf(e).draw(ctx as unknown as CanvasRenderingContext2D, e, 'light')).not.toThrow()
      expect(() => kindOf(e).drawLod(ctx as unknown as CanvasRenderingContext2D, e, 'dark', 0.1)).not.toThrow()
    }
  })

  it('different types draw different outlines', () => {
    const svgs = new Set(SHAPE_TYPES.map(type => kindOf(el({ type, roughness: 0 })).svg(el({ type, roughness: 0 }), 'light')))
    expect(svgs.size).toBe(SHAPE_TYPES.length)
  })
})
