import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'

import { arrowheadsOf, curvePoints, linearKind, linearScenePoints } from '../src/elements/linear'
import {
  anchorScenePoint, BIND_GAP, findBindTarget, followBindings, outlineAnchor,
} from '../src/geometry/binding'
import { CLIPBOARD_TYPE, parseClipboard, serializeClipboard } from '../src/io/clipboard'
import { History } from '../src/model/history'
import { Scene } from '../src/model/scene'
import { BoardStore } from '../src/model/store'
import {
  type Binding, DEFAULT_STYLE, type ElementInit, isRenderable, type LinearElement, type LocalPoint, normalizeElement,
  type SketchElement,
} from '../src/model/types'
import { renderInteractive } from '../src/render/interactive'
import type { RenderState } from '../src/render/static'
import { type PointerInput, ToolController } from '../src/tools/controller'
import { Viewport } from '../src/viewport'
import { type FakeCtx, makeFakeCtx } from './helpers/canvas'

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

function setup(opts: { doc?: Y.Doc; zoom?: number } = {}) {
  const doc = opts.doc ?? new Y.Doc()
  const store = new BoardStore(doc)
  const scene = new Scene(store)
  const history = new History(store)
  const viewport = new Viewport()
  viewport.zoom = opts.zoom ?? 1
  viewport.x = 0
  viewport.y = 0
  const c = new ToolController({ store, scene, history, viewport, readonly: () => false, invalidate: vi.fn() })
  return { doc, store, scene, history, viewport, c }
}

const ptr = (x: number, y: number, extra: Partial<PointerInput> = {}): PointerInput => ({
  screen: { x, y }, button: 0, shift: false, alt: false, mod: false, pressure: 0.5, ...extra,
})
const key = (k: string, extra: { shift?: boolean } = {}) => ({ key: k, mod: false, shift: false, ...extra })

const rect = (store: BoardStore, x: number, y: number, w = 100, h = 100, over: Partial<SketchElement> = {}) =>
  store.create({
    ...DEFAULT_STYLE, type: 'rectangle', label: '', x, y, w, h, angle: 0, locked: false, ...over,
  } as ElementInit)

