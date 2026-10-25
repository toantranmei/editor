import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'

import { GRID_SIZE, snapMove, snapPoint } from '../src/geometry/snap'
import { History } from '../src/model/history'
import { Scene } from '../src/model/scene'
import { BoardStore } from '../src/model/store'
import { DEFAULT_STYLE, type ElementInit, type LinearElement, type ShapeElement } from '../src/model/types'
import { setMeasurer } from '../src/text/measure'
import { type PointerInput, ToolController } from '../src/tools/controller'
import { Viewport } from '../src/viewport'

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 0)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  setMeasurer((text, font) => text.length * (Number.parseFloat(font) || 16) * 0.5)
})
afterEach(() => {
  setMeasurer(null)
  vi.unstubAllGlobals()
})

function setup(zoom = 1) {
  const store = new BoardStore(new Y.Doc())
  const scene = new Scene(store)
  const history = new History(store)
  const viewport = new Viewport()
  viewport.zoom = zoom
  viewport.x = 0
  viewport.y = 0
  const c = new ToolController({ store, scene, history, viewport, readonly: () => false, invalidate: vi.fn() })
  return { store, scene, history, viewport, c }
}

const ptr = (x: number, y: number, extra: Partial<PointerInput> = {}): PointerInput => ({
  screen: { x, y }, button: 0, shift: false, alt: false, mod: false, pressure: 0.5, ...extra,
})

const rect = (store: BoardStore, x: number, y: number, w = 50, h = 50, over: Partial<ShapeElement> = {}) =>
  store.create({
    ...DEFAULT_STYLE, fill: '#ffffff', fillStyle: 'solid', type: 'rectangle', label: '', x, y, w, h, angle: 0, locked: false,
    ...over,
  } as ElementInit) as ShapeElement

const box = (minX: number, minY: number, maxX: number, maxY: number) => ({ minX, minY, maxX, maxY })

describe('snap geometry', () => {
  it('snapMove aligns left edges within threshold', () => {
    const r = snapMove(box(104, 300, 154, 350), [box(100, 0, 200, 50)], 6)
    expect(r.dx).toBe(-4)
    expect(r.dy).toBe(0)
    // a vertical guide at x=100 spanning both boxes
    expect(r.guides).toContainEqual({ x1: 100, y1: 0, x2: 100, y2: 350 })
  })

  it('snapMove aligns centers and right/bottom edges', () => {
    // moving center x = 147 → candidate center 150
    const r = snapMove(box(122, 95, 172, 147), [box(100, 0, 200, 150)], 6)
    expect(r.dx).toBe(3)
    // bottom 147 → candidate bottom 150
    expect(r.dy).toBe(3)
  })

  it('no snap beyond threshold', () => {
    const r = snapMove(box(107, 300, 157, 357), [box(100, 0, 200, 50)], 6)
    expect(r.dx).toBe(0)
    expect(r.dy).toBe(0)
    expect(r.guides).toEqual([])
  })

  it('snapPoint rounds to the grid, or keeps the point without one', () => {
    expect(snapPoint({ x: 29, y: -11 }, 20)).toEqual({ x: 20, y: -20 })
    expect(snapPoint({ x: 29, y: -11 }, null)).toEqual({ x: 29, y: -11 })
    expect(GRID_SIZE).toBe(20)
  })
})

