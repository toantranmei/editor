import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'

import { handlePositions } from '../src/geometry'
import { History } from '../src/model/history'
import { Scene } from '../src/model/scene'
import { BoardStore } from '../src/model/store'
import { DEFAULT_STYLE, type ShapeElement, type SketchElement } from '../src/model/types'
import { type PointerInput, ToolController } from '../src/tools/controller'
import { Viewport } from '../src/viewport'

// ---------- manual requestAnimationFrame ----------
let frames: FrameRequestCallback[] = []
const pause = (ms: number) => new Promise(r => setTimeout(r, ms))
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

// ---------- harness ----------
function setup(opts: { readonly?: boolean; zoom?: number; x?: number; y?: number } = {}) {
  const doc = new Y.Doc()
  const store = new BoardStore(doc)
  const scene = new Scene(store)
  const history = new History(store)
  const viewport = new Viewport()
  viewport.zoom = opts.zoom ?? 1
  viewport.x = opts.x ?? 0
  viewport.y = opts.y ?? 0
  let ro = opts.readonly ?? false
  const invalidate = vi.fn()
  const c = new ToolController({
    store, scene, history, viewport,
    readonly: () => ro,
    invalidate,
  })
  const setReadonly = (v: boolean) => { ro = v }
  return { doc, store, scene, history, viewport, c, invalidate, setReadonly }
}

const ptr = (x: number, y: number, extra: Partial<PointerInput> = {}): PointerInput => ({
  screen: { x, y }, button: 0, shift: false, alt: false, mod: false, pressure: 0.5, ...extra,
})

function drag(c: ToolController, from: [number, number], to: [number, number], extra: Partial<PointerInput> = {}) {
  c.pointerDown(ptr(from[0], from[1], extra))
  c.pointerMove(ptr((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, extra))
  c.pointerMove(ptr(to[0], to[1], extra))
  c.pointerUp(ptr(to[0], to[1], extra))
}

function rect(store: BoardStore, x: number, y: number, w: number, h: number, patch: Partial<ShapeElement> = {}) {
  return store.create({
    type: 'rectangle', x, y, w, h, angle: 0, locked: false, ...DEFAULT_STYLE, label: '',
    fill: '#ffffff', fillStyle: 'solid', ...patch,
  })
}

const key = (k: string, mods: { mod?: boolean; shift?: boolean } = {}) => ({ key: k, mod: false, shift: false, ...mods })

describe('shape tools', () => {
  it('drag with rectangle tool creates a rectangle in scene coordinates', () => {
    const { c, store } = setup({ zoom: 2, x: 100, y: 50 })
    c.setTool('rectangle')
    expect(c.cursor.value).toBe('crosshair')
    c.pointerDown(ptr(20, 40))
    c.pointerMove(ptr(120, 100))
    const draft = c.overlay().draft
    expect(draft).toMatchObject({ id: 'draft', type: 'rectangle', x: 110, y: 70, w: 50, h: 30, version: 1, index: 'a0' })
    expect(store.all()).toHaveLength(0) // draft stays out of Y
    c.pointerUp(ptr(120, 100))
    const all = store.all()
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ type: 'rectangle', x: 110, y: 70, w: 50, h: 30, angle: 0, stroke: DEFAULT_STYLE.stroke })
    expect(all[0]!.seed).toBe(draft!.seed)
    expect(c.overlay().draft).toBeNull()
    expect([...c.selectedIds.value]).toEqual([all[0]!.id])
  })

  it('draft keeps one seed for the whole gesture', () => {
    const { c } = setup()
    c.setTool('ellipse')
    c.pointerDown(ptr(0, 0))
    c.pointerMove(ptr(10, 10))
    const s1 = c.overlay().draft!.seed
    c.pointerMove(ptr(40, 30))
    expect(c.overlay().draft!.seed).toBe(s1)
    expect(c.overlay().draft!.type).toBe('ellipse')
  })

  it('dragging up-left normalizes to non-negative size', () => {
    const { c, store } = setup()
    c.setTool('diamond')
    drag(c, [100, 100], [40, 70])
    expect(store.all()[0]).toMatchObject({ type: 'diamond', x: 40, y: 70, w: 60, h: 30 })
  })

  it('returns to select tool unless locked', () => {
    const { c } = setup()
    c.setTool('rectangle')
    drag(c, [0, 0], [50, 50])
    expect(c.tool.value).toBe('select')
    c.toolLocked.value = true
    c.setTool('rectangle')
    drag(c, [100, 100], [150, 150])
    expect(c.tool.value).toBe('rectangle')
  })

  it('click without drag creates nothing', () => {
    const { c, store } = setup({ zoom: 4 })
    c.setTool('rectangle')
    c.pointerDown(ptr(10, 10))
    c.pointerUp(ptr(10, 10))
    c.pointerDown(ptr(10, 10))
    c.pointerMove(ptr(14, 14)) // intermediate move; only the release point counts
    c.pointerUp(ptr(11, 11)) // 0.25 scene units < 2/4
    expect(store.all()).toHaveLength(0)
    expect(c.overlay().draft).toBeNull()
    expect(c.tool.value).toBe('rectangle')
  })

  it('shift drag creates a square', () => {
    const { c, store } = setup()
    c.setTool('rectangle')
    drag(c, [10, 10], [110, 50], { shift: true })
    expect(store.all()[0]).toMatchObject({ x: 10, y: 10, w: 100, h: 100 })
  })

  it('alt drag creates from center', () => {
    const { c, store } = setup()
    c.setTool('rectangle')
    drag(c, [100, 100], [130, 120], { alt: true })
    expect(store.all()[0]).toMatchObject({ x: 70, y: 80, w: 60, h: 40 })
  })
})

