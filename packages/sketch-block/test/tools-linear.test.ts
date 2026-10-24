import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'

import { History } from '../src/model/history'
import { Scene } from '../src/model/scene'
import { BoardStore } from '../src/model/store'
import { DEFAULT_STYLE, type LinearElement, type LocalPoint } from '../src/model/types'
import { type PointerInput, ToolController } from '../src/tools/controller'
import { Viewport } from '../src/viewport'

// ---------- manual requestAnimationFrame ----------
let frames: FrameRequestCallback[] = []
const flushFrames = () => {
  const run = frames
  frames = []
  for (const cb of run) cb(0)
}

beforeEach(() => {
  frames = []
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.push(cb)
    return frames.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})
afterEach(() => vi.unstubAllGlobals())

function setup(opts: { zoom?: number } = {}) {
  const doc = new Y.Doc()
  const store = new BoardStore(doc)
  const scene = new Scene(store)
  const history = new History(store)
  const viewport = new Viewport()
  viewport.zoom = opts.zoom ?? 1
  viewport.x = 0
  viewport.y = 0
  const c = new ToolController({
    store, scene, history, viewport,
    readonly: () => false,
    style: () => DEFAULT_STYLE,
    invalidate: vi.fn(),
  })
  return { doc, store, scene, history, viewport, c }
}

const ptr = (x: number, y: number, extra: Partial<PointerInput> = {}): PointerInput => ({
  screen: { x, y }, button: 0, shift: false, alt: false, mod: false, pressure: 0.5, ...extra,
})
const key = (k: string) => ({ key: k, mod: false, shift: false })
const linears = (store: BoardStore) =>
  store.all().filter((e): e is LinearElement => e.type === 'line' || e.type === 'arrow')
const absPoints = (el: LinearElement) => el.points.map(([x, y]) => [x + el.x, y + el.y])

function click(c: ToolController, x: number, y: number, extra: Partial<PointerInput> = {}) {
  c.pointerDown(ptr(x, y, extra))
  c.pointerUp(ptr(x, y, extra))
}

function line(store: BoardStore, abs: LocalPoint[], patch: Partial<LinearElement> = {}) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of abs) {
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
  }
  return store.create({
    type: 'line', x: minX, y: minY, w: maxX - minX, h: maxY - minY, angle: 0, locked: false, ...DEFAULT_STYLE,
    points: abs.map(([x, y]) => [x - minX, y - minY] as LocalPoint),
    routing: 'straight', startArrowhead: 'none', endArrowhead: 'none', ...patch,
  }) as LinearElement
}

