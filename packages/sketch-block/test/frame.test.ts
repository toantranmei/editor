import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'

import { childrenOf, frameMembership, FRAME_NAME_MAX } from '../src/elements/frame'
import { kindOf } from '../src/elements/kind'
import { exportSvg } from '../src/io/svg'
import { CLIPBOARD_TYPE, parseClipboard } from '../src/io/clipboard'
import { History } from '../src/model/history'
import { Scene } from '../src/model/scene'
import { BoardStore } from '../src/model/store'
import { DEFAULT_STYLE, type ElementInit, type FrameElement, type SketchElement } from '../src/model/types'
import { BitmapCache } from '../src/render/bitmap-cache'
import { frameLabelAt, frameLabelBox } from '../src/render/frame-labels'
import { renderInteractive } from '../src/render/interactive'
import { type RenderState, renderStatic } from '../src/render/static'
import { setMeasurer } from '../src/text/measure'
import { type PointerInput, ToolController } from '../src/tools/controller'
import TextEditor from '../src/ui/TextEditor.vue'
import { Viewport } from '../src/viewport'
import { type FakeCtx, stubCanvas, stubFrames } from './helpers/canvas'

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

function setup() {
  const doc = new Y.Doc()
  const store = new BoardStore(doc)
  const scene = new Scene(store)
  const history = new History(store)
  const viewport = new Viewport()
  viewport.zoom = 1
  viewport.x = 0
  viewport.y = 0
  const c = new ToolController({ store, scene, history, viewport, readonly: () => false, invalidate: vi.fn() })
  return { doc, store, scene, history, viewport, c }
}

const ptr = (x: number, y: number, extra: Partial<PointerInput> = {}): PointerInput => ({
  screen: { x, y }, button: 0, shift: false, alt: false, mod: false, pressure: 0.5, ...extra,
})
const key = (k: string, mods: { mod?: boolean; shift?: boolean; alt?: boolean } = {}) =>
  ({ key: k, mod: false, shift: false, alt: false, ...mods })

const frameInit = (over: Partial<FrameElement> = {}): ElementInit => ({
  ...DEFAULT_STYLE, type: 'frame', name: 'F', x: 100, y: 100, w: 400, h: 300, angle: 0, locked: false, ...over,
} as ElementInit)
const rectInit = (over: Record<string, unknown> = {}): ElementInit => ({
  ...DEFAULT_STYLE, type: 'rectangle', label: '', x: 600, y: 600, w: 50, h: 50, angle: 0, locked: false, ...over,
} as ElementInit)