function drag(c: ToolController, from: [number, number], to: [number, number], extra: Partial<PointerInput> = {}) {
  c.pointerDown(ptr(...from, extra))
  c.pointerMove(ptr((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, extra))
  c.pointerMove(ptr(...to, extra))
  flushFrames()
  c.pointerUp(ptr(...to, extra))
}

const arrows = (store: BoardStore) => store.all().filter((e): e is LinearElement => e.type === 'arrow')
const ends = (el: LinearElement) => {
  const pts = linearScenePoints(el)
  return [pts[0]!, pts[pts.length - 1]!]
}
const near = (p: { x: number; y: number }, x: number, y: number, eps = 1e-6) => {
  expect(p.x).toBeCloseTo(x, 5)
  expect(p.y).toBeCloseTo(y, 5)
  expect(Math.hypot(p.x - x, p.y - y)).toBeLessThan(eps + 1e-5)
}

/** Two 100×100 rects (A at 0,0; B at 300,0) and an arrow drawn between them with the arrow tool. */
function boundPair(opts: { zoom?: number } = {}) {
  const s = setup(opts)
  const a = rect(s.store, 0, 0)
  const b = rect(s.store, 300, 0)
  s.c.setTool('arrow')
  drag(s.c, [110, 50], [290, 50])
  const arrow = arrows(s.store)[0]!
  return { ...s, a, b, arrow }
}

describe('arrow binding (Task 6)', () => {
  it('arrow created between two rects binds both ends', () => {
    const { store, a, b, arrow, history } = boundPair()
    expect(arrow.startBinding).toEqual({ id: a.id, ax: 1, ay: 0.5 })
    expect(arrow.endBinding).toEqual({ id: b.id, ax: 0, ay: 0.5 })
    const [s, e] = ends(arrow)
    // tips sit BIND_GAP outside the outlines
    near(s!, 100 + BIND_GAP, 50)
    near(e!, 300 - BIND_GAP, 50)
    // one undo step removes it
    history.undo()
    expect(arrows(store)).toHaveLength(0)
  })

  it('binds only within 12/zoom of the outline, and only arrows', () => {
    const z = boundPair({ zoom: 2 })
    // 10 scene units away at zoom 2 is 20 screen px: beyond 12/zoom = 6
    expect(z.arrow.startBinding).toBeNull()
    expect(z.arrow.endBinding).toBeNull()
    const s = setup()
    rect(s.store, 0, 0)
    s.c.setTool('line')
    drag(s.c, [105, 50], [200, 50])
    const ln = s.store.all().find((e): e is LinearElement => e.type === 'line')!
    expect(ln.startBinding).toBeNull()
  })

  it('highlights the bind target while drawing near it', () => {
    const { c, store } = setup()
    const a = rect(store, 0, 0)
    c.setTool('arrow')
    c.pointerDown(ptr(200, 200))
    c.pointerMove(ptr(150, 150))
    expect(c.overlay().bindTarget).toBeNull()
    c.pointerMove(ptr(108, 60))
    expect(c.overlay().bindTarget).toBe(a.id)
    c.pointerUp(ptr(108, 60))
    expect(c.overlay().bindTarget).toBeNull()
  })

  it('self-binding needs different anchors', () => {
    const { c, store } = setup()
    const a = rect(store, 0, 0)
    c.setTool('arrow')
    // both ends project onto the same outline point (100, 50)
    drag(c, [105, 50], [111, 50])
    const same = arrows(store)[0]!
    expect(same.startBinding?.id).toBe(a.id)
    expect(same.endBinding).toBeNull()
    c.setTool('arrow')
    drag(c, [106, 20], [106, 80])
    const loop = arrows(store)[1]!
    expect(loop.startBinding).toMatchObject({ id: a.id, ax: 1, ay: 0.2 })
    expect(loop.endBinding).toMatchObject({ id: a.id, ax: 1, ay: 0.8 })
  })

  it('moving bound rect updates arrow in same undo step', () => {
    const { c, store, a, arrow, history } = boundPair()
    c.setTool('select')
    drag(c, [0, 50], [0, 150])
    expect(store.get(a.id)!.y).toBe(100)
    const moved = store.get(arrow.id) as LinearElement
    const [s, e] = ends(moved)
    near(s!, 104, 150)
    near(e!, 296, 50)
    expect(moved.startBinding).toEqual(arrow.startBinding)
    history.undo()
    expect(store.get(a.id)!.y).toBe(0)
    const back = ends(store.get(arrow.id) as LinearElement)
    near(back[0]!, 104, 50)
    near(back[1]!, 296, 50)
    // and the create is the step before
    history.undo()
    expect(arrows(store)).toHaveLength(0)
  })

  it('Escape mid-move reverts the bound arrow too', () => {
    const { c, store, arrow } = boundPair()
    c.setTool('select')
    c.pointerDown(ptr(0, 50))
    c.pointerMove(ptr(0, 150))
    flushFrames()
    expect(ends(store.get(arrow.id) as LinearElement)[0]!.y).toBeCloseTo(150)
    expect(c.keyDown(key('Escape'))).toBe(true)
    const back = store.get(arrow.id) as LinearElement
    expect(back).toMatchObject({ x: arrow.x, y: arrow.y, w: arrow.w, h: arrow.h, points: arrow.points })
  })

  it('moving the arrow alone unbinds the ends whose target stays put', () => {
    const { c, store, arrow } = boundPair()
    c.setTool('select')
    // exact offsets: no object snap
    c.objectSnap.value = false
    drag(c, [200, 50], [200, 80])
    const moved = store.get(arrow.id) as LinearElement
    expect(moved.startBinding).toBeNull()
    expect(moved.endBinding).toBeNull()
    near(ends(moved)[0]!, 104, 80)
  })

  it('moving arrow and both targets together keeps the bindings', () => {
    const { c, store, arrow } = boundPair()
    c.setTool('select')
    c.selectAll()
    drag(c, [200, 50], [200, 80])
    const moved = store.get(arrow.id) as LinearElement
    expect(moved.startBinding).toEqual(arrow.startBinding)
    near(ends(moved)[0]!, 104, 80)
    near(ends(moved)[1]!, 296, 80)
  })

  it('resize and nudge make the arrow follow (one undo step each)', () => {
    const { c, store, a, arrow, history } = boundPair()
    c.setTool('select')
    c.setSelection([a.id])
    // the e handle at (100, 50) → widen A to 150
    drag(c, [100, 50], [150, 50])
    expect(store.get(a.id)!.w).toBe(150)
    near(ends(store.get(arrow.id) as LinearElement)[0]!, 154, 50)
    history.undo()
    near(ends(store.get(arrow.id) as LinearElement)[0]!, 104, 50)
    c.keyDown(key('ArrowDown', { shift: true }))
    near(ends(store.get(arrow.id) as LinearElement)[0]!, 104, 60)
    history.undo()
    expect(store.get(a.id)!.y).toBe(0)
    near(ends(store.get(arrow.id) as LinearElement)[0]!, 104, 50)
  })

  it('rotated target anchor stays on outline', () => {
    const { c, store, a, arrow } = boundPair()
    c.setTool('select')
    c.setSelection([a.id])
    // rotate handle 24 px above the top center; drag it to the right of the center → 90°
    drag(c, [50, -24], [150, 50])
    const rotated = store.get(a.id)!
    expect(rotated.angle).toBeCloseTo(Math.PI / 2)
    const moved = store.get(arrow.id) as LinearElement
    expect(moved.startBinding).toEqual(arrow.startBinding)
    const tip = ends(moved)[0]!
    // the (1, 0.5) anchor of a 90°-rotated square is its bottom-center: (50, 100), pushed 4 down
    near(tip, 50, 100 + BIND_GAP)
    const anchor = outlineAnchor(rotated, tip)
    expect(anchor.distance).toBeCloseTo(BIND_GAP)
    expect(anchor.ax).toBeCloseTo(1)
    expect(anchor.ay).toBeCloseTo(0.5)
    // the geometry helper agrees
    near(anchorScenePoint(rotated, arrow.startBinding!, BIND_GAP, ends(moved)[1]!), 50, 104)
  })

  it('dragging endpoint away unbinds, onto another rect rebinds', () => {
    const { c, store, b, arrow, history } = boundPair()
    const cRect = rect(store, 300, 300)
    c.setTool('select')
    c.setSelection([arrow.id])
    c.pointerDown(ptr(296, 50))
    c.pointerMove(ptr(250, 150))
    c.pointerMove(ptr(200, 200))
    flushFrames()
    expect(c.overlay().bindTarget).toBeNull()
    c.pointerUp(ptr(200, 200))
    let el = store.get(arrow.id) as LinearElement
    expect(el.endBinding).toBeNull()
    expect(el.startBinding).toEqual(arrow.startBinding)
    near(ends(el)[1]!, 200, 200)
    c.pointerDown(ptr(200, 200))
    c.pointerMove(ptr(350, 290))
    expect(c.overlay().bindTarget).toBe(cRect.id)
    flushFrames()
    c.pointerUp(ptr(350, 290))
    expect(c.overlay().bindTarget).toBeNull()
    el = store.get(arrow.id) as LinearElement
    expect(el.endBinding).toMatchObject({ id: cRect.id, ax: 0.5, ay: 0 })
    near(ends(el)[1]!, 350, 300 - BIND_GAP)
    // each drag is its own undo step
    history.undo()
    expect((store.get(arrow.id) as LinearElement).endBinding).toBeNull()
    history.undo()
    expect((store.get(arrow.id) as LinearElement).endBinding).toMatchObject({ id: b.id })
  })

  it('deleting target clears binding and keeps points', () => {
    const { c, store, a, arrow, history } = boundPair()
    c.setTool('select')
    c.setSelection([a.id])
    c.keyDown(key('Delete'))
    const el = store.get(arrow.id) as LinearElement
    expect(store.get(a.id)).toBeUndefined()
    expect(el.startBinding).toBeNull()
    expect(el.endBinding).toEqual(arrow.endBinding)
    expect(el).toMatchObject({ x: arrow.x, y: arrow.y, points: arrow.points })
    // one step: undo brings back the target and the binding together
    history.undo()
    expect(store.get(a.id)).toBeDefined()
    expect((store.get(arrow.id) as LinearElement).startBinding).toEqual(arrow.startBinding)
  })

  it('erasing a target clears the binding in the same step', () => {
    const { c, store, b, arrow, history } = boundPair()
    c.setTool('eraser')
    c.pointerDown(ptr(400, 50))
    c.pointerUp(ptr(400, 50))
    expect(store.get(b.id)).toBeUndefined()
    expect((store.get(arrow.id) as LinearElement).endBinding).toBeNull()
    history.undo()
    expect((store.get(arrow.id) as LinearElement).endBinding).toEqual(arrow.endBinding)
  })

  it('remote delete of target → next follow treats as unbound', () => {
    const { doc, store, scene, a, b, arrow, c } = boundPair()
    const remote = new Y.Doc()
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(doc))
    ;(remote.getMap('elements') as Y.Map<unknown>).delete(a.id)
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(remote))
    expect(store.get(a.id)).toBeUndefined()
    // still bound in Y (nobody local cleared it)
    expect((store.get(arrow.id) as LinearElement).startBinding?.id).toBe(a.id)
    const patches = followBindings(store, scene, [b.id])
    expect(patches[arrow.id]!.startBinding).toBeNull()
    for (const v of Object.values(patches[arrow.id]!)) {
      if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true)
    }
    c.setTool('select')
    drag(c, [400, 50], [400, 90])
    const el = store.get(arrow.id) as LinearElement
    expect(el.startBinding).toBeNull()
    expect(el.endBinding?.id).toBe(b.id)
    near(ends(el)[0]!, 104, 50)
    near(ends(el)[1]!, 296, 90)
    expect(el.points.flat().every(Number.isFinite)).toBe(true)
  })

  it('paste remaps bindings among pasted elements only', () => {
    const { c, store, a, arrow } = boundPair()
    store.updateMany({ [a.id]: { groupIds: ['g1'] }, [arrow.id]: { groupIds: ['g1', 'outer'] } })
    const text = serializeClipboard([store.get(a.id)!, store.get(arrow.id)!])
    const parsed = parseClipboard(text) as { elements: ElementInit[] }
    c.pasteElements(parsed.elements, null)
    const sel = [...c.selectedIds.value]
    expect(sel).toHaveLength(2)
    const newA = store.get(sel.find(id => store.get(id)!.type === 'rectangle')!)!
    const newArrow = store.get(sel.find(id => store.get(id)!.type === 'arrow')!) as LinearElement
    expect(newA.id).not.toBe(a.id)
    expect(newArrow.startBinding).toEqual({ ...arrow.startBinding, id: newA.id })
    // B was not pasted: that end comes loose (points kept)
    expect(newArrow.endBinding).toBeNull()
    expect(newArrow.points).toEqual(arrow.points)
    // groups: fresh ids, consistent within the paste, never the originals
    expect(newA.groupIds).toHaveLength(1)
    expect(newA.groupIds[0]).not.toBe('g1')
    expect(newArrow.groupIds[0]).toBe(newA.groupIds[0])
    expect(newArrow.groupIds[1]).not.toBe('outer')
    // the originals are untouched
    expect((store.get(arrow.id) as LinearElement).startBinding?.id).toBe(a.id)
  })

  it('duplicate keeps bindings inside the duplicated set', () => {
    const { c, store, a, b, arrow } = boundPair()
    c.setSelection([a.id, b.id, arrow.id])
    c.duplicate()
    const copies = [...c.selectedIds.value].map(id => store.get(id)!)
    const copyArrow = copies.find(e => e.type === 'arrow') as LinearElement
    const ids = new Set(copies.map(e => e.id))
    expect(ids.has(copyArrow.startBinding!.id)).toBe(true)
    expect(ids.has(copyArrow.endBinding!.id)).toBe(true)
    expect(copyArrow.startBinding!.id).not.toBe(a.id)
    expect(copyArrow.startBinding!.ax).toBe(arrow.startBinding!.ax)
  })
})