describe('select tool', () => {
  it('click selects topmost, shift-click toggles, marquee selects fully-contained', () => {
    const { c, store } = setup()
    const a = rect(store, 0, 0, 100, 100)
    const b = rect(store, 50, 50, 100, 100)
    const far = rect(store, 300, 300, 20, 20)
    c.pointerDown(ptr(75, 75)); c.pointerUp(ptr(75, 75))
    expect([...c.selectedIds.value]).toEqual([b.id])
    c.pointerDown(ptr(10, 10, { shift: true })); c.pointerUp(ptr(10, 10, { shift: true }))
    expect(new Set(c.selectedIds.value)).toEqual(new Set([a.id, b.id]))
    c.pointerDown(ptr(10, 10, { shift: true })); c.pointerUp(ptr(10, 10, { shift: true }))
    expect([...c.selectedIds.value]).toEqual([b.id])
    // empty click clears
    c.pointerDown(ptr(250, 10)); c.pointerUp(ptr(250, 10))
    expect(c.selectedIds.value.size).toBe(0)
    // marquee: contains `a` fully, `b` only partially
    c.pointerDown(ptr(-10, -10))
    c.pointerMove(ptr(120, 120))
    expect(c.overlay().marquee).toEqual({ minX: -10, minY: -10, maxX: 120, maxY: 120 })
    c.pointerUp(ptr(120, 120))
    expect([...c.selectedIds.value]).toEqual([a.id])
    expect(c.overlay().marquee).toBeNull()
    // shift marquee adds
    drag(c, [290, 290], [330, 330], { shift: true })
    expect(new Set(c.selectedIds.value)).toEqual(new Set([a.id, far.id]))
  })

  it('selectedIds holds a new Set on every change', () => {
    const { c, store } = setup()
    rect(store, 0, 0, 10, 10)
    const before = c.selectedIds.value
    c.selectAll()
    expect(c.selectedIds.value).not.toBe(before)
  })

  it('dragging selection moves all selected and is one undo step', () => {
    const { c, store, history } = setup()
    const a = rect(store, 0, 0, 50, 50)
    const b = rect(store, 100, 0, 50, 50)
    c.selectAll()
    const writes = vi.fn()
    store.doc.on('update', writes)
    c.pointerDown(ptr(25, 25))
    c.pointerMove(ptr(30, 30))
    c.pointerMove(ptr(35, 35))
    expect(writes).not.toHaveBeenCalled() // throttled until the frame
    flushFrames()
    expect(writes).toHaveBeenCalledTimes(1)
    expect(store.get(a.id)).toMatchObject({ x: 10, y: 10 })
    c.pointerMove(ptr(40, 45))
    flushFrames()
    c.pointerMove(ptr(45, 55))
    c.pointerUp(ptr(45, 55)) // final position flushed synchronously
    expect(store.get(a.id)).toMatchObject({ x: 20, y: 30 })
    expect(store.get(b.id)).toMatchObject({ x: 120, y: 30 })
    flushFrames() // stale frame must not re-apply
    expect(store.get(a.id)).toMatchObject({ x: 20, y: 30 })
    history.undo()
    expect(store.get(a.id)).toMatchObject({ x: 0, y: 0 })
    expect(store.get(b.id)).toMatchObject({ x: 100, y: 0 })
    expect(store.all()).toHaveLength(2)
  })

  // yjs reads time via lib0's `getUnixTime = Date.now`, bound at import, so fake timers cannot
  // move it: real waits past the 300 ms capture timeout are needed.
  it('a drag that pauses longer than the capture timeout is still one undo step', async () => {
    const { c, store, history } = setup({ zoom: 2 })
    const a = rect(store, 0, 0, 50, 50)
    c.selectAll()
    // move
    c.pointerDown(ptr(50, 50))
    c.pointerMove(ptr(60, 60)); flushFrames()
    await pause(350)
    c.pointerMove(ptr(80, 80)); flushFrames()
    c.pointerUp(ptr(100, 100))
    expect(store.get(a.id)).toMatchObject({ x: 25, y: 25 })
    // resize (se handle at scene (75,75) = screen (150,150))
    c.pointerDown(ptr(150, 150))
    c.pointerMove(ptr(160, 160)); flushFrames()
    await pause(350)
    c.pointerMove(ptr(170, 170)); flushFrames()
    c.pointerUp(ptr(200, 200))
    expect(store.get(a.id)).toMatchObject({ x: 25, y: 25, w: 75, h: 75 })
    history.undo()
    expect(store.get(a.id)).toMatchObject({ x: 25, y: 25, w: 50, h: 50 })
    history.undo()
    expect(store.get(a.id)).toMatchObject({ x: 0, y: 0, w: 50, h: 50 })
    expect(store.all()).toHaveLength(1)
  })

  it('clicking a selected element does not write', () => {
    const { c, store } = setup()
    const a = rect(store, 0, 0, 50, 50)
    c.selectAll()
    const writes = vi.fn()
    store.doc.on('update', writes)
    c.pointerDown(ptr(25, 25)); c.pointerUp(ptr(25, 25))
    flushFrames()
    expect(writes).not.toHaveBeenCalled()
    expect(store.get(a.id)!.version).toBe(1)
  })

  it('locked elements are selected but not moved', () => {
    const { c, store } = setup()
    const a = rect(store, 0, 0, 50, 50, { locked: true })
    drag(c, [25, 25], [75, 75])
    flushFrames()
    expect([...c.selectedIds.value]).toEqual([a.id])
    expect(store.get(a.id)).toMatchObject({ x: 0, y: 0 })
  })

  it('se handle resizes; rotate handle sets angle', () => {
    const { c, store } = setup({ zoom: 2 })
    const a = rect(store, 0, 0, 50, 50)
    c.pointerDown(ptr(50, 50)); c.pointerUp(ptr(50, 50))
    expect([...c.selectedIds.value]).toEqual([a.id])
    // se handle at scene (50,50) = screen (100,100)
    c.pointerMove(ptr(101, 101))
    expect(c.cursor.value).toBe('nwse-resize')
    drag(c, [101, 101], [200, 160])
    expect(store.get(a.id)).toMatchObject({ x: 0, y: 0, w: 100, h: 80 })
    // rotate handle
    const el = store.get(a.id)!
    const rot = handlePositions(el, 2).rotate
    c.pointerMove(ptr(rot.x * 2, rot.y * 2))
    expect(c.cursor.value).toBe('alias')
    // drag to the right of the center → 90°
    c.pointerDown(ptr(rot.x * 2, rot.y * 2))
    c.pointerMove(ptr(300, 80))
    c.pointerUp(ptr(300, 80))
    expect(store.get(a.id)!.angle).toBeCloseTo(Math.PI / 2)
    expect(store.get(a.id)).toMatchObject({ w: 100, h: 80 })
  })

  it('hover sets hoverId and move cursor over selected', () => {
    const { c, store, invalidate } = setup()
    const a = rect(store, 0, 0, 50, 50)
    c.pointerMove(ptr(25, 25))
    expect(c.overlay().hoverId).toBe(a.id)
    expect(invalidate).toHaveBeenCalled()
    c.selectAll()
    c.pointerMove(ptr(26, 26))
    expect(c.cursor.value).toBe('move')
    c.pointerMove(ptr(300, 300))
    expect(c.overlay().hoverId).toBeNull()
    expect(c.cursor.value).toBe('default')
  })

  it('removes deleted elements from the selection', () => {
    const { c, store } = setup()
    const a = rect(store, 0, 0, 50, 50)
    const b = rect(store, 100, 0, 50, 50)
    c.selectAll()
    store.remove([a.id])
    expect([...c.selectedIds.value]).toEqual([b.id])
    c.destroy()
    store.remove([b.id])
    expect([...c.selectedIds.value]).toEqual([b.id])
  })
})