describe('line and arrow tools', () => {
  it('drag creates 2-point arrow with end arrowhead', () => {
    const { c, store, history } = setup()
    expect(c.keyDown(key('a'))).toBe(true)
    expect(c.tool.value).toBe('arrow')
    expect(c.cursor.value).toBe('crosshair')
    c.pointerDown(ptr(100, 100))
    c.pointerMove(ptr(60, 150))
    expect(c.overlay().draft?.type).toBe('arrow')
    expect(store.all()).toHaveLength(0)
    c.pointerUp(ptr(40, 160))
    expect(c.overlay().draft).toBeNull()
    const [el, ...rest] = linears(store)
    expect(rest).toHaveLength(0)
    expect(el).toMatchObject({
      type: 'arrow', x: 40, y: 100, w: 60, h: 60,
      routing: 'straight', startArrowhead: 'none', endArrowhead: 'arrow', stroke: '#1e1e1e', angle: 0,
    })
    expect(el!.points).toEqual([[60, 0], [0, 60]])
    // back to select with the new element selected
    expect(c.tool.value).toBe('select')
    expect([...c.selectedIds.value]).toEqual([el!.id])
    expect(c.isGestureActive()).toBe(false)
    history.undo()
    expect(store.all()).toHaveLength(0)
  })

  it('line key 6 / l selects the line tool; drag creates a line with no heads', () => {
    const { c, store } = setup()
    expect(c.keyDown(key('6'))).toBe(true)
    expect(c.tool.value).toBe('line')
    c.setTool('select')
    expect(c.keyDown(key('l'))).toBe(true)
    expect(c.keyDown(key('5'))).toBe(true)
    expect(c.tool.value).toBe('arrow')
    c.setTool('line')
    c.pointerDown(ptr(0, 0))
    c.pointerMove(ptr(50, 0))
    c.pointerUp(ptr(50, 0))
    expect(linears(store)[0]).toMatchObject({ type: 'line', startArrowhead: 'none', endArrowhead: 'none', h: 0 })
  })

  it('toolLocked keeps the tool after creating', () => {
    const { c, store } = setup()
    c.setTool('line')
    c.toolLocked.value = true
    c.pointerDown(ptr(0, 0))
    c.pointerMove(ptr(50, 50))
    c.pointerUp(ptr(50, 50))
    expect(linears(store)).toHaveLength(1)
    expect(c.tool.value).toBe('line')
  })

  it('click-click-Enter creates 3-point line', () => {
    const { c, store, history } = setup()
    c.setTool('line')
    click(c, 10, 10)
    // multi-point mode spans clicks: a gesture is active between them
    expect(c.isGestureActive()).toBe(true)
    expect(store.all()).toHaveLength(0)
    c.pointerMove(ptr(50, 30))
    expect(c.overlay().previewSegment).toEqual([{ x: 10, y: 10 }, { x: 50, y: 30 }])
    click(c, 50, 30)
    c.pointerMove(ptr(80, 0))
    expect(c.overlay().previewSegment).toEqual([{ x: 50, y: 30 }, { x: 80, y: 0 }])
    click(c, 90, 10)
    const draft = c.overlay().draft as LinearElement
    expect(draft.type).toBe('line')
    expect(absPoints(draft)).toEqual([[10, 10], [50, 30], [90, 10]])
    // tool keys are ignored mid-gesture
    expect(c.keyDown(key('r'))).toBe(false)
    expect(c.tool.value).toBe('line')
    expect(store.all()).toHaveLength(0)
    expect(c.keyDown(key('Enter'))).toBe(true)
    expect(c.isGestureActive()).toBe(false)
    expect(c.overlay().previewSegment).toBeNull()
    expect(c.overlay().draft).toBeNull()
    const [el, ...rest] = linears(store)
    expect(rest).toHaveLength(0)
    expect(el).toMatchObject({ type: 'line', x: 10, y: 10, w: 80, h: 20 })
    expect(absPoints(el!)).toEqual([[10, 10], [50, 30], [90, 10]])
    expect(c.tool.value).toBe('select')
    history.undo()
    expect(store.all()).toHaveLength(0)
  })

  it('a click on the last point finishes', () => {
    const { c, store } = setup()
    c.setTool('arrow')
    click(c, 0, 0)
    click(c, 100, 0)
    click(c, 102, 1)
    expect(c.isGestureActive()).toBe(false)
    const [el] = linears(store)
    expect(absPoints(el!)).toEqual([[0, 0], [100, 0]])
  })

  it('Escape finishes a multi-point arrow with 2+ points', () => {
    const { c, store } = setup()
    c.setTool('arrow')
    click(c, 0, 0)
    click(c, 100, 0)
    expect(c.keyDown(key('Escape'))).toBe(true)
    expect(linears(store)).toHaveLength(1)
  })

  it('Escape with one point creates nothing', () => {
    const { c, store } = setup()
    c.setTool('line')
    click(c, 10, 10)
    c.pointerMove(ptr(60, 60))
    expect(c.keyDown(key('Escape'))).toBe(true)
    expect(store.all()).toHaveLength(0)
    expect(c.isGestureActive()).toBe(false)
    expect(c.overlay().previewSegment).toBeNull()
    expect(c.overlay().draft).toBeNull()
  })

  it('repeated clicks on one spot create nothing (fewer than 2 distinct points)', () => {
    const { c, store } = setup()
    c.setTool('line')
    click(c, 10, 10)
    click(c, 10, 10)
    expect(c.isGestureActive()).toBe(false)
    expect(store.all()).toHaveLength(0)
  })

  it('Escape during the first drag creates nothing', () => {
    const { c, store } = setup()
    c.setTool('arrow')
    c.pointerDown(ptr(0, 0))
    c.pointerMove(ptr(80, 80))
    expect(c.keyDown(key('Escape'))).toBe(true)
    c.pointerUp(ptr(80, 80))
    expect(store.all()).toHaveLength(0)
    expect(c.overlay().draft).toBeNull()
  })

  it('switching tool discards a pending multi-point draft', () => {
    const { c, store } = setup()
    c.setTool('line')
    click(c, 0, 0)
    click(c, 50, 0)
    c.setTool('select')
    expect(c.isGestureActive()).toBe(false)
    expect(store.all()).toHaveLength(0)
    expect(c.overlay().draft).toBeNull()
  })

  it('shift snaps to 15°', () => {
    const { c, store } = setup()
    c.setTool('line')
    c.pointerDown(ptr(0, 0))
    c.pointerMove(ptr(100, 30, { shift: true }))
    c.pointerUp(ptr(100, 30, { shift: true }))
    const [el] = linears(store)
    const [[x0, y0], [x1, y1]] = absPoints(el!) as [[number, number], [number, number]]
    const deg = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI
    expect(Math.abs(deg / 15 - Math.round(deg / 15))).toBeLessThan(1e-9)
    expect(Math.round(deg)).toBe(15)
    // segment length is kept
    expect(Math.hypot(x1 - x0, y1 - y0)).toBeCloseTo(Math.hypot(100, 30), 9)
    expect(el!.w).toBeGreaterThanOrEqual(0)
    expect(el!.h).toBeGreaterThanOrEqual(0)

    // multi-point clicks snap relative to the previous point
    c.setTool('line')
    click(c, 0, 200)
    c.pointerMove(ptr(100, 203, { shift: true }))
    expect(c.overlay().previewSegment![1].y).toBeCloseTo(200, 9)
    click(c, 100, 203, { shift: true })
    c.keyDown(key('Enter'))
    const second = linears(store)[1]!
    expect(second.h).toBeCloseTo(0, 9)
  })
})