describe('binding values', () => {
  const ARROW = {
    id: 'l', type: 'arrow', index: 'a0', x: 0, y: 0, w: 10, h: 0, angle: 0, points: [[0, 0], [10, 0]],
  }

  it('normalizes malformed bindings to null instead of hiding the element', () => {
    const bad: unknown[] = [
      'r', 3, { id: 1, ax: 0, ay: 0 }, { id: 'r', ax: Number.NaN, ay: 0 }, { id: 'r', ax: 0 },
      { id: 'r', ax: 1.6, ay: 0 }, { id: 'r', ax: 0, ay: -0.51 }, [],
    ]
    for (const v of bad) {
      const raw = { ...ARROW, startBinding: v, endBinding: v }
      expect(isRenderable(raw)).toBe(true)
      const el = normalizeElement(raw) as LinearElement
      expect(el.startBinding).toBeNull()
      expect(el.endBinding).toBeNull()
    }
    const ok = normalizeElement({ ...ARROW, startBinding: { id: 'r', ax: -0.5, ay: 1.5, extra: 1 } }) as LinearElement
    expect(ok.startBinding).toEqual({ id: 'r', ax: -0.5, ay: 1.5 })
  })

  it('the clipboard keeps valid bindings (for the paster to remap) and drops malformed ones', () => {
    const paste = (el: Record<string, unknown>) =>
      parseClipboard(JSON.stringify({ type: CLIPBOARD_TYPE, version: 1, elements: [el] })) as { elements: ElementInit[] }
    const good = paste({ ...ARROW, startBinding: { id: 'x', ax: 0, ay: 0.5 }, endBinding: { id: 'y', ax: 2, ay: 0 } })
    const el = good.elements[0] as LinearElement
    expect(el.startBinding).toEqual({ id: 'x', ax: 0, ay: 0.5 })
    expect(el.endBinding).toBeNull()
  })
})