describe('snapping in tools', () => {
  it('defaults: grid off, object snap on', () => {
    const { c } = setup()
    expect(c.grid.value).toBe(false)
    expect(c.objectSnap.value).toBe(true)
  })

  it('grid snaps create', () => {
    const { c, store } = setup()
    c.grid.value = true
    c.setTool('rectangle')
    c.pointerDown(ptr(3, 4))
    c.pointerMove(ptr(57, 98))
    c.pointerUp(ptr(57, 98))
    const el = store.all()[0]!
    expect([el.x, el.y, el.w, el.h]).toEqual([0, 0, 60, 100])
  })

  it('grid snaps a move to the grid', () => {
    const { c, store } = setup()
    c.objectSnap.value = false
    c.grid.value = true
    const a = rect(store, 0, 0)
    c.pointerDown(ptr(10, 10))
    c.pointerMove(ptr(17, 13))
    c.pointerUp(ptr(17, 13))
    expect([store.get(a.id)!.x, store.get(a.id)!.y]).toEqual([0, 0])
    c.pointerDown(ptr(10, 10))
    c.pointerMove(ptr(23, 25))
    c.pointerUp(ptr(23, 25))
    expect([store.get(a.id)!.x, store.get(a.id)!.y]).toEqual([20, 20])
  })

  it('alt disables snap', () => {
    const { c, store } = setup()
    c.grid.value = true
    const a = rect(store, 0, 0)
    c.pointerDown(ptr(10, 10))
    c.pointerMove(ptr(17, 13, { alt: true }))
    c.pointerUp(ptr(17, 13, { alt: true }))
    expect([store.get(a.id)!.x, store.get(a.id)!.y]).toEqual([7, 3])
    expect(c.overlay().guides).toEqual([])
  })

  it('object snap aligns a moved element to another one and shows guides', () => {
    const { c, store } = setup()
    rect(store, 100, 0, 100, 50)
    const b = rect(store, 300, 300)
    c.pointerDown(ptr(310, 310))
    // left edge would land at 104 → snaps to 100
    c.pointerMove(ptr(114, 310))
    expect(c.overlay().guides.length).toBeGreaterThan(0)
    c.pointerUp(ptr(114, 310))
    expect(store.get(b.id)!.x).toBe(100)
    expect(store.get(b.id)!.y).toBe(300)
  })

  it('object snap wins over grid within threshold; grid applies otherwise', () => {
    const { c, store } = setup()
    c.grid.value = true
    rect(store, 103, 0, 100, 50)
    const b = rect(store, 300, 300)
    c.pointerDown(ptr(310, 310))
    c.pointerMove(ptr(115, 315))
    c.pointerUp(ptr(115, 315))
    // x: left 105 within 6 of 103 → 103; y: 305 → grid 300
    expect([store.get(b.id)!.x, store.get(b.id)!.y]).toEqual([103, 300])
  })

  it('object snap never targets the moving elements or the lines bound to them', () => {
    const { c, store } = setup()
    const a = rect(store, 0, 0)
    const b = rect(store, 200, 0)
    store.create({
      ...DEFAULT_STYLE, type: 'arrow', label: '', x: 50, y: 25, w: 150, h: 0, angle: 0, locked: false,
      points: [[0, 0], [150, 0]], routing: 'straight', startArrowhead: null, endArrowhead: 'arrow',
      startBinding: { id: a.id, ax: 1, ay: 0.5 }, endBinding: { id: b.id, ax: 0, ay: 0.5 },
    } as unknown as ElementInit) as LinearElement
    c.pointerDown(ptr(10, 10))
    // only a's own old spot (x 0) and its bound arrow (x 50, right edge 53) are near: no snap
    c.pointerMove(ptr(13, 10))
    c.pointerUp(ptr(13, 10))
    expect(store.get(a.id)!.x).toBe(3)
  })

  it('object snap moves a resized edge', () => {
    const { c, store } = setup()
    rect(store, 200, 0, 50, 50)
    const b = rect(store, 0, 100, 100, 50)
    c.setSelection([b.id])
    // drag the e handle (100,125) to 196 → snaps to 200
    c.pointerDown(ptr(100, 125))
    c.pointerMove(ptr(196, 125))
    c.pointerUp(ptr(196, 125))
    expect(store.get(b.id)!.w).toBe(200)
    expect(store.get(b.id)!.x).toBe(0)
  })

  it('grid snaps a resize', () => {
    const { c, store } = setup()
    c.grid.value = true
    const b = rect(store, 0, 100, 100, 60)
    c.setSelection([b.id])
    c.pointerDown(ptr(100, 160))
    c.pointerMove(ptr(147, 189))
    c.pointerUp(ptr(147, 189))
    expect([store.get(b.id)!.w, store.get(b.id)!.h]).toEqual([140, 80])
  })

  it('grid snaps line points', () => {
    const { c, store } = setup()
    c.grid.value = true
    c.setTool('line')
    c.pointerDown(ptr(3, 2))
    c.pointerMove(ptr(98, 51))
    c.pointerUp(ptr(98, 51))
    const el = store.all()[0] as LinearElement
    expect([el.x, el.y]).toEqual([0, 0])
    expect(el.points[el.points.length - 1]).toEqual([100, 60])
  })

  it('guides cleared on up', () => {
    const { c, store } = setup()
    rect(store, 100, 0, 100, 50)
    rect(store, 300, 300)
    c.pointerDown(ptr(310, 310))
    c.pointerMove(ptr(114, 310))
    expect(c.overlay().guides.length).toBeGreaterThan(0)
    c.pointerUp(ptr(114, 310))
    expect(c.overlay().guides).toEqual([])
  })

  it('guides cleared on Escape', () => {
    const { c, store } = setup()
    rect(store, 100, 0, 100, 50)
    rect(store, 300, 300)
    c.pointerDown(ptr(310, 310))
    c.pointerMove(ptr(114, 310))
    expect(c.overlay().guides.length).toBeGreaterThan(0)
    expect(c.keyDown({ key: 'Escape', mod: false, shift: false })).toBe(true)
    expect(c.overlay().guides).toEqual([])
  })

  it('mod+\' toggles grid', () => {
    const { c } = setup()
    expect(c.keyDown({ key: '\'', code: 'Quote', mod: true, shift: false, alt: false })).toBe(true)
    expect(c.grid.value).toBe(true)
    expect(c.keyDown({ key: '\'', code: 'Quote', mod: true, shift: false, alt: false })).toBe(true)
    expect(c.grid.value).toBe(false)
  })

  it('Alt+S toggles object snap (matched by code: macOS Alt composes the key)', () => {
    const { c } = setup()
    expect(c.keyDown({ key: 'ß', code: 'KeyS', mod: false, shift: false, alt: true })).toBe(true)
    expect(c.objectSnap.value).toBe(false)
    expect(c.tool.value).toBe('select')
    expect(c.keyDown({ key: 's', code: 'KeyS', mod: false, shift: false, alt: true })).toBe(true)
    expect(c.objectSnap.value).toBe(true)
  })
})