describe('panning', () => {
  it('hand tool, middle button and Space pan the viewport', () => {
    const { c, viewport, invalidate, store } = setup({ zoom: 2 })
    c.setTool('hand')
    expect(c.cursor.value).toBe('grab')
    c.pointerDown(ptr(100, 100))
    expect(c.cursor.value).toBe('grabbing')
    c.pointerMove(ptr(120, 80))
    c.pointerUp(ptr(120, 80))
    expect(viewport.x).toBe(-10)
    expect(viewport.y).toBe(10)
    expect(invalidate).toHaveBeenCalled()

    c.setTool('rectangle')
    drag(c, [0, 0], [20, 0], { button: 1 })
    expect(viewport.x).toBe(-20)
    expect(store.all()).toHaveLength(0)

    expect(c.keyDown(key(' '))).toBe(true)
    expect(c.cursor.value).toBe('grab')
    drag(c, [0, 0], [0, 20])
    expect(viewport.y).toBe(0)
    expect(store.all()).toHaveLength(0)
    c.keyUp({ key: ' ' })
    expect(c.cursor.value).toBe('crosshair')
  })
})

describe('keyboard', () => {
  it('tool keys switch tools', () => {
    const { c } = setup()
    const cases: [string, string][] = [
      ['r', 'rectangle'], ['v', 'select'], ['2', 'rectangle'], ['1', 'select'], ['d', 'diamond'],
      ['3', 'diamond'], ['o', 'ellipse'], ['4', 'ellipse'], ['h', 'hand'],
    ]
    for (const [k, t] of cases) {
      expect(c.keyDown(key(k))).toBe(true)
      expect(c.tool.value).toBe(t)
    }
    expect(c.keyDown(key('q'))).toBe(true)
    expect(c.toolLocked.value).toBe(true)
    c.keyDown(key('q'))
    expect(c.toolLocked.value).toBe(false)
  })

  it('Delete removes selection; mod+z restores it', () => {
    const { c, store } = setup()
    const a = rect(store, 0, 0, 50, 50)
    rect(store, 100, 0, 50, 50)
    c.selectAll()
    expect(c.keyDown(key('Delete'))).toBe(true)
    expect(store.all()).toHaveLength(0)
    expect(c.selectedIds.value.size).toBe(0)
    expect(c.keyDown(key('z', { mod: true }))).toBe(true)
    expect(store.all()).toHaveLength(2)
    expect(c.keyDown(key('Z', { mod: true, shift: true }))).toBe(true)
    expect(store.all()).toHaveLength(0)
    c.keyDown(key('z', { mod: true }))
    expect(c.keyDown(key('y', { mod: true }))).toBe(true)
    expect(store.all()).toHaveLength(0)
    c.keyDown(key('z', { mod: true }))
    c.pointerDown(ptr(25, 25)); c.pointerUp(ptr(25, 25))
    expect(c.keyDown(key('Backspace'))).toBe(true)
    expect(store.get(a.id)).toBeUndefined()
  })

  it('mod+a selects all, Escape clears, arrows nudge', () => {
    const { c, store, history } = setup()
    const a = rect(store, 0, 0, 50, 50)
    expect(c.keyDown(key('a', { mod: true }))).toBe(true)
    expect([...c.selectedIds.value]).toEqual([a.id])
    expect(c.keyDown(key('ArrowRight'))).toBe(true)
    expect(c.keyDown(key('ArrowDown', { shift: true }))).toBe(true)
    expect(c.keyDown(key('ArrowLeft'))).toBe(true)
    expect(c.keyDown(key('ArrowUp'))).toBe(true)
    expect(store.get(a.id)).toMatchObject({ x: 0, y: 9 })
    history.undo()
    expect(store.get(a.id)).toMatchObject({ x: 0, y: 10 })
    expect(c.keyDown(key('Escape'))).toBe(true)
    expect(c.selectedIds.value.size).toBe(0)
  })

  it('keyDown returns false for unhandled keys', () => {
    const { c } = setup()
    expect(c.keyDown(key('x'))).toBe(false)
    expect(c.keyDown(key('b', { mod: true }))).toBe(false)
    expect(c.keyDown(key('Enter'))).toBe(false)
    // nothing selected → nothing to delete or nudge
    expect(c.keyDown(key('Delete'))).toBe(false)
    expect(c.keyDown(key('ArrowLeft'))).toBe(false)
  })
})