describe('binding geometry', () => {
  const sceneWith = (...inits: Partial<SketchElement>[]) => {
    const store = new BoardStore(new Y.Doc())
    const els = inits.map(i => rect(store, i.x ?? 0, i.y ?? 0, i.w ?? 100, i.h ?? 100, i))
    return { store, scene: new Scene(store), els }
  }

  it('outlineAnchor: nearest outline point in unit coords (ellipse too)', () => {
    const { els } = sceneWith({ x: 0, y: 0 }, { x: 200, y: 0, type: 'ellipse' } as Partial<SketchElement>)
    expect(outlineAnchor(els[0]!, { x: 50, y: -10 })).toEqual({ ax: 0.5, ay: 0, distance: 10 })
    const e = outlineAnchor(els[1]!, { x: 250, y: -10 })
    expect(e.ax).toBeCloseTo(0.5)
    expect(e.ay).toBeCloseTo(0, 2)
    expect(e.distance).toBeCloseTo(10, 1)
  })

  it('findBindTarget: topmost bindable within 12/zoom, excluding ids and frames', () => {
    const store = new BoardStore(new Y.Doc())
    const low = rect(store, 0, 0)
    const top = rect(store, 50, 0)
    store.create({ ...DEFAULT_STYLE, type: 'frame', name: 'F', x: -500, y: -500, w: 2000, h: 2000, angle: 0, locked: false })
    const scene = new Scene(store)
    // (100, 0) is on both outlines: the topmost wins unless excluded
    expect(findBindTarget(scene, { x: 100, y: 0 }, 1, new Set())?.id).toBe(top.id)
    expect(findBindTarget(scene, { x: 100, y: 0 }, 1, new Set([top.id]))?.id).toBe(low.id)
    // deep inside the top rect (50 from its outline) only the lower rect's edge is near
    expect(findBindTarget(scene, { x: 100, y: 50 }, 1, new Set())?.id).toBe(low.id)
    expect(findBindTarget(scene, { x: 50, y: 112 }, 1, new Set())?.id).toBe(top.id)
    expect(findBindTarget(scene, { x: 50, y: 113 }, 1, new Set())).toBeNull()
    expect(findBindTarget(scene, { x: 50, y: 107 }, 2, new Set())).toBeNull()
    // the frame's border is not a bind target
    expect(findBindTarget(scene, { x: -500, y: 0 }, 1, new Set())).toBeNull()
  })

  it('followBindings uses a bound-line index that is rebuilt when the scene changes', () => {
    const { store, scene, els } = sceneWith({ x: 0, y: 0 }, { x: 300, y: 0 })
    const [a, b] = els as [SketchElement, SketchElement]
    const arrowTo = (id: string) => store.create({
      ...DEFAULT_STYLE, type: 'arrow', label: '', x: 104, y: 50, w: 192, h: 0, angle: 0, locked: false,
      points: [[0, 0], [192, 0]], routing: 'straight', startArrowhead: 'none', endArrowhead: 'arrow',
      startBinding: { id, ax: 1, ay: 0.5 }, endBinding: null,
    } as ElementInit)
    const first = arrowTo(a.id)
    expect(Object.keys(followBindings(store, scene, [a.id]))).toEqual([first.id])
    expect(followBindings(store, scene, [b.id])).toEqual({})
    // added after the index was built: picked up
    const second = arrowTo(b.id)
    expect(Object.keys(followBindings(store, scene, [b.id]))).toEqual([second.id])
    // rebound elsewhere: the old target no longer drives it
    store.update(first.id, { startBinding: { id: b.id, ax: 0, ay: 0.5 } })
    expect(followBindings(store, scene, [a.id])).toEqual({})
    expect(Object.keys(followBindings(store, scene, [b.id])).sort()).toEqual([first.id, second.id].sort())
    // no scan of the whole scene: unrelated ids cost nothing
    expect(followBindings(store, scene, ['nope'])).toEqual({})
  })

  it('followBindings never yields NaN for degenerate targets', () => {
    const { store, scene, els } = sceneWith({ x: 0, y: 0, w: 0, h: 0 })
    const b: Binding = { id: els[0]!.id, ax: 0.5, ay: 0.5 }
    const arrow = store.create({
      ...DEFAULT_STYLE, type: 'arrow', label: '', x: 0, y: 0, w: 50, h: 0, angle: 0, locked: false,
      points: [[0, 0], [50, 0]], routing: 'straight', startArrowhead: 'none', endArrowhead: 'arrow',
      startBinding: b, endBinding: null,
    } as ElementInit)
    const patches = followBindings(store, scene, [els[0]!.id])
    const p = patches[arrow.id]!
    for (const v of [p.x, p.y, p.w, p.h, ...(p.points ?? []).flat()]) expect(Number.isFinite(v)).toBe(true)
  })
})

