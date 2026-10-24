import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'

import { elementCorners } from '../src/geometry/bounds'
import { pointInPolygon } from '../src/geometry/polygon'
import { History } from '../src/model/history'
import { Scene } from '../src/model/scene'
import { BoardStore } from '../src/model/store'
import { DEFAULT_STYLE, type ShapeElement } from '../src/model/types'
import { type PointerInput, ToolController } from '../src/tools/controller'
import { Viewport } from '../src/viewport'

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function setup(opts: { zoom?: number; now?: () => number } = {}) {
  const doc = new Y.Doc()
  const store = new BoardStore(doc)
  const scene = new Scene(store)
  const history = new History(store)
  const viewport = new Viewport()
  viewport.zoom = opts.zoom ?? 1
  const c = new ToolController({
    store, scene, history, viewport,
    readonly: () => false,
    style: () => DEFAULT_STYLE,
    invalidate: vi.fn(),
    now: opts.now,
  })
  return { doc, store, scene, history, viewport, c }
}

const ptr = (x: number, y: number, extra: Partial<PointerInput> = {}): PointerInput => ({
  screen: { x, y }, button: 0, shift: false, alt: false, mod: false, pressure: 0.5, ...extra,
})
const key = (k: string) => ({ key: k, mod: false, shift: false })

function rect(store: BoardStore, x: number, y: number, w: number, h: number, patch: Partial<ShapeElement> = {}) {
  return store.create({
    type: 'rectangle', x, y, w, h, angle: 0, locked: false, ...DEFAULT_STYLE, label: '',
    fill: '#ffffff', fillStyle: 'solid', ...patch,
  })
}

describe('eraser', () => {
  it('eraser removes swept elements in one undo step', () => {
    const { c, store, history } = setup()
    const a = rect(store, 0, 0, 40, 40)
    const b = rect(store, 100, 0, 40, 40)
    const keep = rect(store, 0, 200, 40, 40)
    history.stopCapturing()
    expect(c.keyDown(key('e'))).toBe(true)
    expect(c.tool.value).toBe('eraser')
    c.pointerDown(ptr(-50, 20))
    // one long move: the segment between samples sweeps both shapes
    c.pointerMove(ptr(200, 20))
    expect(c.overlay().erasing).toEqual(new Set([a.id, b.id]))
    // marked, not yet removed
    expect(store.all()).toHaveLength(3)
    c.pointerUp(ptr(200, 20))
    expect(store.all().map(e => e.id)).toEqual([keep.id])
    expect(c.overlay().erasing.size).toBe(0)
    history.undo()
    expect(store.all()).toHaveLength(3)
    expect(c.keyDown(key('0'))).toBe(true)
    expect(c.tool.value).toBe('eraser')
  })

  it('hits within 8/zoom of the swept path', () => {
    const { c, store } = setup({ zoom: 2 })
    // stroke-only rectangle: hit on its outline at y = 0
    const a = rect(store, 0, 0, 40, 40, { fill: 'transparent', fillStyle: 'none' })
    c.setTool('eraser')
    // screen y = -14 → scene y = -7 (within 8/2 = 4? no) ; screen -6 → scene -3 (within 4)
    c.pointerDown(ptr(0, -14))
    c.pointerMove(ptr(60, -14))
    expect(c.overlay().erasing.size).toBe(0)
    c.pointerMove(ptr(60, -6))
    c.pointerMove(ptr(0, -6))
    expect(c.overlay().erasing).toEqual(new Set([a.id]))
    c.pointerUp(ptr(0, -6))
  })

  it('eraser skips locked', () => {
    const { c, store } = setup()
    const locked = rect(store, 0, 0, 40, 40, { locked: true })
    c.setTool('eraser')
    c.pointerDown(ptr(-10, 20))
    c.pointerMove(ptr(60, 20))
    expect(c.overlay().erasing.size).toBe(0)
    c.pointerUp(ptr(60, 20))
    expect(store.all().map(e => e.id)).toEqual([locked.id])
  })

  it('Escape clears marks', () => {
    const { c, store, history } = setup()
    rect(store, 0, 0, 40, 40)
    history.stopCapturing()
    c.setTool('eraser')
    c.pointerDown(ptr(-10, 20))
    c.pointerMove(ptr(60, 20))
    expect(c.overlay().erasing.size).toBe(1)
    expect(c.isGestureActive()).toBe(true)
    expect(c.keyDown(key('Escape'))).toBe(true)
    expect(c.overlay().erasing.size).toBe(0)
    c.pointerUp(ptr(60, 20))
    expect(store.all()).toHaveLength(1)
    expect(c.tool.value).toBe('eraser')
  })
})