function drag(c: ToolController, from: [number, number], to: [number, number], extra: Partial<PointerInput> = {}) {
  c.pointerDown(ptr(from[0], from[1], extra))
  c.pointerMove(ptr((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, extra))
  c.pointerMove(ptr(to[0], to[1], extra))
  c.pointerUp(ptr(to[0], to[1], extra))
}

describe('frame kind', () => {
  it('hits the border band, not the interior', () => {
    const { store } = setup()
    const f = store.create(frameInit({ x: 0, y: 0 }))
    const k = kindOf(f)
    expect(k.hit(f, { x: 0, y: 150 }, 6)).toBe(true)
    expect(k.hit(f, { x: 403, y: 150 }, 6)).toBe(true)
    expect(k.hit(f, { x: 200, y: 150 }, 6)).toBe(false)
    expect(k.hit(f, { x: 200, y: 320 }, 6)).toBe(false)
  })

  it('svg is a rect plus the name', () => {
    const { store } = setup()
    const f = store.create(frameInit({ name: 'Kế <hoạch>' }))
    const svg = exportSvg([f])
    expect(svg).toContain('<rect')
    expect(svg).toContain('stroke="#868e96"')
    expect(svg).toContain('Kế &lt;hoạch&gt;')
  })
})

describe('frame membership', () => {
  it('the topmost frame fully containing the element; none when it sticks out', () => {
    const { store, scene } = setup()
    const a = store.create(frameInit({ x: 0, y: 0, w: 500, h: 500 }))
    const b = store.create(frameInit({ x: 50, y: 50, w: 200, h: 200 }))
    const inner = store.create(rectInit({ x: 100, y: 100 }))
    const half = store.create(rectInit({ x: 230, y: 100 }))
    const out = store.create(rectInit({ x: 480, y: 480 }))
    expect(frameMembership(scene, scene.get(inner.id)!)).toBe(b.id)
    expect(frameMembership(scene, scene.get(half.id)!)).toBe(a.id)
    expect(frameMembership(scene, scene.get(out.id)!)).toBeNull()
    // frames never nest
    expect(frameMembership(scene, scene.get(b.id)!)).toBeNull()
    store.update(inner.id, { frameId: b.id })
    expect(childrenOf(scene, b.id).map(e => e.id)).toEqual([inner.id])
  })
})

describe('frame tool', () => {
  it('key f, drag creates "Frame N" at the back, capturing elements inside, one undo step', () => {
    const { store, c, history } = setup()
    store.create(frameInit({ x: 1000, y: 1000 }))
    const r = store.create(rectInit({ x: 150, y: 150 }))
    history.stopCapturing()
    expect(c.keyDown(key('f'))).toBe(true)
    expect(c.tool.value).toBe('frame')
    drag(c, [100, 100], [400, 400])
    const all = store.all()
    const made = all[0] as FrameElement
    expect(made.type).toBe('frame')
    expect(made.name).toBe('Frame 2')
    expect(made).toMatchObject({ x: 100, y: 100, w: 300, h: 300, angle: 0 })
    expect(store.get(r.id)!.frameId).toBe(made.id)
    expect(c.selectedIds.value).toEqual(new Set([made.id]))
    expect(c.tool.value).toBe('select')
    history.undo()
    expect(store.all()).toHaveLength(2)
    expect(store.get(r.id)!.frameId).toBeNull()
  })

  it('enforces the minimum size of 40', () => {
    const { store, c } = setup()
    c.setTool('frame')
    drag(c, [100, 100], [110, 110])
    expect(store.all()[0]).toMatchObject({ type: 'frame', w: 40, h: 40, name: 'Frame 1' })
  })

  it('frames have no rotate handle', () => {
    const { store, c } = setup()
    const f = store.create(frameInit())
    c.setSelection([f.id])
    // rotate handle would sit centered above the top edge
    drag(c, [300, 100 - 24], [400, 50])
    expect(store.get(f.id)!.angle).toBe(0)
  })
})

describe('frames and the select tool', () => {
  it('element dropped inside frame gets frameId', () => {
    const { store, c, history } = setup()
    const f = store.create(frameInit())
    const r = store.create(rectInit())
    history.stopCapturing()
    drag(c, [600, 625], [200, 225])
    expect(store.get(r.id)).toMatchObject({ x: 200, y: 200, frameId: f.id })
    // one undo step: position and membership
    history.undo()
    expect(store.get(r.id)).toMatchObject({ x: 600, y: 600, frameId: null })
  })

  it('moving frame moves children once even if selected', () => {
    const { store, c, history } = setup()
    const f = store.create(frameInit())
    const r = store.create(rectInit({ x: 200, y: 200, frameId: f.id }))
    const free = store.create(rectInit({ x: 800, y: 800 }))
    history.stopCapturing()
    c.setSelection([f.id, r.id])
    drag(c, [100, 250], [200, 250])
    expect(store.get(f.id)).toMatchObject({ x: 200, y: 100 })
    expect(store.get(r.id)).toMatchObject({ x: 300, y: 200, frameId: f.id })
    expect(store.get(free.id)).toMatchObject({ x: 800, y: 800 })
    history.undo()
    expect(store.get(r.id)).toMatchObject({ x: 200, y: 200 })
    expect(store.get(f.id)).toMatchObject({ x: 100, y: 100 })
  })

  it('moving a frame alone moves its children; Escape reverts them too', () => {
    const frames = stubFrames()
    const { store, c, history } = setup()
    const f = store.create(frameInit())
    const r = store.create(rectInit({ x: 200, y: 200, frameId: f.id }))
    history.stopCapturing()
    c.pointerDown(ptr(100, 250))
    c.pointerMove(ptr(150, 250))
    c.pointerMove(ptr(200, 250))
    // the select tool exposes every id the gesture moves (Task 6: bound arrows)
    expect(new Set(c.movedIds())).toEqual(new Set([f.id, r.id]))
    frames.flush()
    expect(store.get(r.id)!.x).toBe(300)
    c.keyDown(key('Escape'))
    expect(store.get(r.id)).toMatchObject({ x: 200, y: 200, frameId: f.id })
    expect(store.get(f.id)).toMatchObject({ x: 100, y: 100 })
    expect(c.movedIds()).toEqual([])
    // the reverted move left no undo step: the next undo removes the creations
    history.undo()
    expect(store.all()).toHaveLength(0)
  })

  it('moving child out clears frameId', () => {
    const { store, c } = setup()
    const f = store.create(frameInit())
    const r = store.create(rectInit({ x: 200, y: 200, frameId: f.id }))
    drag(c, [200, 225], [700, 725])
    expect(store.get(r.id)).toMatchObject({ x: 700, y: 700, frameId: null })
    expect(store.get(f.id)).toMatchObject({ x: 100, y: 100 })
  })

  it('resizing a frame recomputes membership (captures and releases)', () => {
    const { store, c } = setup()
    const f = store.create(frameInit())
    const inside = store.create(rectInit({ x: 420, y: 200, frameId: f.id }))
    const outside = store.create(rectInit({ x: 520, y: 420 }))
    c.setSelection([f.id])
    // drag the se handle from (500,400) to (600,500): now 500×400, both inside
    drag(c, [500, 400], [600, 500])
    expect(store.get(f.id)).toMatchObject({ w: 500, h: 400 })
    expect(store.get(outside.id)!.frameId).toBe(f.id)
    expect(store.get(inside.id)!.frameId).toBe(f.id)
    // shrink: the e handle back to x 450, `inside` (420..470) now sticks out
    drag(c, [600, 300], [450, 300])
    expect(store.get(inside.id)!.frameId).toBeNull()
  })

  it('deleting frame clears children frameId in one undo step', () => {
    const { store, c, history } = setup()
    const f = store.create(frameInit())
    const r = store.create(rectInit({ x: 200, y: 200, frameId: f.id }))
    history.stopCapturing()
    c.setSelection([f.id])
    expect(c.keyDown(key('Delete'))).toBe(true)
    expect(store.get(f.id)).toBeUndefined()
    expect(store.get(r.id)!.frameId).toBeNull()
    history.undo()
    expect(store.get(f.id)).toBeDefined()
    expect(store.get(r.id)!.frameId).toBe(f.id)
    history.undo()
    expect(store.all()).toHaveLength(0)
  })

  it('erasing a frame clears its children frameId', () => {
    const { store, c, history } = setup()
    const f = store.create(frameInit())
    const r = store.create(rectInit({ x: 200, y: 200, frameId: f.id }))
    history.stopCapturing()
    c.setTool('eraser')
    drag(c, [90, 250], [110, 250])
    expect(store.get(f.id)).toBeUndefined()
    expect(store.get(r.id)!.frameId).toBeNull()
    history.undo()
    expect(store.get(r.id)!.frameId).toBe(f.id)
  })

  it('pasting into a frame sets frameId; a pasted frame goes to the back', () => {
    const { store, c, history } = setup()
    const f = store.create(frameInit())
    const top = store.create(rectInit({ x: 900, y: 900 }))
    history.stopCapturing()
    c.pasteElements([rectInit({ x: 0, y: 0 }), frameInit({ x: 1000, y: 0, w: 100, h: 100 })], { x: 150, y: 150 })
    const all = store.all()
    const pasted = all.find(e => e.type === 'rectangle' && e.id !== top.id)!
    expect(pasted.frameId).toBe(f.id)
    expect(all[0]!.type).toBe('frame')
    expect(all[0]!.id).not.toBe(f.id)
    history.undo()
    expect(store.all()).toHaveLength(2)
  })
})

describe('frame rendering', () => {
  const state = (over: Partial<RenderState> = {}): RenderState => ({
    viewport: Object.assign(new Viewport(), { x: 0, y: 0, zoom: 1 }),
    widthCss: 1000, heightCss: 1000, dpr: 1, theme: 'light', grid: false, ...over,
  })

  it('children clipped', () => {
    stubCanvas()
    const { store, scene } = setup()
    const f = store.create(frameInit())
    store.create(rectInit({ x: 450, y: 200, frameId: f.id }))
    store.create(rectInit({ x: 700, y: 700 }))
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d') as unknown as FakeCtx
    renderStatic(ctx, scene, state(), new BitmapCache())
    const names = ctx.calls.map(c => c.name)
    const draws = names.flatMap((n, i) => (n === 'drawImage' ? [i] : []))
    expect(draws).toHaveLength(3)
    const clip = names.indexOf('clip')
    expect(clip).toBeGreaterThan(draws[0]!)
    expect(clip).toBeLessThan(draws[1]!)
    expect(names.lastIndexOf('save', clip)).toBeGreaterThan(draws[0]!)
    const rect = ctx.calls[names.lastIndexOf('rect', clip)]!
    expect(rect.args).toEqual([100, 100, 400, 300])
    const restore = names.indexOf('restore', draws[1]!)
    expect(restore).toBeGreaterThan(draws[1]!)
    expect(restore).toBeLessThan(draws[2]!)
    // only one clip: the free element is drawn unclipped
    expect(names.filter(n => n === 'clip')).toHaveLength(1)
  })

  it('draws the frame name in 12 px screen text above the top-left, at any zoom', () => {
    stubCanvas()
    const { store, scene } = setup()
    store.create(frameInit({ name: 'Plan' }))
    for (const zoom of [0.5, 2]) {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d') as unknown as FakeCtx
      renderInteractive(ctx, scene, state({ viewport: Object.assign(new Viewport(), { x: 0, y: 0, zoom }) }), {
        selectedIds: new Set(), marquee: null, hoverId: null, draft: null, pointHandles: null, previewSegment: null,
        erasing: new Set(), laser: [], lasso: null, bindTarget: null, guides: [],
      })
      const text = ctx.calls.find(c => c.name === 'fillText')!
      expect(text.args[0]).toBe('Plan')
      expect(text.args[1]).toBeCloseTo(100 * zoom)
      expect(text.args[2] as number).toBeLessThan(100 * zoom)
      const fonts = ctx.calls.filter(c => c.name === 'set:font').map(c => c.args[0])
      expect(fonts.some(f => String(f).startsWith('12px'))).toBe(true)
    }
  })

  it('label hit box scales with zoom', () => {
    const { store, scene } = setup()
    const f = store.create(frameInit({ name: 'Plan' })) as FrameElement
    const b1 = frameLabelBox(f, 1)
    const b2 = frameLabelBox(f, 2)
    expect(b1.y + b1.h).toBeLessThan(100)
    expect(b2.h).toBeCloseTo(b1.h / 2)
    expect(frameLabelAt(scene, { x: 105, y: b1.y + b1.h / 2 }, 1)?.id).toBe(f.id)
    expect(frameLabelAt(scene, { x: 105, y: 150 }, 1)).toBeUndefined()
  })
})

describe('frame rename', () => {
  it('rename frame', () => {
    const { store, c, history } = setup()
    const f = store.create(frameInit({ name: 'Frame 1' }))
    history.stopCapturing()
    const b = frameLabelBox(f as FrameElement, 1)
    const at = { x: b.x + 5, y: b.y + b.h / 2 }
    // a click on the label selects the frame
    c.pointerDown(ptr(at.x, at.y))
    c.pointerUp(ptr(at.x, at.y))
    expect(c.selectedIds.value).toEqual(new Set([f.id]))
    c.doubleClick(at)
    expect(c.editing.value).toEqual({ id: f.id, kind: 'frame' })
    c.commitEditing('Kế hoạch\nQ4')
    expect((store.get(f.id) as FrameElement).name).toBe('Kế hoạch Q4')
    // capped
    c.doubleClick(at)
    c.commitEditing('x'.repeat(500))
    expect((store.get(f.id) as FrameElement).name).toHaveLength(FRAME_NAME_MAX)
    history.undo()
    expect((store.get(f.id) as FrameElement).name).toBe('Kế hoạch Q4')
  })

  it('the editor is one line in 12 px text above the frame; Enter commits', async () => {
    const element = {
      ...frameInit({ name: 'Plan' }), id: 'f', index: 'a0', seed: 1, version: 1, groupIds: [], frameId: null,
    } as unknown as SketchElement
    const view = { x: 0, y: 0, zoom: 2 }
    const w = mount(TextEditor, { props: { element, kind: 'frame', view, theme: 'light' }, attachTo: document.body })
    await flushPromises()
    const ta = w.find('textarea')
    const s = (ta.element as HTMLTextAreaElement).style
    expect(s.fontSize).toBe('12px')
    expect(s.left).toBe('200px')
    expect(Number.parseFloat(s.top)).toBeLessThan(200)
    expect(s.whiteSpace).toBe('pre')
    expect((ta.element as HTMLTextAreaElement).value).toBe('Plan')
    await ta.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('commit')).toEqual([['Plan']])
    w.unmount()
  })
})