describe('curved lines use the real curve', () => {
  const curved = (over: Partial<LinearElement> = {}): LinearElement => ({
    ...DEFAULT_STYLE, id: 'c', type: 'arrow', index: 'a0', seed: 1, version: 1, locked: false, groupIds: [],
    frameId: null, link: null, label: '', startBinding: null, endBinding: null, x: 0, y: 0, w: 200, h: 100, angle: 0,
    points: [[0, 0], [100, 100], [200, 0]] as LocalPoint[], routing: 'curved', startArrowhead: 'none',
    endArrowhead: 'arrow', strokeWidth: 2, ...over,
  })

  it('curvePoints passes through the route points and bends between them', () => {
    const pts = curvePoints([[0, 0], [100, 100], [200, 0]])
    expect(pts[0]).toEqual([0, 0])
    expect(pts[pts.length - 1]).toEqual([200, 0])
    expect(pts.some(([x, y]) => x === 100 && y === 100)).toBe(true)
    // roughjs's Catmull-Rom (tightness 0) at t = 0.5 of the first span
    const mid = pts.find(([x]) => Math.abs(x - 43.75) < 1e-9)!
    expect(mid[1]).toBeCloseTo(56.25)
  })

  it('hit-testing follows the curve, not the chord', () => {
    const el = curved()
    expect(linearKind.hit(el, { x: 43.75, y: 56.25 }, 0)).toBe(true)
    // on the chord, ~8.8 units off the curve
    expect(linearKind.hit(el, { x: 50, y: 50 }, 2)).toBe(false)
    expect(linearKind.hit(curved({ routing: 'straight' }), { x: 50, y: 50 }, 0)).toBe(true)
  })

  it('the arrowhead points along the curve near the tip', () => {
    const dir = (el: LinearElement) => {
      const h = arrowheadsOf(el)[0]!
      const [w1, tip, w2] = h.points
      return Math.atan2(tip![1] - (w1![1] + w2![1]) / 2, tip![0] - (w1![0] + w2![0]) / 2)
    }
    const chord = Math.atan2(0 - 100, 200 - 100)
    expect(Math.abs(dir(curved({ routing: 'straight' })) - chord)).toBeLessThan(1e-9)
    expect(Math.abs(dir(curved()) - chord)).toBeGreaterThan((5 * Math.PI) / 180)
  })
})