describe('point editing', () => {
  it('a single selected linear element exposes point handles in scene coords', () => {
    const { c, store } = setup()
    const el = line(store, [[10, 10], [110, 60]])
    expect(c.overlay().pointHandles).toBeNull()
    c.setSelection([el.id])
    expect(c.overlay().pointHandles).toEqual([{ x: 10, y: 10 }, { x: 110, y: 60 }])
    const other = line(store, [[0, 0], [5, 5]])
    c.setSelection([el.id, other.id])
    expect(c.overlay().pointHandles).toBeNull()
    store.update(other.id, { locked: true })
    c.setSelection([other.id])
    expect(c.overlay().pointHandles).toBeNull()
  })

  it('point handles follow rotation', () => {
    const { c, store } = setup()
    const el = line(store, [[0, 0], [100, 0]], { angle: Math.PI / 2 })
    c.setSelection([el.id])
    const [a, b] = c.overlay().pointHandles!
    // center (50,0); rotated 90° clockwise
    expect(a!.x).toBeCloseTo(50, 9)
    expect(a!.y).toBeCloseTo(-50, 9)
    expect(b!.x).toBeCloseTo(50, 9)
    expect(b!.y).toBeCloseTo(50, 9)
  })

  it('dragging a point updates points and box in one undo step', () => {
    const { c, store, history } = setup()
    const el = line(store, [[0, 0], [100, 0], [200, 100]])
    history.stopCapturing()
    c.setSelection([el.id])
    c.pointerDown(ptr(100, 0))
    c.pointerMove(ptr(120, -40))
    flushFrames()
    c.pointerMove(ptr(130, -50))
    flushFrames()
    c.pointerUp(ptr(140, -60))
    const moved = store.get(el.id) as LinearElement
    expect(moved).toMatchObject({ x: 0, y: -60, w: 200, h: 160 })
    expect(absPoints(moved)).toEqual([[0, 0], [140, -60], [200, 100]])
    expect(c.selectedIds.value.has(el.id)).toBe(true)
    history.undo()
    const back = store.get(el.id) as LinearElement
    expect(back).toMatchObject({ x: 0, y: 0, w: 200, h: 100 })
    expect(absPoints(back)).toEqual([[0, 0], [100, 0], [200, 100]])
    expect(store.all()).toHaveLength(1)
  })

  it('points normalized so w,h ≥ 0 after dragging past the origin', () => {
    const { c, store } = setup()
    const el = line(store, [[50, 50], [150, 150]])
    c.setSelection([el.id])
    c.pointerDown(ptr(150, 150))
    c.pointerMove(ptr(0, 10))
    c.pointerUp(ptr(0, 10))
    const moved = store.get(el.id) as LinearElement
    expect(moved.w).toBeGreaterThanOrEqual(0)
    expect(moved.h).toBeGreaterThanOrEqual(0)
    expect(moved).toMatchObject({ x: 0, y: 10, w: 50, h: 40 })
    expect(moved.points).toEqual([[50, 40], [0, 0]])
  })

  it('dragging a point of a rotated line keeps the other points in place', () => {
    const { c, store } = setup()
    const el = line(store, [[0, 0], [100, 0]], { angle: Math.PI / 2 })
    c.setSelection([el.id])
    const [, b] = c.overlay().pointHandles!
    c.pointerDown(ptr(b!.x, b!.y))
    c.pointerMove(ptr(80, 70))
    c.pointerUp(ptr(80, 70))
    const [a2, b2] = c.overlay().pointHandles!
    expect(a2!.x).toBeCloseTo(50, 9)
    expect(a2!.y).toBeCloseTo(-50, 9)
    expect(b2!.x).toBeCloseTo(80, 9)
    expect(b2!.y).toBeCloseTo(70, 9)
    const moved = store.get(el.id) as LinearElement
    expect(moved.angle).toBe(Math.PI / 2)
  })

  it('Escape during a point drag reverts only the touched keys, no undo step', () => {
    const { c, store, history } = setup()
    const el = line(store, [[0, 0], [100, 0]])
    history.stopCapturing()
    c.setSelection([el.id])
    c.pointerDown(ptr(100, 0))
    c.pointerMove(ptr(100, 80))
    flushFrames()
    expect(absPoints(store.get(el.id) as LinearElement)).toEqual([[0, 0], [100, 80]])
    // concurrent edit to an untouched prop survives the cancel
    store.update(el.id, { stroke: '#e03131' })
    expect(c.keyDown(key('Escape'))).toBe(true)
    const back = store.get(el.id) as LinearElement
    expect(back).toMatchObject({ x: 0, y: 0, w: 100, h: 0, stroke: '#e03131' })
    expect(absPoints(back)).toEqual([[0, 0], [100, 0]])
    // the only undo step left is the creation
    history.undo()
    expect(store.all()).toHaveLength(0)
  })

  it('points take priority over resize handles', () => {
    const { c, store } = setup()
    // 3 points: resize handles show; the nw corner coincides with point 0
    const el = line(store, [[0, 0], [100, 50], [200, 0]])
    c.setSelection([el.id])
    c.pointerDown(ptr(0, 0))
    c.pointerMove(ptr(-20, -20))
    c.pointerUp(ptr(-20, -20))
    const moved = store.get(el.id) as LinearElement
    expect(absPoints(moved)).toEqual([[-20, -20], [100, 50], [200, 0]])
  })

  it('a 2-point line has no resize handles; 3+ points still resize', () => {
    const { c, store } = setup()
    const two = line(store, [[0, 0], [100, 100]])
    c.setSelection([two.id])
    // the `n` handle position (50, 0) is not a handle: pressing there starts a marquee (empty space)
    c.pointerDown(ptr(50, 0))
    c.pointerMove(ptr(60, 10))
    c.pointerUp(ptr(60, 10))
    expect(store.get(two.id)).toMatchObject({ x: 0, y: 0, w: 100, h: 100 })

    const three = line(store, [[300, 0], [350, 100], [400, 0]])
    c.setSelection([three.id])
    // `e` handle at (400, 50)
    c.pointerDown(ptr(400, 50))
    c.pointerMove(ptr(500, 50))
    c.pointerUp(ptr(500, 50))
    expect(store.get(three.id)).toMatchObject({ x: 300, w: 200 })
  })
})
