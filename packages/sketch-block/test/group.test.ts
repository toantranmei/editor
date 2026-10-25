import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'

import { History } from '../src/model/history'
import { Scene } from '../src/model/scene'
import { BoardStore } from '../src/model/store'
import { DEFAULT_STYLE, type ElementInit, type ShapeElement } from '../src/model/types'
import { type PointerInput, ToolController } from '../src/tools/controller'
import { Viewport } from '../src/viewport'

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 0)
  vi.stubGlobal('cancelAnimationFrame', () => {})
})
afterEach(() => vi.unstubAllGlobals())

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

const rect = (store: BoardStore, x: number, y: number, over: Partial<ShapeElement> = {}) =>
  store.create({
    ...DEFAULT_STYLE, type: 'rectangle', label: '', x, y, w: 50, h: 50, angle: 0, locked: false,
    fill: '#ffffff', fillStyle: 'solid', ...over,
  } as ElementInit) as ShapeElement

const ptr = (x: number, y: number, extra: Partial<PointerInput> = {}): PointerInput => ({
  screen: { x, y }, button: 0, shift: false, alt: false, mod: false, pressure: 0.5, ...extra,
})
const click = (c: ToolController, x: number, y: number, extra: Partial<PointerInput> = {}) => {
  c.pointerDown(ptr(x, y, extra))
  c.pointerUp(ptr(x, y, extra))
}
const modKey = (key: string, shift = false) => ({ key, mod: true, shift, alt: false })
const get = (store: BoardStore, id: string) => store.get(id)!
const sel = (c: ToolController) => [...c.selectedIds.value].sort()

