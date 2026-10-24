import { describe, expect, it } from 'vitest'
import { boxContains, boxesIntersect, elementBounds, handlePositions, hitElement, resizeBox, rotateAngle, rotatePoint } from '../src/geometry'
import { DEFAULT_STYLE, type ShapeElement, type SketchElement } from '../src/model/types'

const el = (over: Partial<ShapeElement> = {}): SketchElement => ({
  id: 'a', type: 'rectangle', x: 0, y: 0, w: 100, h: 50, angle: 0, index: 'a0',
  seed: 1, version: 1, locked: false, ...DEFAULT_STYLE, groupIds: [], frameId: null, label: '', ...over,
})
const filled = { fill: '#f00', fillStyle: 'solid' as const }

describe('bounds', () => {
  it('elementBounds of rect rotated 90° swaps w/h, padded by visualPad', () => {
    // pad = strokeWidth 2 + roughness 1 * 4 = 6
    const b = elementBounds(el({ angle: Math.PI / 2, strokeWidth: 2, roughness: 1 }))
    expect(b.minX).toBeCloseTo(19, 3)
    expect(b.minY).toBeCloseTo(-31, 3)
    expect(b.maxX).toBeCloseTo(81, 3)
    expect(b.maxY).toBeCloseTo(81, 3)
  })
  it('rotatePoint, intersect, contains', () => {
    const p = rotatePoint({ x: 1, y: 0 }, { x: 0, y: 0 }, Math.PI / 2)
    expect(p.x).toBeCloseTo(0); expect(p.y).toBeCloseTo(1)
    const a = { minX: 0, minY: 0, maxX: 10, maxY: 10 }
    expect(boxesIntersect(a, { minX: 5, minY: 5, maxX: 20, maxY: 20 })).toBe(true)
    expect(boxesIntersect(a, { minX: 11, minY: 0, maxX: 20, maxY: 5 })).toBe(false)
    expect(boxContains(a, { minX: 1, minY: 1, maxX: 9, maxY: 9 })).toBe(true)
    expect(boxContains(a, { minX: 1, minY: 1, maxX: 11, maxY: 9 })).toBe(false)
  })
})

describe('hit', () => {
  it('hit inside filled rect', () => expect(hitElement(el(filled), { x: 50, y: 25 }, 5)).toBe(true))
  it('miss inside unfilled rect center', () => expect(hitElement(el(), { x: 50, y: 25 }, 5)).toBe(false))
  it('hit unfilled rect near edge within tolerance 5', () => {
    expect(hitElement(el(), { x: 3, y: 25 }, 5)).toBe(true)
    expect(hitElement(el(), { x: -4, y: 25 }, 5)).toBe(true)
    expect(hitElement(el(), { x: 10, y: 25 }, 5)).toBe(false)
  })
  it('ellipse hit uses implicit equation', () => {
    const e = el({ type: 'ellipse', ...filled })
    expect(hitElement(e, { x: 50, y: 25 }, 0)).toBe(true)
    expect(hitElement(e, { x: 2, y: 2 }, 0)).toBe(false) // inside bbox, outside ellipse
    expect(hitElement(e, { x: 90, y: 25 }, 0)).toBe(true)
  })
  it('diamond hit uses |dx|/hw + |dy|/hh ≤ 1', () => {
    const d = el({ type: 'diamond', ...filled })
    expect(hitElement(d, { x: 50, y: 25 }, 0)).toBe(true)
    expect(hitElement(d, { x: 5, y: 5 }, 0)).toBe(false)
    expect(hitElement(d, { x: 25, y: 12.5 }, 0)).toBe(true)
  })
  it('hit respects rotation', () => {
    const r = el({ ...filled, angle: Math.PI / 2 }) // occupies x 25..75, y -25..75
    expect(hitElement(r, { x: 50, y: -20 }, 0)).toBe(true)
    expect(hitElement(r, { x: 5, y: 25 }, 0)).toBe(false)
  })
})

describe('handles', () => {
  it('positions incl. rotate handle 24/zoom above top', () => {
    const h = handlePositions({ x: 0, y: 0, w: 100, h: 50, angle: 0 }, 2)
    expect(h.se).toEqual({ x: 100, y: 50 })
    expect(h.n).toEqual({ x: 50, y: 0 })
    expect(h.rotate.x).toBeCloseTo(50); expect(h.rotate.y).toBeCloseTo(-12)
  })
})

describe('resizeBox', () => {
  const start = { x: 0, y: 0, w: 100, h: 50, angle: 0 }
  const off = { keepRatio: false, fromCenter: false }
  it('se handle grows w/h', () => {
    expect(resizeBox(start, 'se', { x: 150, y: 80 }, off)).toEqual({ x: 0, y: 0, w: 150, h: 80 })
  })
  it('dragging past the opposite edge flips and keeps w,h ≥ 0', () => {
    expect(resizeBox(start, 'se', { x: -30, y: -10 }, off)).toEqual({ x: -30, y: -10, w: 30, h: 10 })
  })
  it('keepRatio keeps w/h ratio', () => {
    const r = resizeBox(start, 'se', { x: 200, y: 60 }, { keepRatio: true, fromCenter: false })
    expect(r.w / r.h).toBeCloseTo(2); expect(r.w).toBeCloseTo(200)
    expect(r.x).toBe(0); expect(r.y).toBe(0)
  })
  it('fromCenter keeps center fixed', () => {
    const r = resizeBox(start, 'se', { x: 70, y: 40 }, { keepRatio: false, fromCenter: true })
    expect(r.x + r.w / 2).toBeCloseTo(50); expect(r.y + r.h / 2).toBeCloseTo(25)
    expect(r.w).toBeCloseTo(40); expect(r.h).toBeCloseTo(30)
  })
  it('edge handle only changes one axis', () => {
    expect(resizeBox(start, 'e', { x: 120, y: 999 }, off)).toEqual({ x: 0, y: 0, w: 120, h: 50 })
  })
  it('rotated 90° box resized from e keeps its w anchor world position', () => {
    const rot = { ...start, angle: Math.PI / 2 }
    const anchor = (b: { x: number; y: number; w: number; h: number }) =>
      rotatePoint({ x: b.x, y: b.y + b.h / 2 }, { x: b.x + b.w / 2, y: b.y + b.h / 2 }, Math.PI / 2)
    const before = anchor(rot)
    // local +x of a 90° box points to world +y; drag 30 further along it
    const r = resizeBox(rot, 'e', { x: 50, y: 25 + 50 + 30 }, off)
    expect(r.w).toBeCloseTo(130); expect(r.h).toBeCloseTo(50)
    const after = anchor(r)
    expect(after.x).toBeCloseTo(before.x); expect(after.y).toBeCloseTo(before.y)
  })
})

describe('rotateAngle', () => {
  const c = { x: 0, y: 0 }
  const at = (deg: number) => ({ x: 100 * Math.sin(deg * Math.PI / 180), y: -100 * Math.cos(deg * Math.PI / 180) })
  it('snaps to 15°', () => expect(rotateAngle(c, at(40), true)).toBeCloseTo(Math.PI / 4))
  it('free angle, normalized to [0, 2π)', () => {
    expect(rotateAngle(c, at(40), false)).toBeCloseTo(40 * Math.PI / 180)
    expect(rotateAngle(c, at(-90), false)).toBeCloseTo(1.5 * Math.PI)
    expect(rotateAngle(c, at(-1), true)).toBeCloseTo(0)
  })
})
