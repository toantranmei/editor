import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import * as Y from 'yjs'

import { kindOf } from '../src/elements/kind'
import { stickyFontSize } from '../src/elements/sticky'
import { SketchBoard } from '../src/engine'
import { CLIPBOARD_TYPE, parseClipboard, serializeClipboard } from '../src/io/clipboard'
import { exportSvg } from '../src/io/svg'
import { messages } from '../src/messages'
import { History } from '../src/model/history'
import { Scene } from '../src/model/scene'
import { relevantStyleKeys } from '../src/model/style'
import { BoardStore } from '../src/model/store'
import {
  DEFAULT_STYLE, type ShapeElement, type SketchElement, STICKY_COLORS, type StickyElement, stickyInit,
} from '../src/model/types'
import { memory } from '../src/providers/memory'
import { setMeasurer } from '../src/text/measure'
import { type PointerInput, ToolController } from '../src/tools/controller'
import StylePanel from '../src/ui/StylePanel.vue'
import { Viewport } from '../src/viewport'
import { makeFakeCtx, stubCanvas, stubFrames } from './helpers/canvas'

/** Stub measurer: 0.5 em per character. */
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
  return { store, scene, history, viewport, c }
}

const ptr = (x: number, y: number, extra: Partial<PointerInput> = {}): PointerInput => ({
  screen: { x, y }, button: 0, shift: false, alt: false, mod: false, pressure: 0.5, ...extra,
})
const key = (k: string, mods: { mod?: boolean; shift?: boolean; alt?: boolean } = {}) =>
  ({ key: k, mod: false, shift: false, alt: false, ...mods })

const sticky = (over: Partial<StickyElement> = {}): StickyElement => ({
  ...(stickyInit(0, 0) as unknown as StickyElement),
  id: 's', index: 'a0', seed: 1, version: 1, groupIds: [], frameId: null, ...over,
})

describe('sticky kind', () => {
  it('auto-fit picks 36 for short text and 12 for long text', () => {
    expect(stickyFontSize(sticky({ text: 'Hi' }))).toBe(36)
    expect(stickyFontSize(sticky({ text: '' }))).toBe(36)
    expect(stickyFontSize(sticky({ text: 'word '.repeat(400) }))).toBe(12)
    // in between: the largest size that fits within (w-24) × (h-24)
    const mid = stickyFontSize(sticky({ text: 'word '.repeat(30) }))
    expect([28, 20, 16]).toContain(mid)
  })

  it('svg contains text', () => {
    const el = sticky({ text: 'Xin <đó>', color: '#d3f9d8' })
    const svg = exportSvg([el])
    expect(svg).toContain('<rect')
    expect(svg).toContain('fill="#d3f9d8"')
    expect(svg).toContain('<text')
    expect(svg).toContain('Xin &lt;đó&gt;')
    // the dark theme keeps the pastel fill and dark text
    const dark = kindOf(el).svg(el, 'dark')
    expect(dark).toContain('fill="#d3f9d8"')
    expect(dark).toContain('fill="#1e1e1e"')
  })

  it('draw fills a rounded rect with a soft shadow inside the visual pad, text always #1e1e1e', () => {
    const el = sticky({ text: 'abc', color: '#ffe3e3' })
    const kind = kindOf(el)
    expect(kind.visualPad(el)).toBe(8)
    const ctx = makeFakeCtx(document.createElement('canvas'))
    kind.draw(ctx, el, 'dark')
    const sets = ctx.calls.filter(c => c.name.startsWith('set:'))
    expect(sets).toContainEqual({ name: 'set:fillStyle', args: ['#ffe3e3'] })
    expect(sets).toContainEqual({ name: 'set:shadowColor', args: ['rgba(0,0,0,.15)'] })
    expect(sets).toContainEqual({ name: 'set:shadowBlur', args: [6] })
    expect(sets).toContainEqual({ name: 'set:shadowOffsetY', args: [2] })
    expect(sets).toContainEqual({ name: 'set:fillStyle', args: ['#1e1e1e'] })
    expect(ctx.calls.some(c => c.name === 'fillText' && c.args[0] === 'abc')).toBe(true)
    expect(ctx.calls.find(c => c.name === 'set:font')!.args[0]).toMatch(/^36px /)
  })

  it('drawLod draws the box and the text as simple text', () => {
    const el = sticky({ text: 'abc' })
    const ctx = makeFakeCtx(document.createElement('canvas'))
    kindOf(el).drawLod(ctx, el, 'light', 0.2)
    expect(ctx.calls.some(c => c.name === 'fillText' && c.args[0] === 'abc')).toBe(true)
    expect(ctx.calls.some(c => c.name === 'set:shadowBlur')).toBe(false)
  })

  it('shape labels are drawn in LOD too', () => {
    const rect = {
      ...sticky(), ...DEFAULT_STYLE, type: 'rectangle', label: 'lbl',
    } as unknown as ShapeElement
    const ctx = makeFakeCtx(document.createElement('canvas'))
    kindOf(rect).drawLod(ctx, rect, 'light', 0.2)
    expect(ctx.calls.some(c => c.name === 'fillText' && c.args[0] === 'lbl')).toBe(true)
  })

  it('shapeKey follows box, color, text and font; hit is the box; resize is box only', () => {
    const k = kindOf(sticky())
    const base = k.shapeKey(sticky())
    expect(k.shapeKey(sticky({ x: 50, y: 9 }))).toBe(base)
    for (const over of [{ w: 10 }, { h: 10 }, { color: '#ffe3e3' }, { text: 'x' }, { fontFamily: 'code' as const }, { textAlign: 'left' as const }]) {
      expect(k.shapeKey(sticky(over))).not.toBe(base)
    }
    expect(k.hit(sticky(), { x: 100, y: 100 }, 0)).toBe(true)
    expect(k.hit(sticky(), { x: 205, y: 100 }, 2)).toBe(false)
    expect(k.resize(sticky(), { x: 1, y: 2, w: 3, h: 4 })).toEqual({ x: 1, y: 2, w: 3, h: 4 })
  })
})