describe('frame clipboard', () => {
  it('keeps the name (capped at 200), zero angle, no frameId', () => {
    const r = parseClipboard(JSON.stringify({
      type: CLIPBOARD_TYPE, version: 1,
      elements: [{ ...frameInit({ name: 'n'.repeat(300) }), angle: 1 }],
    })) as { elements: FrameElement[] }
    expect(r.elements).toHaveLength(1)
    expect(r.elements[0]!.name).toHaveLength(200)
    expect(r.elements[0]!.angle).toBe(0)
  })
})

describe('membership of drawn elements', () => {
  function withFrame() {
    const s = setup()
    const f = s.store.create(frameInit())
    s.history.stopCapturing()
    return { ...s, f }
  }
  const newest = (store: BoardStore) => store.all().find(e => e.type !== 'frame')!

  it('a rectangle drawn inside a frame gets frameId; one undo removes it', () => {
    const { store, c, history, f } = withFrame()
    c.setTool('rectangle')
    drag(c, [150, 150], [250, 250])
    expect(newest(store).frameId).toBe(f.id)
    history.undo()
    expect(store.all()).toHaveLength(1)
  })

  it('a rectangle drawn outside stays null', () => {
    const { store, c } = withFrame()
    c.setTool('rectangle')
    drag(c, [600, 600], [700, 700])
    expect(newest(store).frameId).toBeNull()
  })

  it('a pen stroke drawn inside gets frameId; one undo removes it', () => {
    const { store, c, history, f } = withFrame()
    c.setTool('pen')
    drag(c, [150, 150], [250, 250])
    expect(newest(store).frameId).toBe(f.id)
    history.undo()
    expect(store.all()).toHaveLength(1)
  })

  it('an arrow drawn inside gets frameId; one undo removes it', () => {
    const { store, c, history, f } = withFrame()
    c.setTool('arrow')
    drag(c, [150, 150], [250, 250])
    expect(newest(store).frameId).toBe(f.id)
    history.undo()
    expect(store.all()).toHaveLength(1)
  })

  it('a sticky created inside gets frameId on commit; one undo removes it', () => {
    const { store, c, history, f } = withFrame()
    c.setTool('sticky')
    drag(c, [150, 150], [250, 250])
    c.commitEditing('hi')
    expect(newest(store).frameId).toBe(f.id)
    history.undo()
    expect(store.all()).toHaveLength(1)
  })

  it('a text created inside gets frameId on commit (after autosize); one undo removes it', () => {
    const { store, c, history, f } = withFrame()
    c.setTool('text')
    c.pointerDown(ptr(150, 200))
    c.pointerUp(ptr(150, 200))
    c.commitEditing('hello')
    expect(newest(store).frameId).toBe(f.id)
    history.undo()
    expect(store.all()).toHaveLength(1)
  })

  it('a text growing out of its frame on commit leaves it', () => {
    const { store, c, history, f } = withFrame()
    const t = store.create({
      ...DEFAULT_STYLE, type: 'text', text: 'a', autoSize: true, x: 400, y: 200, w: 10, h: 25, angle: 0, locked: false,
      frameId: f.id,
    } as ElementInit)
    history.stopCapturing()
    c.startEditing(t.id, 'text')
    c.commitEditing('a much longer line of text')
    expect(store.get(t.id)!.frameId).toBeNull()
    history.undo()
    expect(store.get(t.id)!.frameId).toBe(f.id)
  })

  it('a locked child keeps its frameId and position when the frame moves', () => {
    const { store, c, f } = withFrame()
    const r = store.create(rectInit({ x: 200, y: 200, frameId: f.id, locked: true }))
    const v = store.get(r.id)!.version
    drag(c, [100, 250], [600, 250])
    expect(store.get(f.id)!.x).toBe(600)
    expect(store.get(r.id)).toMatchObject({ x: 200, y: 200, frameId: f.id, version: v })
  })
})