describe('laser', () => {
  it('laser writes nothing to Y and trail expires after 1000ms', () => {
    vi.useFakeTimers()
    const { c, doc } = setup({ now: () => Date.now() })
    const updates = vi.fn()
    doc.on('update', updates)
    expect(c.keyDown(key('k'))).toBe(true)
    expect(c.tool.value).toBe('laser')
    c.pointerDown(ptr(0, 0))
    c.pointerMove(ptr(10, 0))
    vi.advanceTimersByTime(500)
    c.pointerMove(ptr(20, 0))
    c.pointerUp(ptr(20, 0))
    expect(c.laserTrail().map(p => p.x)).toEqual([0, 10, 20])
    expect(c.overlay().laser).toHaveLength(3)
    vi.advanceTimersByTime(600)
    // the first two points are older than 1000 ms
    expect(c.laserTrail().map(p => p.x)).toEqual([20])
    vi.advanceTimersByTime(500)
    expect(c.laserTrail()).toHaveLength(0)
    expect(updates).not.toHaveBeenCalled()
  })
})

describe('lasso', () => {
  it('lasso selects fully enclosed only', () => {
    const { c, store } = setup()
    const inside = rect(store, 20, 20, 30, 30)
    rect(store, 80, 20, 60, 30) // partially inside
    rect(store, 20, 60, 10, 10, { locked: true }) // inside but locked
    c.setTool('lasso')
    expect(c.tool.value).toBe('lasso')
    c.pointerDown(ptr(0, 0))
    c.pointerMove(ptr(100, 0))
    c.pointerMove(ptr(100, 100))
    expect(c.overlay().lasso).toHaveLength(3)
    c.pointerMove(ptr(0, 100))
    c.pointerUp(ptr(0, 100))
    expect([...c.selectedIds.value]).toEqual([inside.id])
    expect(c.overlay().lasso).toBeNull()
    expect(c.tool.value).toBe('select')
  })

  it('shift adds to the selection; rotated corners are tested', () => {
    const { c, store } = setup()
    const far = rect(store, 300, 300, 10, 10)
    // a 60×10 bar rotated 90° occupies x 45..55, y 5..65 — inside a 40..60 × 0..70 lasso
    const bar = rect(store, 20, 30, 60, 10, { angle: Math.PI / 2 })
    c.setSelection([far.id])
    c.setTool('lasso')
    c.pointerDown(ptr(40, 0, { shift: true }))
    c.pointerMove(ptr(60, 0))
    c.pointerMove(ptr(60, 70))
    c.pointerMove(ptr(40, 70))
    c.pointerUp(ptr(40, 70, { shift: true }))
    expect(new Set(c.selectedIds.value)).toEqual(new Set([far.id, bar.id]))
  })
})

describe('geometry', () => {
  it('pointInPolygon even-odd', () => {
    const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true)
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false)
    expect(pointInPolygon({ x: -1, y: 5 }, square)).toBe(false)
    // pentagram: the center is enclosed twice → outside under even-odd
    const star = [0, 2, 4, 1, 3].map(i => {
      const a = (i * 2 * Math.PI) / 5 - Math.PI / 2
      return { x: Math.cos(a) * 10, y: Math.sin(a) * 10 }
    })
    expect(pointInPolygon({ x: 0, y: 0 }, star)).toBe(false)
    // a star tip is inside
    expect(pointInPolygon({ x: 0, y: -8 }, star)).toBe(true)
    expect(pointInPolygon({ x: 0, y: 0 }, square.slice(0, 2))).toBe(false)
  })

  it('elementCorners are the unpadded rotated box corners', () => {
    const el = { x: 0, y: 0, w: 10, h: 20, angle: 0 }
    expect(elementCorners(el as never)).toEqual([
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }, { x: 0, y: 20 },
    ])
    const r = elementCorners({ ...el, angle: Math.PI / 2 } as never)
    // rotated 90° about (5, 10): spans x -5..15, y 5..15
    const xs = r.map(p => Math.round(p.x))
    const ys = r.map(p => Math.round(p.y))
    expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([-5, 15, 5, 15])
  })
})

describe('marquee containment (unpadded box)', () => {
  it('a rough, thick rect is selected by a marquee exactly around its box', () => {
    const { c, store } = setup()
    // start the marquee on empty canvas (a press on the corner would hit the rect and click-select it)
    c.pointerDown(ptr(100, 100))
    const a = rect(store, 100, 100, 100, 50, { strokeWidth: 4, roughness: 2 })
    c.pointerMove(ptr(200, 150))
    expect(c.overlay().marquee).toEqual({ minX: 100, minY: 100, maxX: 200, maxY: 150 })
    c.pointerUp(ptr(200, 150))
    expect([...c.selectedIds.value]).toEqual([a.id])
  })
})