describe('sticky tool', () => {
  it('click creates sticky and edits', () => {
    const { store, c } = setup()
    expect(c.keyDown(key('s'))).toBe(true)
    expect(c.tool.value).toBe('sticky')
    c.pointerDown(ptr(300, 300))
    c.pointerUp(ptr(300, 300))
    const els = store.all() as StickyElement[]
    expect(els).toHaveLength(1)
    expect(els[0]).toMatchObject({ type: 'sticky', x: 200, y: 200, w: 200, h: 200, color: STICKY_COLORS[0], text: '' })
    expect(c.editing.value).toEqual({ id: els[0]!.id, kind: 'sticky' })
    c.commitEditing('note')
    expect((store.all()[0] as StickyElement).text).toBe('note')
    // back to select (tool not locked)
    expect(c.tool.value).toBe('select')
    expect([...c.selectedIds.value]).toEqual([els[0]!.id])
  })

  it('drag creates a sticky with the dragged size (min 40); creation + commit is one undo step', () => {
    const { store, c, history } = setup()
    c.setTool('sticky')
    c.pointerDown(ptr(10, 10))
    c.pointerMove(ptr(110, 30))
    c.pointerUp(ptr(110, 30))
    expect(store.all()[0]).toMatchObject({ x: 10, y: 10, w: 100, h: 40 })
    c.commitEditing('a')
    history.undo()
    expect(store.all()).toHaveLength(0)
  })

  it('locked tool stays on sticky; creation color is the last used sticky color', () => {
    const { store, c } = setup()
    c.applyStyle({ color: '#d0ebff' })
    c.toolLocked.value = true
    c.setTool('sticky')
    c.pointerDown(ptr(300, 300))
    c.pointerUp(ptr(300, 300))
    c.commitEditing('')
    expect(c.tool.value).toBe('sticky')
    // an empty sticky is kept
    expect(store.all()).toHaveLength(1)
    expect((store.all()[0] as StickyElement).color).toBe('#d0ebff')
  })

  it('double-click on a sticky edits it', () => {
    const { store, c } = setup()
    const el = store.create(stickyInit(0, 0, { text: 'old' }))
    c.pointerDown(ptr(50, 50))
    c.pointerUp(ptr(50, 50))
    c.doubleClick({ x: 50, y: 50 })
    expect(c.editing.value).toEqual({ id: el.id, kind: 'sticky' })
    c.commitEditing('new')
    expect((store.get(el.id) as StickyElement).text).toBe('new')
  })
})

