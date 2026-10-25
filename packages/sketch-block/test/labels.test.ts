import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'

import { kindOf, shapeKeyOf } from '../src/elements/kind'
import { labelMidpoint, linearLabelBox } from '../src/elements/linear'
import { History } from '../src/model/history'
import { Scene } from '../src/model/scene'
import { BoardStore } from '../src/model/store'
import { relevantStyleKeys } from '../src/model/style'
import { DEFAULT_STYLE, type ElementInit, type LinearElement } from '../src/model/types'
import { setMeasurer } from '../src/text/measure'
import { type PointerInput, ToolController } from '../src/tools/controller'
import TextEditor from '../src/ui/TextEditor.vue'
import { Viewport } from '../src/viewport'
import { type FakeCtx, stubCanvas } from './helpers/canvas'

/** Stub measurer: 0.5 em per character. */
beforeEach(() => {
  stubCanvas()
  vi.stubGlobal('requestAnimationFrame', () => 0)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  setMeasurer((text, font) => text.length * (Number.parseFloat(font) || 16) * 0.5)
})
afterEach(() => {
  setMeasurer(null)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const ln = (over: Partial<LinearElement> = {}): LinearElement => ({
  id: 'l', type: 'arrow', x: 0, y: 0, w: 200, h: 0, angle: 0, index: 'a0',
  ...DEFAULT_STYLE, groupIds: [], frameId: null, link: null, label: '', startBinding: null, endBinding: null, seed: 3, version: 1,
  locked: false, points: [[0, 0], [200, 0]], routing: 'straight', startArrowhead: 'none', endArrowhead: 'arrow', ...over,
})

const newCtx = () => document.createElement('canvas').getContext('2d') as unknown as FakeCtx

function setup() {
  const store = new BoardStore(new Y.Doc())
  const scene = new Scene(store)
  const history = new History(store)
  const viewport = new Viewport()
  viewport.zoom = 1
  viewport.x = 0
  viewport.y = 0
  const c = new ToolController({ store, scene, history, viewport, readonly: () => false, invalidate: vi.fn() })
  return { store, scene, history, viewport, c }
}

const ptr = (x: number, y: number): PointerInput => ({
  screen: { x, y }, button: 0, shift: false, alt: false, mod: false, pressure: 0.5,
})

describe('arrow label geometry', () => {
  it('label midpoint on elbow route', () => {
    // elbow route (0,0) → (100,0) → (100,60) → (300,60): length 360, half at 180 → 20 down the vertical leg
    const el = ln({ w: 300, h: 60, points: [[0, 0], [300, 60]], routing: 'elbow' })
    const m = labelMidpoint(el)
    expect(m.x).toBeCloseTo(150)
    expect(m.y).toBeCloseTo(30)
    // a straight polyline with unequal legs: the midpoint is by length, not the middle point
    const bent = ln({ w: 300, h: 100, points: [[0, 0], [0, 100], [300, 100]], routing: 'straight' })
    const b = labelMidpoint(bent)
    // length 400, half 200 → 100 along the second leg
    expect(b.x).toBeCloseTo(100)
    expect(b.y).toBeCloseTo(100)
  })

  it('label midpoint on a curved route follows the curve, not the chord', () => {
    const el = ln({ w: 200, h: 100, points: [[0, 100], [100, 0], [200, 100]], routing: 'curved' })
    const m = labelMidpoint(el)
    // symmetric curve through (100, 0): the midpoint by length is its apex
    expect(m.x).toBeCloseTo(100)
    expect(m.y).toBeCloseTo(0)
    const straight = labelMidpoint({ ...el, routing: 'straight' })
    expect(straight.y).toBeCloseTo(0)
    // asymmetric: by curve length, not the middle route point
    const skew = ln({ w: 300, h: 100, points: [[0, 100], [50, 0], [300, 100]], routing: 'curved' })
    const ms = labelMidpoint(skew)
    expect(ms.x).toBeGreaterThan(50)
  })

  it('label box is auto-width and centered on the midpoint', () => {
    const el = ln({ label: 'hello', fontSize: 20 })
    const box = linearLabelBox(el, el.label)
    // 5 chars × 10 px; one line of 20 × 1.25
    expect(box.w).toBeCloseTo(50)
    expect(box.h).toBeCloseTo(25)
    expect(box.x + box.w / 2).toBeCloseTo(100)
    expect(box.y + box.h / 2).toBeCloseTo(0)
  })

  it('visualPad covers a label sticking out of the box', () => {
    const plain = ln()
    const labeled = ln({ label: 'a long label here', fontSize: 20 })
    const k = kindOf(plain)
    // the label is 25 px tall on a 0-high box: at least 12.5 px beyond it
    expect(k.visualPad(labeled)).toBeGreaterThanOrEqual(12.5)
    // wider than the box
    const wide = ln({ label: 'x'.repeat(40), fontSize: 20 })
    const box = linearLabelBox(wide, wide.label)
    expect(k.visualPad(wide)).toBeGreaterThanOrEqual(-box.x)
    expect(k.visualPad(plain)).toBe(k.visualPad(ln({ label: '' })))
  })

  it('shapeKey covers the label and its text style', () => {
    const a = ln({ label: 'a' })
    expect(shapeKeyOf(a)).not.toBe(shapeKeyOf(ln({ label: 'b' })))
    expect(shapeKeyOf(a)).not.toBe(shapeKeyOf(ln({ label: 'a', fontSize: 36 })))
    expect(shapeKeyOf(a)).not.toBe(shapeKeyOf(ln({ label: 'a', fontFamily: 'code' })))
    expect(shapeKeyOf(a)).not.toBe(shapeKeyOf(ln({ label: 'a', textAlign: 'left' })))
  })

  it('a click on the label hits the arrow', () => {
    const el = ln({ label: 'hello', fontSize: 20 })
    // inside the label box, off the shaft
    expect(kindOf(el).hit(el, { x: 110, y: 9 }, 0)).toBe(true)
    expect(kindOf(el).hit(ln(), { x: 110, y: 9 }, 0)).toBe(false)
  })
})

describe('arrow label drawing', () => {
  it('bitmap erases under label', () => {
    const el = ln({ label: 'hello', fontSize: 20 })
    const ctx = newCtx()
    kindOf(el).draw(ctx, el, 'light')
    const names = ctx.calls.map(c => c.name)
    const erase = ctx.calls.findIndex(c => c.name === 'set:globalCompositeOperation' && c.args[0] === 'destination-out')
    expect(erase).toBeGreaterThan(names.indexOf('stroke'))
    // the text bbox (75,-12.5, 50×25) plus 4 px
    const rect = ctx.calls.slice(erase).find(c => c.name === 'fillRect')!
    expect(rect.args.map(n => Math.round(n as number * 100) / 100)).toEqual([71, -16.5, 58, 33])
    const text = ctx.calls.findIndex(c => c.name === 'fillText')
    expect(text).toBeGreaterThan(erase)
    expect(ctx.calls[text]!.args[0]).toBe('hello')
    // compositing is back to normal before the text
    expect(ctx.calls.slice(erase, text).some(c => c.name === 'restore')).toBe(true)
  })

  it('no label: no erase, no text', () => {
    const ctx = newCtx()
    kindOf(ln()).draw(ctx, ln(), 'light')
    expect(ctx.calls.some(c => c.name === 'set:globalCompositeOperation')).toBe(false)
    expect(ctx.calls.some(c => c.name === 'fillText')).toBe(false)
  })

  it('svg uses mask', () => {
    const el = ln({ id: 'a"b<c', label: 'hi & bye' })
    const svg = kindOf(el).svg(el, 'light')
    const id = /<mask id="([^"]+)"/.exec(svg)?.[1]
    expect(id).toBeTruthy()
    // the id is safe inside url(#…) and attributes
    expect(id).toMatch(/^[\w-]+$/)
    expect(svg).toContain(`mask="url(#${id})"`)
    // the hole over the label is black in the mask, the rest white
    expect(svg).toMatch(/<mask[^>]*>.*fill="#ffffff".*fill="#000000".*<\/mask>/)
    expect(svg).toContain('hi &amp; bye')
    // a different element gets a different id
    const other = ln({ id: 'a"b>c', label: 'x' })
    expect(/<mask id="([^"]+)"/.exec(kindOf(other).svg(other, 'light'))?.[1]).not.toBe(id)
    // no label: no mask
    expect(kindOf(ln()).svg(ln(), 'light')).not.toContain('<mask')
  })

  it('LOD draws the label as plain text only when readable', () => {
    const el = ln({ label: 'hello', fontSize: 20 })
    const big = newCtx()
    kindOf(el).drawLod(big, el, 'light', 0.25)
    expect(big.calls.some(c => c.name === 'fillText' && c.args[0] === 'hello')).toBe(true)
    const small = newCtx()
    kindOf(el).drawLod(small, el, 'light', 0.1)
    expect(small.calls.some(c => c.name === 'fillText')).toBe(false)
  })
})

