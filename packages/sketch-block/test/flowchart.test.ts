import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'

import { linearScenePoints } from '../src/elements/linear'
import { History } from '../src/model/history'
import { Scene } from '../src/model/scene'
import { BoardStore } from '../src/model/store'
import {
  DEFAULT_STYLE, type ElementInit, type LinearElement, type ShapeElement, type SketchElement, type StickyElement,
  stickyInit,
} from '../src/model/types'
import { setMeasurer } from '../src/text/measure'
import { ToolController } from '../src/tools/controller'
import { Viewport } from '../src/viewport'

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 0)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  setMeasurer((text, font) => text.length * (Number.parseFloat(font) || 16) * 0.5)
})
afterEach(() => {
  setMeasurer(null)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function setup(readonly = false) {
  const store = new BoardStore(new Y.Doc())
  const scene = new Scene(store)
  const history = new History(store)
  const viewport = new Viewport()
  viewport.zoom = 1
  viewport.x = 0
  viewport.y = 0
  const c = new ToolController({ store, scene, history, viewport, readonly: () => readonly, invalidate: vi.fn() })
  return { store, scene, history, c }
}

const rect = (store: BoardStore, x: number, y: number, w = 100, h = 60, over: Partial<ShapeElement> = {}) =>
  store.create({
    ...DEFAULT_STYLE, type: 'rectangle', label: '', x, y, w, h, angle: 0, locked: false, ...over,
  } as ElementInit) as ShapeElement

const modKey = (key: string, extra: { shift?: boolean; alt?: boolean } = {}) =>
  ({ key, mod: true, shift: false, alt: false, ...extra })

const arrows = (store: BoardStore) => store.all().filter((e): e is LinearElement => e.type === 'arrow')
const others = (store: BoardStore, ...ids: string[]) =>
  store.all().filter(e => e.type !== 'arrow' && !ids.includes(e.id))

describe('quick flowchart creation', () => {
  it('mod+ArrowRight creates bound copy to the right', () => {
    const { store, c } = setup()
    const src = rect(store, 0, 0, 100, 60, { label: 'Start', fill: '#ffc9c9', fillStyle: 'solid', stroke: '#e03131', strokeWidth: 4 })
    c.currentStyle.value = { ...c.currentStyle.value, routing: 'elbow', startArrowhead: 'dot', endArrowhead: 'triangle', stroke: '#1971c2' }
    c.setSelection([src.id])
    expect(c.keyDown(modKey('ArrowRight'))).toBe(true)
    const [copy] = others(store, src.id) as ShapeElement[]
    expect(copy).toMatchObject({
      type: 'rectangle', x: 180, y: 0, w: 100, h: 60, label: '', fill: '#ffc9c9', fillStyle: 'solid', stroke: '#e03131',
      strokeWidth: 4, locked: false,
    })
    const [a] = arrows(store)
    expect(a).toBeDefined()
    expect(a!.startBinding).toEqual({ id: src.id, ax: 1, ay: 0.5 })
    expect(a!.endBinding).toEqual({ id: copy!.id, ax: 0, ay: 0.5 })
    const pts = linearScenePoints(a!)
    // tips sit BIND_GAP (4) outside the facing edges
    expect(pts[0]!.x).toBeCloseTo(104)
    expect(pts[0]!.y).toBeCloseTo(30)
    expect(pts[pts.length - 1]!.x).toBeCloseTo(176)
    expect(pts[pts.length - 1]!.y).toBeCloseTo(30)
    // the current style's routing and arrowheads
    expect(a).toMatchObject({ routing: 'elbow', startArrowhead: 'dot', endArrowhead: 'triangle', stroke: '#1971c2', label: '' })
    expect(c.selectedIds.value).toEqual(new Set([copy!.id]))
  })

  it('each direction offsets by size + 80', () => {
    const cases = [
      ['ArrowLeft', -180, 0], ['ArrowUp', 0, -140], ['ArrowDown', 0, 140],
    ] as const
    for (const [k, x, y] of cases) {
      const { store, c } = setup()
      const src = rect(store, 0, 0)
      c.setSelection([src.id])
      expect(c.keyDown(modKey(k)), k).toBe(true)
      expect(others(store, src.id)[0], k).toMatchObject({ x, y })
    }
  })

  it('occupied slot shifts perpendicular', () => {
    const { store, c } = setup()
    const src = rect(store, 0, 0)
    // the slot to the right and the first shifted slot are taken
    rect(store, 200, 10, 50, 40)
    rect(store, 180, 100, 100, 60)
    c.setSelection([src.id])
    c.keyDown(modKey('ArrowRight'))
    const copy = store.get([...c.selectedIds.value][0]!)!
    // shifted by h + 40 = 100 per try
    expect(copy).toMatchObject({ x: 180, y: 200 })
    const [a] = arrows(store)
    expect(a!.endBinding!.id).toBe(copy.id)
    const end = linearScenePoints(a!).at(-1)!
    expect(end.x).toBeCloseTo(176)
    expect(end.y).toBeCloseTo(230)

    // vertical: shifts along x by w + 40
    const v = setup()
    const s2 = rect(v.store, 0, 0)
    rect(v.store, 0, 140)
    v.c.setSelection([s2.id])
    v.c.keyDown(modKey('ArrowDown'))
    expect(v.store.get([...v.c.selectedIds.value][0]!)).toMatchObject({ x: 140, y: 140 })
  })

  it('gives up after 10 shifts', () => {
    const { store, c } = setup()
    const src = rect(store, 0, 0)
    // a wall to the right
    rect(store, 180, -10, 100, 2000)
    c.setSelection([src.id])
    c.keyDown(modKey('ArrowRight'))
    expect(store.get([...c.selectedIds.value][0]!)).toMatchObject({ x: 180, y: 1000 })
  })

  it('ignored with 0 or 2 selected', () => {
    const { store, c } = setup()
    const a = rect(store, 0, 0)
    const b = rect(store, 0, 500)
    expect(c.keyDown(modKey('ArrowRight'))).toBe(false)
    c.setSelection([a.id, b.id])
    expect(c.keyDown(modKey('ArrowRight'))).toBe(false)
    expect(store.all()).toHaveLength(2)
    // and the selection was not nudged either
    expect(store.get(a.id)).toMatchObject({ x: 0, y: 0 })
  })

  it('ignored for locked, non-shape, read-only or with other modifiers', () => {
    const { store, c } = setup()
    const locked = rect(store, 0, 0, 100, 60, { locked: true })
    c.setSelection([locked.id])
    expect(c.quickCreate('right')).toBe(false)
    const t = store.create({
      ...DEFAULT_STYLE, type: 'text', text: 'x', autoSize: true, x: 0, y: 500, w: 10, h: 20, angle: 0, locked: false,
    } as ElementInit)
    c.setSelection([t.id])
    expect(c.quickCreate('right')).toBe(false)
    const r = rect(store, 0, 1000)
    c.setSelection([r.id])
    expect(c.keyDown(modKey('ArrowRight', { alt: true }))).toBe(false)
    expect(store.all()).toHaveLength(3)

    const ro = setup(true)
    const r2 = rect(ro.store, 0, 0)
    ro.c.setSelection([r2.id])
    expect(ro.c.keyDown(modKey('ArrowRight'))).toBe(false)
    expect(ro.store.all()).toHaveLength(1)
  })

  it('plain arrows still nudge', () => {
    const { store, c } = setup()
    const r = rect(store, 0, 0)
    c.setSelection([r.id])
    expect(c.keyDown({ key: 'ArrowRight', mod: false, shift: false })).toBe(true)
    expect(store.get(r.id)).toMatchObject({ x: 1, y: 0 })
    expect(store.all()).toHaveLength(1)
  })

  it('one undo step', () => {
    const { store, c, history } = setup()
    const src = rect(store, 0, 0)
    history.stopCapturing()
    c.setSelection([src.id])
    c.keyDown(modKey('ArrowRight'))
    expect(store.all()).toHaveLength(3)
    history.undo()
    expect(store.all().map(e => e.id)).toEqual([src.id])
    history.redo()
    expect(store.all()).toHaveLength(3)
    history.undo()
    // nothing else was undoable from the gesture: the source stays
    expect(store.get(src.id)).toBeDefined()
  })

  it('a sticky copies color and size with empty text', () => {
    const { store, c } = setup()
    const s = store.create(stickyInit(0, 0, { color: '#d3f9d8', w: 150, h: 120, text: 'idea' })) as StickyElement
    c.setSelection([s.id])
    expect(c.keyDown(modKey('ArrowDown'))).toBe(true)
    const copy = store.get([...c.selectedIds.value][0]!) as StickyElement
    expect(copy).toMatchObject({ type: 'sticky', x: 0, y: 200, w: 150, h: 120, color: '#d3f9d8', text: '' })
    expect(arrows(store)[0]).toMatchObject({ startBinding: { id: s.id }, endBinding: { id: copy.id } })
  })

  it('the copy and the arrow join the frame they land in', () => {
    const { store, c } = setup()
    const frame = store.create({
      ...DEFAULT_STYLE, type: 'frame', name: 'F', x: -50, y: -50, w: 600, h: 400, angle: 0, locked: false,
    } as ElementInit, ) as SketchElement
    const src = rect(store, 0, 0)
    c.created([src.id])
    c.setSelection([src.id])
    c.keyDown(modKey('ArrowRight'))
    const copy = store.get([...c.selectedIds.value][0]!)!
    expect(copy.frameId).toBe(frame.id)
    expect(arrows(store)[0]!.frameId).toBe(frame.id)
  })
})