describe('group, ungroup and lock', () => {
  it('group then click member selects group', () => {
    const { store, c } = setup()
    const a = rect(store, 0, 0)
    const b = rect(store, 100, 0)
    const other = rect(store, 300, 0)
    c.setSelection([a.id, b.id])
    expect(c.keyDown(modKey('g'))).toBe(true)
    const g = get(store, a.id).groupIds
    expect(g).toHaveLength(1)
    expect(get(store, b.id).groupIds).toEqual(g)
    expect(get(store, other.id).groupIds).toEqual([])
    c.setSelection([])
    click(c, 125, 25)
    expect(sel(c)).toEqual([a.id, b.id].sort())
    // a press on a member of the selected group moves the whole group (exact offsets: no object snap)
    c.objectSnap.value = false
    c.pointerDown(ptr(25, 25))
    c.pointerMove(ptr(35, 45))
    c.pointerUp(ptr(35, 45))
    expect(get(store, a.id)).toMatchObject({ x: 10, y: 20 })
    expect(get(store, b.id)).toMatchObject({ x: 110, y: 20 })
    expect(get(store, other.id)).toMatchObject({ x: 300, y: 0 })
  })

  it('shift-click toggles the whole group', () => {
    const { store, c } = setup()
    const a = rect(store, 0, 0, { groupIds: ['g'] })
    const b = rect(store, 100, 0, { groupIds: ['g'] })
    const other = rect(store, 300, 0)
    click(c, 325, 25)
    click(c, 25, 25, { shift: true })
    expect(sel(c)).toEqual([a.id, b.id, other.id].sort())
    click(c, 125, 25, { shift: true })
    expect(sel(c)).toEqual([other.id])
  })

  it('marquee and lasso expand to whole groups', () => {
    const { store, c } = setup()
    const a = rect(store, 0, 0, { groupIds: ['g'] })
    const b = rect(store, 200, 0, { groupIds: ['g'] })
    // marquee around a only
    c.pointerDown(ptr(-10, -10))
    c.pointerMove(ptr(80, 80))
    c.pointerUp(ptr(80, 80))
    expect(sel(c)).toEqual([a.id, b.id].sort())
    c.setSelection([])
    c.setTool('lasso')
    c.pointerDown(ptr(-10, -10))
    for (const [x, y] of [[80, -10], [80, 80], [-10, 80]] as const) c.pointerMove(ptr(x, y))
    c.pointerUp(ptr(-10, 80))
    expect(sel(c)).toEqual([a.id, b.id].sort())
  })

  it('nested ungroup peels one level', () => {
    const { store, c } = setup()
    const a = rect(store, 0, 0)
    const b = rect(store, 100, 0)
    const d = rect(store, 200, 0)
    c.setSelection([a.id, b.id])
    c.keyDown(modKey('g'))
    const inner = get(store, a.id).groupIds[0]!
    c.setSelection([a.id, d.id])
    // the selection expanded to a's group when clicked; here set it explicitly
    c.setSelection([a.id, b.id, d.id])
    c.keyDown(modKey('g'))
    const outer = get(store, d.id).groupIds[0]!
    expect(get(store, a.id).groupIds).toEqual([inner, outer])
    expect(get(store, b.id).groupIds).toEqual([inner, outer])
    expect(get(store, d.id).groupIds).toEqual([outer])
    // clicking a member selects the outermost group
    c.setSelection([])
    click(c, 225, 25)
    expect(sel(c)).toEqual([a.id, b.id, d.id].sort())
    expect(c.keyDown(modKey('g', true))).toBe(true)
    expect(get(store, a.id).groupIds).toEqual([inner])
    expect(get(store, b.id).groupIds).toEqual([inner])
    expect(get(store, d.id).groupIds).toEqual([])
    c.setSelection([])
    click(c, 25, 25)
    expect(sel(c)).toEqual([a.id, b.id].sort())
  })

  it('group needs at least 2 unlocked elements and skips locked ones', () => {
    const { store, c } = setup()
    const a = rect(store, 0, 0)
    const l = rect(store, 100, 0, { locked: true })
    c.setSelection([a.id, l.id])
    c.group()
    expect(get(store, a.id).groupIds).toEqual([])
    expect(get(store, l.id).groupIds).toEqual([])
    const b = rect(store, 200, 0)
    c.setSelection([a.id, b.id, l.id])
    c.group()
    expect(get(store, a.id).groupIds).toHaveLength(1)
    expect(get(store, l.id).groupIds).toEqual([])
  })

  it('paste gets new group ids', () => {
    const { store, c } = setup()
    const a = rect(store, 0, 0, { groupIds: ['g1', 'g2'] })
    const b = rect(store, 100, 0, { groupIds: ['g2'] })
    c.pasteElements([get(store, a.id), get(store, b.id)], null)
    const copies = store.all().filter(el => el.id !== a.id && el.id !== b.id)
    expect(copies).toHaveLength(2)
    const [ca, cb] = copies
    expect(ca!.groupIds).toHaveLength(2)
    expect(ca!.groupIds).not.toContain('g1')
    expect(ca!.groupIds).not.toContain('g2')
    expect(cb!.groupIds).toEqual([ca!.groupIds[1]])
  })

  it('toggleLock', () => {
    const { store, history, c } = setup()
    const a = rect(store, 0, 0)
    const b = rect(store, 100, 0, { locked: true })
    history.stopCapturing()
    c.setSelection([a.id, b.id])
    // mixed: all become locked
    expect(c.keyDown(modKey('l', true))).toBe(true)
    expect(get(store, a.id).locked).toBe(true)
    expect(get(store, b.id).locked).toBe(true)
    // locked elements stay selectable
    c.setSelection([])
    click(c, 25, 25)
    expect(sel(c)).toEqual([a.id])
    c.setSelection([a.id, b.id])
    // all locked: all unlocked
    c.toggleLock()
    expect(get(store, a.id).locked).toBe(false)
    expect(get(store, b.id).locked).toBe(false)
    // each toggle is one undo step
    history.undo()
    expect(get(store, a.id).locked).toBe(true)
    expect(get(store, b.id).locked).toBe(true)
  })

  it('locked group members do not move with the group', () => {
    const { store, c } = setup()
    const a = rect(store, 0, 0, { groupIds: ['g'] })
    const b = rect(store, 100, 0, { groupIds: ['g'], locked: true })
    c.pointerDown(ptr(25, 25))
    c.pointerMove(ptr(35, 25))
    c.pointerUp(ptr(35, 25))
    expect(get(store, a.id).x).toBe(10)
    expect(get(store, b.id).x).toBe(100)
  })

  it('group is one undo step', () => {
    const { store, history, c } = setup()
    const a = rect(store, 0, 0)
    const b = rect(store, 100, 0)
    const d = rect(store, 200, 0)
    history.stopCapturing()
    c.setSelection([a.id, b.id, d.id])
    c.group()
    expect(get(store, d.id).groupIds).toHaveLength(1)
    history.undo()
    for (const id of [a.id, b.id, d.id]) expect(get(store, id).groupIds).toEqual([])
    history.redo()
    c.ungroup()
    history.undo()
    expect(get(store, a.id).groupIds).toHaveLength(1)
  })

  it('read-only: group, ungroup and lock do nothing', () => {
    const { store, c } = setup(true)
    const a = rect(store, 0, 0)
    const b = rect(store, 100, 0)
    c.setSelection([a.id, b.id])
    expect(c.keyDown(modKey('g'))).toBe(false)
    expect(c.keyDown(modKey('l', true))).toBe(false)
    expect(get(store, a.id)).toMatchObject({ groupIds: [], locked: false })
  })
})
