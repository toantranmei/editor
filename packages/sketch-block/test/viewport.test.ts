import { describe, expect, it } from 'vitest'
import { Viewport } from '../src/viewport'

describe('Viewport', () => {
  it('defaults and conversions', () => {
    const v = new Viewport()
    expect([v.x, v.y, v.zoom]).toEqual([0, 0, 1])
    v.x = 10; v.y = 20; v.zoom = 2
    expect(v.toScreen({ x: 15, y: 25 })).toEqual({ x: 10, y: 10 })
    expect(v.toScene({ x: 10, y: 10 })).toEqual({ x: 15, y: 25 })
  })
  it('panBy moves by screen delta / zoom', () => {
    const v = new Viewport(); v.zoom = 2; v.panBy(20, -10)
    expect([v.x, v.y]).toEqual([-10, 5])
  })
  it('zoomAt keeps the point under the cursor fixed', () => {
    const v = new Viewport(); v.x = 30; v.y = -40
    const s = { x: 200, y: 150 }
    const before = v.toScene(s)
    v.zoomAt(s, 2.5)
    const after = v.toScene(s)
    expect(after.x).toBeCloseTo(before.x); expect(after.y).toBeCloseTo(before.y)
    expect(v.zoom).toBe(2.5)
  })
  it('zoom clamps to [0.1, 30]', () => {
    const v = new Viewport()
    v.zoomAt({ x: 0, y: 0 }, 1000); expect(v.zoom).toBe(30)
    v.zoomAt({ x: 0, y: 0 }, 0.001); expect(v.zoom).toBe(0.1)
  })
  it('visibleBox', () => {
    const v = new Viewport(); v.x = 10; v.y = 10; v.zoom = 2
    expect(v.visibleBox(200, 100)).toEqual({ minX: 10, minY: 10, maxX: 110, maxY: 60 })
  })
  it('fit centers box', () => {
    const v = new Viewport()
    v.fit({ minX: 0, minY: 0, maxX: 100, maxY: 50 }, 520, 300, 10)
    expect(v.zoom).toBeCloseTo(5) // min(500/100, 280/50=5.6)
    const c = v.toScreen({ x: 50, y: 25 })
    expect(c.x).toBeCloseTo(260); expect(c.y).toBeCloseTo(150)
  })
})