describe('sticky quick create', () => {
  it('Tab creates next sticky to the right with same color', () => {
    const { store, c, history } = setup()
    const first = store.create(stickyInit(0, 0, { color: '#f3d9fa', w: 150, h: 120 }))
    history.stopCapturing()
    c.setSelection([first.id])
    expect(c.keyDown(key('Tab'))).toBe(true)
    const els = store.all() as StickyElement[]
    expect(els).toHaveLength(2)
    const next = els.find(e => e.id !== first.id)!
    expect(next).toMatchObject({ x: 170, y: 0, w: 150, h: 120, color: '#f3d9fa', text: '' })
    expect(c.editing.value).toEqual({ id: next.id, kind: 'sticky' })
    // while editing, Tab commits and creates the next one
    c.commitAndNext('second')
    expect((store.get(next.id) as StickyElement).text).toBe('second')
    const third = (store.all() as StickyElement[]).find(e => e.id !== first.id && e.id !== next.id)!
    expect(third).toMatchObject({ x: 340, y: 0, color: '#f3d9fa' })
    expect(c.editing.value).toEqual({ id: third.id, kind: 'sticky' })
    c.commitEditing('third')
    // one undo step per create + commit
    history.undo()
    expect(store.get(third.id)).toBeUndefined()
    expect((store.get(next.id) as StickyElement).text).toBe('second')
    history.undo()
    expect(store.get(next.id)).toBeUndefined()
    expect(store.get(first.id)).toBeDefined()
  })

  it('mod+Enter quick-creates; nothing happens without exactly one sticky selected', () => {
    const { store, c } = setup()
    const a = store.create(stickyInit(0, 0))
    const b = store.create(stickyInit(0, 400))
    expect(c.keyDown(key('Tab'))).toBe(false)
    c.setSelection([a.id, b.id])
    expect(c.keyDown(key('Tab'))).toBe(false)
    expect(c.keyDown(key('Enter', { mod: true }))).toBe(false)
    expect(store.all()).toHaveLength(2)
    c.setSelection([b.id])
    expect(c.keyDown(key('Enter', { mod: true }))).toBe(true)
    expect(store.all()).toHaveLength(3)
    expect(c.editing.value?.kind).toBe('sticky')
  })
})

describe('sticky style', () => {
  it('sticky color applied via applyStyle', () => {
    const { store, c } = setup()
    const s = store.create(stickyInit(0, 0))
    const r = store.create({
      type: 'rectangle', x: 300, y: 0, w: 10, h: 10, angle: 0, locked: false, ...DEFAULT_STYLE, label: '',
    })
    c.setSelection([s.id, r.id])
    c.applyStyle({ color: '#ffe8cc' })
    expect((store.get(s.id) as StickyElement).color).toBe('#ffe8cc')
    expect('color' in (store.get(r.id) as unknown as Record<string, unknown>)).toBe(false)
    expect(c.currentStyle.value.color).toBe('#ffe8cc')
    // stickies take no stroke / stroke width / font size
    c.applyStyle({ stroke: '#e03131', strokeWidth: 4, fontSize: 36 })
    const after = store.get(s.id) as unknown as Record<string, unknown>
    expect(after.stroke).toBe(DEFAULT_STYLE.stroke)
    expect(after.strokeWidth).toBe(DEFAULT_STYLE.strokeWidth)
    expect(after.fontSize).not.toBe(36)
  })

  it('relevant keys: color, font family, align, opacity only', () => {
    expect([...relevantStyleKeys('sticky')].sort()).toEqual(['color', 'fontFamily', 'opacity', 'textAlign'])
    expect(relevantStyleKeys('rectangle').has('color')).toBe(false)
  })

  it('StylePanel shows the 8-swatch sticky palette for an all-sticky selection', async () => {
    const el = sticky({ color: '#d0ebff' })
    const w = mount(StylePanel, {
      props: { elements: [el], tool: 'select', currentStyle: setup().c.currentStyle.value, messages: messages.en },
    })
    const sections = w.findAll('[data-section]').map(s => s.attributes('data-section'))
    expect(sections).toContain('stickyColor')
    for (const id of ['stroke', 'background', 'fillStyle', 'strokeWidth', 'strokeStyle', 'sloppiness', 'edges']) {
      expect(sections).not.toContain(id)
    }
    expect(sections).toContain('font')
    expect(sections).toContain('opacity')
    expect(w.find('[data-size]').exists()).toBe(false)
    const swatches = w.findAll('[data-section="stickyColor"] .me-sketch-swatch')
    expect(swatches.map(s => s.attributes('data-value'))).toEqual([...STICKY_COLORS])
    expect(w.find('[data-section="stickyColor"] [data-value="#d0ebff"]').classes()).toContain('is-active')
    await swatches[1]!.trigger('click')
    expect(w.emitted('apply')![0]).toEqual([{ color: STICKY_COLORS[1] }])
  })
})

