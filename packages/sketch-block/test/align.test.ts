import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'

import { linearScenePoints } from '../src/elements/linear'
import { alignPatches, distributePatches } from '../src/geometry/align'
import { History } from '../src/model/history'
import { Scene } from '../src/model/scene'
import { BoardStore } from '../src/model/store'
import { DEFAULT_STYLE, type ElementInit, type LinearElement, type ShapeElement } from '../src/model/types'
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
  vi.unstubAllGlobals()
})

function setup() {
  const store = new BoardStore(new Y.Doc())
  const scene = new Scene(store)
  const history = new History(store)
  const viewport = new Viewport()
  viewport.zoom = 1
  viewport.x = 0
  viewport.y = 0
  const c = new ToolController({ store, scene, history, viewport, readonly: () => false, invalidate: vi.fn() })
  return { store, scene, history, c }
}

const rect = (store: BoardStore, x: number, y: number, w = 50, h = 50, over: Partial<ShapeElement> = {}) =>
  store.create({
    ...DEFAULT_STYLE, type: 'rectangle', label: '', x, y, w, h, angle: 0, locked: false, ...over,
  } as ElementInit) as ShapeElement

const get = (store: BoardStore, id: string) => store.get(id)!
const frame = (store: BoardStore, x: number, y: number, w: number, h: number) => store.createMany([{
  ...DEFAULT_STYLE, type: 'frame', name: 'F', x, y, w, h, angle: 0, locked: false,
} as ElementInit], { atBack: true })[0]!

describe('alignPatches / distributePatches', () => {
  it('align left', () => {
    const { store } = setup()
    const a = rect(store, 10, 0)
    const b = rect(store, 40, 100, 80, 20)
    const c = rect(store, 100, 200)
    const p = alignPatches(store.all(), 'left')
    expect(p[a.id]).toBeUndefined()
    expect(p[b.id]).toEqual({ x: 10, y: 100 })
    expect(p[c.id]).toEqual({ x: 10, y: 200 })
  })

  it('align right, top, bottom and hcenter', () => {
    const { store } = setup()
    const a = rect(store, 0, 0, 50, 50)
    const b = rect(store, 100, 100, 100, 20)
    // union box: x 0..200, y 0..120
    expect(alignPatches(store.all(), 'right')).toEqual({ [a.id]: { x: 150, y: 0 } })
    expect(alignPatches(store.all(), 'top')).toEqual({ [b.id]: { x: 100, y: 0 } })
    expect(alignPatches(store.all(), 'bottom')).toEqual({ [a.id]: { x: 0, y: 70 } })
    expect(alignPatches(store.all(), 'hcenter')).toEqual({ [a.id]: { x: 75, y: 0 }, [b.id]: { x: 50, y: 100 } })
  })

  it('align vcenter', () => {
    const { store } = setup()
    const a = rect(store, 0, 0, 50, 40)
    const b = rect(store, 100, 100, 50, 100)
    // union y 0..200 → center 100
    const p = alignPatches(store.all(), 'vcenter')
    expect(p[a.id]).toEqual({ x: 0, y: 80 })
    expect(p[b.id]).toEqual({ x: 100, y: 50 })
  })

  it('uses the rotated box (AABB of the corners)', () => {
    const { store } = setup()
    const a = rect(store, 0, 0, 100, 20, { angle: Math.PI / 2 })
    const b = rect(store, 200, 0)
    // a's AABB: x 40..60
    const p = alignPatches(store.all(), 'left')
    expect(p[b.id]!.x).toBeCloseTo(40)
  })

  it('distribute h equal gaps', () => {
    const { store } = setup()
    const a = rect(store, 0, 0, 50, 50)
    const b = rect(store, 60, 30, 100, 50)
    const c = rect(store, 300, 10, 20, 50)
    // span 0..320, sizes 170 → gap 75
    const p = distributePatches(store.all(), 'h')
    expect(p[a.id]).toBeUndefined()
    expect(p[c.id]).toBeUndefined()
    expect(p[b.id]).toEqual({ x: 125, y: 30 })
  })

  it('distribute v sorts by center and keeps the outer two', () => {
    const { store } = setup()
    const top = rect(store, 0, 0, 50, 10)
    const mid2 = rect(store, 0, 150, 50, 10)
    const mid1 = rect(store, 0, 20, 50, 10)
    const bottom = rect(store, 0, 290, 50, 10)
    // span 0..300, sizes 40 → gap 260/3
    const p = distributePatches(store.all(), 'v')
    expect(p[top.id]).toBeUndefined()
    expect(p[bottom.id]).toBeUndefined()
    expect(p[mid1.id]!.y).toBeCloseTo(10 + 260 / 3)
    expect(p[mid2.id]!.y).toBeCloseTo(20 + 520 / 3)
  })

  it('distribute needs 3 units', () => {
    const { store } = setup()
    rect(store, 0, 0)
    rect(store, 100, 0)
    expect(distributePatches(store.all(), 'h')).toEqual({})
  })

  it('group treated as unit', () => {
    const { store } = setup()
    const g1 = rect(store, 0, 0, 50, 50, { groupIds: ['inner', 'g'] })
    const g2 = rect(store, 100, 50, 50, 50, { groupIds: ['g'] })
    const lone = rect(store, 300, 400)
    // the group's box: 0..150 × 0..100; it moves as one (relative layout kept)
    const p = alignPatches(store.all(), 'bottom')
    expect(p[g1.id]).toEqual({ x: 0, y: 350 })
    expect(p[g2.id]).toEqual({ x: 100, y: 400 })
    expect(p[lone.id]).toBeUndefined()
    // three units for distribute: group, lone, another
    const other = rect(store, 1000, 0)
    const d = distributePatches(store.all(), 'h')
    // span 0..1050, sizes 150 + 50 + 50 → gap 400
    expect(d[lone.id]).toEqual({ x: 550, y: 400 })
    expect(d[g1.id]).toBeUndefined()
    expect(d[other.id]).toBeUndefined()
  })
})