describe('bind target highlight', () => {
  const state = (): RenderState => ({
    viewport: Object.assign(new Viewport(), { zoom: 2, x: 0, y: 0 }), dpr: 1, theme: 'light', grid: false,
    widthCss: 100, heightCss: 100,
  } as unknown as RenderState)
  const overlay = (bindTarget: string | null) => ({
    selectedIds: new Set<string>(), marquee: null, hoverId: null, draft: null, pointHandles: null, previewSegment: null,
    erasing: new Set<string>(), laser: [], lasso: null, bindTarget, guides: [],
  })

  it('outlines the target in the accent color', () => {
    const store = new BoardStore(new Y.Doc())
    const a = rect(store, 0, 0)
    const scene = new Scene(store)
    const canvas = document.createElement('canvas')
    const off: FakeCtx = makeFakeCtx(canvas)
    renderInteractive(off, scene, state(), overlay(null))
    const on: FakeCtx = makeFakeCtx(canvas)
    renderInteractive(on, scene, state(), overlay(a.id))
    const n = (ctx: FakeCtx, name: string) => ctx.calls.filter(c => c.name === name).length
    expect(n(on, 'closePath')).toBe(n(off, 'closePath') + 1)
    expect(n(on, 'lineTo')).toBe(n(off, 'lineTo') + 3)
    expect(on.calls.some(c => c.name === 'set:lineWidth' && c.args[0] === 1)).toBe(true)
  })
})