describe('arrow label editing', () => {
  const arrowInit = (over: Partial<LinearElement> = {}) => ({
    ...DEFAULT_STYLE, type: 'arrow', x: 0, y: 0, w: 200, h: 0, angle: 0, locked: false,
    points: [[0, 0], [200, 0]], routing: 'straight', startArrowhead: 'none', endArrowhead: 'arrow', label: '', ...over,
  }) as ElementInit

  it('dblclick arrow edits label', () => {
    const { store, c, history } = setup()
    const a = store.create(arrowInit())
    history.stopCapturing()
    c.pointerDown(ptr(100, 0))
    c.pointerUp(ptr(100, 0))
    c.doubleClick({ x: 100, y: 0 })
    expect(c.editing.value).toEqual({ id: a.id, kind: 'label' })
    c.commitEditing('yes\u0007')
    expect((store.get(a.id) as LinearElement).label).toBe('yes')
    expect(c.selectedIds.value).toEqual(new Set([a.id]))
    // one undo step
    history.undo()
    expect((store.get(a.id) as LinearElement).label).toBe('')
  })

  it('the label editor is auto-width and centered on the shaft midpoint', async () => {
    const element = ln({ x: 10, y: 20, label: 'hello', fontSize: 20 })
    const w = mount(TextEditor, {
      props: { element, kind: 'label', view: { x: 0, y: 0, zoom: 2 }, theme: 'light' }, attachTo: document.body,
    })
    await flushPromises()
    const s = (w.find('textarea').element as HTMLTextAreaElement).style
    // label box 50×25 centered on (110, 20) in scene → left 85, top 7.5; ×2 zoom; +2 px caret room, no wrapping
    expect(s.left).toBe('170px')
    expect(s.top).toBe('15px')
    expect(s.width).toBe('102px')
    expect(s.height).toBe('50px')
    expect(s.whiteSpace).toBe('pre')
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('hello')
    w.unmount()
  })

  it('a text-tool click on a line creates free text instead of editing the label', () => {
    const { store, c } = setup()
    const a = store.create(arrowInit())
    c.setTool('text')
    c.pointerDown(ptr(100, 0))
    c.pointerUp(ptr(100, 0))
    expect(c.editing.value?.kind).toBe('text')
    expect(c.editing.value?.id).not.toBe(a.id)
  })

  it('a locked arrow is not edited', () => {
    const { store, c } = setup()
    store.create(arrowInit({ locked: true }))
    c.pointerDown(ptr(100, 0))
    c.pointerUp(ptr(100, 0))
    c.doubleClick({ x: 100, y: 0 })
    expect(c.editing.value).toBeNull()
  })

  it('font style applies to lines and arrows', () => {
    for (const t of ['line', 'arrow'] as const) {
      const keys = relevantStyleKeys(t)
      expect(keys.has('fontFamily') && keys.has('fontSize') && keys.has('textAlign'), t).toBe(true)
    }
  })
})