describe('sticky clipboard', () => {
  it('stickies paste with color / text / font validated', () => {
    const el = sticky({ text: 'hello', color: '#c5f6fa', fontFamily: 'code', textAlign: 'left' })
    const r = parseClipboard(serializeClipboard([el as SketchElement]))
    expect(r).toMatchObject({ elements: [{ type: 'sticky', text: 'hello', color: '#c5f6fa', fontFamily: 'code', textAlign: 'left' }] })
    const bad = { ...el, color: 'red', text: 'x'.repeat(20_000), fontFamily: 'comic', textAlign: 'justify' }
    const r2 = parseClipboard(JSON.stringify({ type: CLIPBOARD_TYPE, version: 1, elements: [bad] })) as { elements: StickyElement[] }
    expect(r2.elements[0]!.color).toBe(STICKY_COLORS[0])
    expect(r2.elements[0]!.text).toHaveLength(10_000)
    expect(r2.elements[0]!.fontFamily).toBe(DEFAULT_STYLE.fontFamily)
    expect(r2.elements[0]!.textAlign).toBe(DEFAULT_STYLE.textAlign)
    // color is a sticky-only prop
    const rect = { ...el, type: 'rectangle', label: '' }
    const r3 = parseClipboard(JSON.stringify({ type: CLIPBOARD_TYPE, version: 1, elements: [rect] })) as { elements: Record<string, unknown>[] }
    expect(r3.elements[0]!.color).toBeUndefined()
  })
})

describe('loadFonts', () => {
  beforeEach(() => vi.resetModules())

  it('fires onFontsLoaded when any face loaded (allSettled)', async () => {
    let n = 0
    class MixedFace {
      load() { return n++ === 0 ? Promise.reject(new Error('404')) : Promise.resolve(this) }
    }
    vi.stubGlobal('FontFace', MixedFace)
    Object.defineProperty(document, 'fonts', { value: { add() {} }, configurable: true })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { loadFonts, onFontsLoaded } = await import('../src/text/fonts')
      const cb = vi.fn()
      onFontsLoaded(cb)
      await loadFonts()
      expect(cb).toHaveBeenCalledTimes(1)
    } finally {
      delete (document as { fonts?: unknown }).fonts
    }
  })

  it('does not fire when every face failed', async () => {
    class BadFace {
      load() { return Promise.reject(new Error('404')) }
    }
    vi.stubGlobal('FontFace', BadFace)
    Object.defineProperty(document, 'fonts', { value: { add() {} }, configurable: true })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { loadFonts, onFontsLoaded } = await import('../src/text/fonts')
      const cb = vi.fn()
      onFontsLoaded(cb)
      await loadFonts()
      expect(cb).not.toHaveBeenCalled()
    } finally {
      delete (document as { fonts?: unknown }).fonts
    }
  })
})

describe('sticky editing (board)', () => {
  const wrappers: VueWrapper[] = []
  beforeEach(() => {
    stubCanvas()
    stubFrames()
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600)
  })
  afterEach(() => {
    for (const w of wrappers.splice(0)) w.unmount()
  })

  it('the editor sits centered in the sticky at the auto-fit size; Tab commits and edits the next sticky', async () => {
    const provider = memory()
    const seedStore = new BoardStore((await provider.connect('b')).doc)
    seedStore.create(stickyInit(0, 0, { text: 'Hi' }))
    const connection = await provider.connect('b')
    const wrapper = mount(SketchBoard, { props: { connection }, attachTo: document.body })
    wrappers.push(wrapper)
    await nextTick()
    await flushPromises()
    const store = new BoardStore(connection.doc)
    const vm = wrapper.vm as unknown as { toScreen: (p: { x: number; y: number }) => { x: number; y: number } }
    const center = vm.toScreen({ x: 100, y: 100 })
    const top = wrapper.findAll('canvas').at(-1)!.element
    const pointer = (type: string) =>
      top.dispatchEvent(new PointerEvent(type, { clientX: center.x, clientY: center.y, button: 0, pointerId: 1, bubbles: true }))
    pointer('pointerdown')
    pointer('pointerup')
    pointer('pointerdown')
    pointer('pointerup')
    top.dispatchEvent(new MouseEvent('dblclick', { clientX: center.x, clientY: center.y, button: 0, bubbles: true }))
    await nextTick()
    const ta = wrapper.find('textarea.me-sketch-text-editor')
    expect(ta.exists()).toBe(true)
    const style = (ta.element as HTMLTextAreaElement).style
    const zoom = Number.parseFloat(style.fontSize) / 36
    expect(zoom).toBeGreaterThan(0)
    expect(style.color).toMatch(/#1e1e1e|rgb\(30, 30, 30\)/)
    // centered horizontally: 12 units of padding on each side
    expect(Number.parseFloat(style.width)).toBeCloseTo(176 * zoom, 1)
    ;(ta.element as HTMLTextAreaElement).value = 'First'
    await ta.trigger('input')
    await ta.trigger('keydown', { key: 'Tab' })
    await nextTick()
    const els = store.all() as StickyElement[]
    expect(els).toHaveLength(2)
    expect(els.find(e => e.text === 'First')).toBeDefined()
    expect(els.find(e => e.text === '')).toMatchObject({ x: 220, y: 0 })
    const next = wrapper.find('textarea.me-sketch-text-editor')
    expect(next.exists()).toBe(true)
    expect((next.element as HTMLTextAreaElement).value).toBe('')
  })
})