describe('nested gestures while cropping (Task 6 fix)', () => {
  const image = (store: BoardStore) => store.create({
    ...DEFAULT_STYLE, type: 'image', src: 'https://cdn.example/a.png', naturalW: 400, naturalH: 200, crop: null,
    x: 0, y: 0, w: 200, h: 100, angle: 0, locked: false,
  } as ElementInit)

  it('an edit committed inside the crop gesture survives cancel and stays undoable', () => {
    const { c, store, history } = setup()
    const img = image(store)
    const r = rect(store, 300, 0)
    history.stopCapturing()
    expect(c.startCrop(img.id)).toBe(true)
    // a writer nesting into the open crop gesture (bypassing the controller guards)
    history.beginGesture()
    store.update(r.id, { opacity: 0.5 })
    history.endGesture()
    c.cancelCrop()
    expect(store.get(r.id)!.opacity).toBe(0.5)
    history.undo()
    expect(store.get(r.id)!.opacity).toBe(1)
    expect(store.get(img.id)).toBeDefined()
  })

  it('applyStyle, pasteStyle and reorder are no-ops while cropping or editing', () => {
    const { c, store } = setup()
    const img = image(store)
    const r = rect(store, 300, 0)
    c.setSelection([r.id])
    c.copyStyle()
    expect(c.startCrop(img.id)).toBe(true)
    expect([...c.selectedIds.value]).toEqual([img.id])
    c.applyStyle({ opacity: 0.5 })
    c.pasteStyle()
    c.reorderSelection('front')
    expect(store.get(img.id)!.opacity).toBe(1)
    expect(store.all().map(e => e.id)).toEqual([img.id, r.id])
    // the current style still takes the change (only the writes are blocked)
    expect(c.currentStyle.value.opacity).toBe(0.5)
    c.cancelCrop()
    c.startEditing(r.id, 'label')
    expect(c.editing.value).not.toBeNull()
    c.applyStyle({ opacity: 0.25 })
    expect(store.get(r.id)!.opacity).toBe(1)
    c.cancelEditing()
  })

  it('setTool with no gesture active and destroy heal a leaked gesture depth', () => {
    // with a leaked level, a later gesture only nests: its end would not close the step
    const check = (h: History, store: BoardStore, id: string, x: number) => {
      h.beginGesture()
      store.update(id, { x })
      h.endGesture()
      store.update(id, { x: x + 1 })
      h.undo()
      expect(store.get(id)!.x).toBe(x)
    }
    const { c, store, history } = setup()
    const a = rect(store, 0, 0)
    history.stopCapturing()
    history.beginGesture() // leaked: its end never runs
    c.setTool('select')
    check(history, store, a.id, 10)
    history.beginGesture()
    c.destroy()
    check(history, store, a.id, 20)
  })
})
