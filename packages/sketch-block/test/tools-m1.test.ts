import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'

import { polylineDistance } from '../src/geometry/math'
import { History } from '../src/model/history'
import { Scene } from '../src/model/scene'
import { BoardStore } from '../src/model/store'
import { DEFAULT_STYLE, type FreedrawElement, type LocalPoint, type ShapeElement } from '../src/model/types'
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

function setup(opts: { zoom?: number; x?: number; y?: number } = {}) {
  const doc = new Y.Doc()
  const store = new BoardStore(doc)
  const scene = new Scene(store)
  const history = new History(store)
  const viewport = new Viewport()
  viewport.zoom = opts.zoom ?? 1
  viewport.x = opts.x ?? 0
  viewport.y = opts.y ?? 0
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

const key = (k: string, mods: { mod?: boolean; shift?: boolean } = {}) => ({ key: k, mod: false, shift: false, ...mods })

function rect(store: BoardStore, x: number, y: number, w: number, h: number, patch: Partial<ShapeElement> = {}) {
  return store.create({
    type: 'rectangle', x, y, w, h, angle: 0, locked: false, ...DEFAULT_STYLE, label: '',
    fill: '#ffffff', fillStyle: 'solid', ...patch,
  })
}

const freedraws = (store: BoardStore) => store.all().filter((e): e is FreedrawElement => e.type === 'freedraw')

describe('pen and highlighter', () => {
  it('pen stroke creates one freedraw element and one undo step', () => {
    const { c, store, history } = setup({ zoom: 2, x: 10, y: 20 })
    expect(c.keyDown(key('p'))).toBe(true)
    expect(c.tool.value).toBe('pen')
    expect(c.cursor.value).toBe('crosshair')
    c.pointerDown(ptr(0, 0))
    c.pointerMove(ptr(20, 0))
    // in-progress stroke is a draft, not in Y
    expect(c.overlay().draft?.type).toBe('freedraw')
    expect(store.all()).toHaveLength(0)
    c.pointerMove(ptr(20, 40))
    c.pointerUp(ptr(20, 40))
    expect(c.overlay().draft).toBeNull()
    const [el, ...rest] = freedraws(store)
    expect(rest).toHaveLength(0)
    // scene = screen / zoom + offset
    expect(el).toMatchObject({ x: 10, y: 20, w: 10, h: 20, highlighter: false, pressures: [], stroke: '#1e1e1e' })
    expect(el!.points).toEqual([[0, 0], [10, 0], [10, 20]])
    // pen stays active, nothing selected
    expect(c.tool.value).toBe('pen')
    expect(c.selectedIds.value.size).toBe(0)
    history.undo()
    expect(store.all()).toHaveLength(0)
  })

  it('records real pen pressures; mouse (pressure 0.5) stores none', () => {
    const { c, store } = setup()
    c.setTool('pen')
    c.pointerDown(ptr(0, 0, { pressure: 0.2 }))
    c.pointerMove(ptr(10, 10, { pressure: 0.6 }))
    c.pointerUp(ptr(20, 0, { pressure: 0.9 }))
    const [el] = freedraws(store)
    expect(el!.points).toHaveLength(3)
    expect(el!.pressures).toEqual([0.2, 0.6, 0.9])
  })

  it('simplifies a 5000-point stroke to fewer points within 0.5 units', () => {
    const { c, store } = setup()
    c.setTool('pen')
    const abs: LocalPoint[] = []
    for (let i = 0; i < 5000; i++) {
      const x = i * 0.1
      const y = Math.sin(i / 200) * 50 + 100
      abs.push([x, y])
    }
    const pressureAt = (x: number) => Math.round((0.1 + (x / 500) * 0.8) * 1000) / 1000
    c.pointerDown(ptr(abs[0]![0], abs[0]![1], { pressure: pressureAt(abs[0]![0]) }))
    for (const [x, y] of abs.slice(1, -1)) c.pointerMove(ptr(x, y, { pressure: pressureAt(x) }))
    c.pointerUp(ptr(abs[4999]![0], abs[4999]![1], { pressure: pressureAt(abs[4999]![0]) }))
    const [el] = freedraws(store)
    expect(el!.points.length).toBeLessThan(5000)
    // each kept point keeps its own pressure
    expect(el!.pressures).toHaveLength(el!.points.length)
    el!.points.forEach(([x], i) => expect(el!.pressures[i]).toBe(pressureAt(x + el!.x)))
    expect(el!.points.length).toBeGreaterThan(2)
    const sceneOf = el!.points.map(([x, y]) => [x + el!.x, y + el!.y] as const)
    for (const [x, y] of abs) expect(polylineDistance(sceneOf, { x, y })).toBeLessThanOrEqual(0.5 + 1e-9)
  })

  it('pen draft tracks the stroke box and local points', () => {
    const { c } = setup()
    c.setTool('pen')
    c.pointerDown(ptr(50, 50))
    c.pointerMove(ptr(80, 20))
    c.pointerMove(ptr(10, 60, { pressure: 0.7 }))
    const d = c.overlay().draft as FreedrawElement
    expect(d).toMatchObject({ x: 10, y: 20, w: 70, h: 40, highlighter: false })
    expect(d.points).toEqual([[40, 30], [70, 0], [0, 40]])
    expect(d.pressures).toEqual([0.5, 0.5, 0.7])
    c.cancelGesture()
  })

  it('pen click creates a dot', () => {
    const { c, store } = setup()
    c.setTool('pen')
    c.pointerDown(ptr(30, 40))
    c.pointerUp(ptr(30, 40))
    const [el, ...rest] = freedraws(store)
    expect(rest).toHaveLength(0)
    expect(el).toMatchObject({ x: 30, y: 40, w: 0, h: 0 })
    expect(el!.points).toEqual([[0, 0]])
  })

  it('highlighter sets highlighter true', () => {
    const { c, store } = setup()
    expect(c.keyDown(key('m'))).toBe(true)
    expect(c.tool.value).toBe('highlighter')
    c.pointerDown(ptr(0, 0))
    c.pointerMove(ptr(10, 5))
    c.pointerUp(ptr(10, 5))
    const [el] = freedraws(store)
    expect(el!.highlighter).toBe(true)
    expect(c.tool.value).toBe('highlighter')
  })

  it('coalesced points are all consumed', () => {
    const { c, store } = setup()
    c.setTool('pen')
    c.pointerDown(ptr(0, 0))
    c.pointerMove(ptr(30, 0, {
      coalesced: [{ x: 10, y: 3 }, { x: 20, y: -3 }, { x: 30, y: 0 }],
    }))
    c.pointerUp(ptr(30, 0))
    const [el] = freedraws(store)
    expect(el!.points.map(([x, y]) => [x + el!.x, y + el!.y])).toEqual([[0, 0], [10, 3], [20, -3], [30, 0]])
  })

  it('unimplemented tools are not reachable by key or setTool', () => {
    const { c } = setup()
    expect(c.keyDown(key('e'))).toBe(false)
    c.setTool('eraser')
    expect(c.tool.value).toBe('select')
  })
})

describe('gesture-safe keys', () => {
  it('Escape during move reverts positions', () => {
    const { c, store, history } = setup()
    const a = rect(store, 0, 0, 50, 50)
    const b = rect(store, 100, 0, 50, 50)
    history.stopCapturing()
    c.setSelection([a.id, b.id])
    c.pointerDown(ptr(25, 25))
    c.pointerMove(ptr(75, 45))
    flushFrames()
    expect(store.get(a.id)).toMatchObject({ x: 50, y: 20 })
    expect(c.isGestureActive()).toBe(true)
    expect(c.keyDown(key('Escape'))).toBe(true)
    expect(c.isGestureActive()).toBe(false)
    expect(store.get(a.id)).toMatchObject({ x: 0, y: 0 })
    expect(store.get(b.id)).toMatchObject({ x: 100, y: 0 })
    // later moves / up do nothing; selection kept
    c.pointerMove(ptr(200, 200))
    c.pointerUp(ptr(200, 200))
    flushFrames()
    expect(store.get(a.id)).toMatchObject({ x: 0, y: 0 })
    expect(c.selectedIds.value.size).toBe(2)
    // undo stack unchanged: the next undo removes the rectangles
    history.undo()
    expect(store.all()).toHaveLength(0)
  })

  it('Escape during move keeps a concurrent remote edit and reverts x/y', () => {
    const { c, doc, store, history } = setup()
    const remote = new Y.Doc()
    const sync = (from: Y.Doc, to: Y.Doc) => Y.applyUpdate(to, Y.encodeStateAsUpdate(from, Y.encodeStateVector(to)))
    const a = rect(store, 0, 0, 50, 50)
    history.stopCapturing()
    sync(doc, remote)
    c.setSelection([a.id])
    c.pointerDown(ptr(25, 25))
    c.pointerMove(ptr(75, 45))
    flushFrames()
    // collaborator recolors the element mid-drag
    ;(remote.getMap('elements').get(a.id) as Y.Map<unknown>).set('stroke', '#e03131')
    sync(remote, doc)
    expect(store.get(a.id)!.stroke).toBe('#e03131')
    c.keyDown(key('Escape'))
    expect(store.get(a.id)).toMatchObject({ x: 0, y: 0, stroke: '#e03131' })
  })

  it('cancelling a freedraw move writes only x and y', () => {
    const { c, doc, store, history } = setup()
    const f = store.create({
      type: 'freedraw', x: 0, y: 0, w: 40, h: 40, angle: 0, locked: false, ...DEFAULT_STYLE,
      points: [[0, 0], [40, 40]], pressures: [], highlighter: false,
    })
    history.stopCapturing()
    c.setSelection([f.id])
    c.pointerDown(ptr(20, 20))
    c.pointerMove(ptr(60, 30))
    flushFrames()
    const changed: string[] = []
    const m = doc.getMap('elements').get(f.id) as Y.Map<unknown>
    m.observe(ev => changed.push(...ev.keysChanged))
    c.keyDown(key('Escape'))
    expect(new Set(changed)).toEqual(new Set(['x', 'y', 'version']))
    expect(store.get(f.id)).toMatchObject({ x: 0, y: 0 })
  })

  it('Escape during resize reverts the box', () => {
    const { c, store, history } = setup()
    const a = rect(store, 0, 0, 50, 50)
    history.stopCapturing()
    c.setSelection([a.id])
    c.pointerDown(ptr(50, 50)) // se handle
    c.pointerMove(ptr(120, 90))
    flushFrames()
    expect(store.get(a.id)).toMatchObject({ w: 120, h: 90 })
    c.keyDown(key('Escape'))
    expect(store.get(a.id)).toMatchObject({ x: 0, y: 0, w: 50, h: 50 })
    history.undo()
    expect(store.all()).toHaveLength(0)
  })

  it('Escape before the first frame writes nothing', () => {
    const { c, store, history } = setup()
    const a = rect(store, 0, 0, 50, 50)
    history.stopCapturing()
    const v = store.get(a.id)!.version
    c.setSelection([a.id])
    c.pointerDown(ptr(25, 25))
    c.pointerMove(ptr(75, 45))
    c.keyDown(key('Escape'))
    flushFrames()
    expect(store.get(a.id)).toMatchObject({ x: 0, y: 0, version: v })
  })

  it('Delete and mod+z ignored while pointer down', () => {
    const { c, store, history } = setup()
    const a = rect(store, 0, 0, 50, 50)
    history.stopCapturing()
    c.setSelection([a.id])
    c.pointerDown(ptr(25, 25))
    c.pointerMove(ptr(35, 25))
    flushFrames()
    expect(c.keyDown(key('Delete'))).toBe(false)
    expect(c.keyDown(key('Backspace'))).toBe(false)
    expect(c.keyDown(key('z', { mod: true }))).toBe(false)
    expect(c.keyDown(key('y', { mod: true }))).toBe(false)
    expect(c.keyDown(key('ArrowLeft'))).toBe(false)
    expect(c.keyDown(key('r'))).toBe(false)
    expect(c.tool.value).toBe('select')
    expect(store.get(a.id)).toMatchObject({ x: 10, y: 0 })
    c.pointerUp(ptr(35, 25))
    flushFrames()
    expect(store.get(a.id)).toMatchObject({ x: 10, y: 0 })
    expect(c.isGestureActive()).toBe(false)
    // move is one undo step
    history.undo()
    expect(store.get(a.id)).toMatchObject({ x: 0, y: 0 })
  })

  it('Escape during shape draft creates nothing', () => {
    const { c, store } = setup()
    c.setTool('rectangle')
    c.pointerDown(ptr(0, 0))
    c.pointerMove(ptr(100, 100))
    expect(c.overlay().draft).not.toBeNull()
    expect(c.keyDown(key('Escape'))).toBe(true)
    expect(c.overlay().draft).toBeNull()
    c.pointerUp(ptr(100, 100))
    expect(store.all()).toHaveLength(0)
  })

  it('Escape during a pen stroke creates nothing', () => {
    const { c, store } = setup()
    c.setTool('pen')
    c.pointerDown(ptr(0, 0))
    c.pointerMove(ptr(50, 50))
    expect(c.keyDown(key('Escape'))).toBe(true)
    expect(c.overlay().draft).toBeNull()
    c.pointerUp(ptr(50, 50))
    expect(store.all()).toHaveLength(0)
    expect(c.tool.value).toBe('pen')
  })

  it('shape tool commits with the draft seed in one write', () => {
    const { c, store } = setup()
    c.setTool('rectangle')
    c.pointerDown(ptr(0, 0))
    c.pointerMove(ptr(100, 100))
    const seed = c.overlay().draft!.seed
    c.pointerUp(ptr(100, 100))
    expect(store.all()[0]).toMatchObject({ seed, version: 1 })
  })
})