describe('read-only', () => {
  it('read-only controller ignores create, move and delete', () => {
    const { c, store, setReadonly, viewport } = setup()
    const a = rect(store, 0, 0, 50, 50)
    setReadonly(true)
    // create
    c.setTool('rectangle')
    drag(c, [100, 100], [200, 200])
    expect(store.all()).toHaveLength(1)
    expect(c.overlay().draft).toBeNull()
    // select + move
    c.setTool('select')
    drag(c, [25, 25], [75, 75])
    flushFrames()
    expect([...c.selectedIds.value]).toEqual([a.id])
    expect(store.get(a.id)).toMatchObject({ x: 0, y: 0 })
    // resize handle ignored (acts as select/marquee instead)
    drag(c, [50, 50], [120, 120])
    flushFrames()
    expect(store.get(a.id)).toMatchObject({ w: 50, h: 50 })
    // delete/nudge/undo ignored
    c.selectAll()
    expect(c.keyDown(key('Delete'))).toBe(false)
    expect(c.keyDown(key('ArrowLeft'))).toBe(false)
    expect(c.keyDown(key('z', { mod: true }))).toBe(false)
    c.deleteSelection()
    expect(store.all()).toHaveLength(1)
    // marquee and pan still work
    c.keyDown(key('Escape'))
    drag(c, [-10, -10], [60, 60])
    expect([...c.selectedIds.value]).toEqual([a.id])
    drag(c, [0, 0], [30, 0], { button: 1 })
    expect(viewport.x).toBe(-30)
  })
})