describe('controller align / distribute', () => {
  it('bound arrows follow', () => {
    const { store, c } = setup()
    const src = rect(store, 0, 0, 100, 60)
    c.setSelection([src.id])
    c.keyDown({ key: 'ArrowRight', mod: true, shift: false, alt: false })
    const copyId = [...c.selectedIds.value][0]!
    store.update(copyId, { y: 100 })
    c.setSelection([src.id, copyId])
    c.align('top')
    expect(get(store, copyId)).toMatchObject({ x: 180, y: 0 })
    const arrow = store.all().find((e): e is LinearElement => e.type === 'arrow')!
    const pts = linearScenePoints(arrow)
    expect(pts[pts.length - 1]!.x).toBeCloseTo(176)
    expect(pts[pts.length - 1]!.y).toBeCloseTo(30)
  })

  it('one undo step', () => {
    const { store, history, c } = setup()
    const a = rect(store, 0, 0)
    const b = rect(store, 100, 50)
    const d = rect(store, 400, 100)
    history.stopCapturing()
    c.setSelection([a.id, b.id, d.id])
    c.align('top')
    c.distribute('h')
    expect(get(store, b.id)).toMatchObject({ x: 200, y: 0 })
    history.undo()
    expect(get(store, b.id)).toMatchObject({ x: 100, y: 0 })
    history.undo()
    expect(get(store, b.id)).toMatchObject({ x: 100, y: 50 })
    expect(get(store, d.id)).toMatchObject({ x: 400, y: 100 })
  })

  it('skips locked elements', () => {
    const { store, c } = setup()
    const a = rect(store, 0, 0)
    const b = rect(store, 100, 50)
    const l = rect(store, 200, 300, 50, 50, { locked: true })
    c.setSelection([a.id, b.id, l.id])
    c.align('bottom')
    expect(get(store, l.id)).toMatchObject({ x: 200, y: 300 })
    // the reference is the unlocked elements only
    expect(get(store, a.id).y).toBe(50)
  })

  it('a frame takes its children along and membership is recomputed', () => {
    const { store, c } = setup()
    const f = frame(store, 0, 0, 200, 200)
    const child = rect(store, 20, 20)
    c.created([child.id])
    expect(get(store, child.id).frameId).toBe(f.id)
    const out = rect(store, 500, 0)
    const target = frame(store, 0, 300, 600, 300)
    c.setSelection([f.id, out.id])
    c.align('right')
    expect(get(store, f.id).x).toBe(350)
    expect(get(store, child.id).x).toBe(370)
    c.setSelection([out.id, target.id])
    c.align('bottom')
    // out moved into frame G
    expect(get(store, out.id).y).toBe(550)
    expect(get(store, out.id).frameId).toBe(target.id)
  })
})
