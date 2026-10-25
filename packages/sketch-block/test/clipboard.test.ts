import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import * as Y from 'yjs'

import { SketchBoard } from '../src/engine'
import { CLIPBOARD_TYPE, parseClipboard, serializeClipboard } from '../src/io/clipboard'
import { History } from '../src/model/history'
import { Scene } from '../src/model/scene'
import { BoardStore } from '../src/model/store'
import {
  DEFAULT_STYLE, type ElementInit, type FreedrawElement, type LinearElement, type ShapeElement, type TextElement,
} from '../src/model/types'
import { memory } from '../src/providers/memory'
import { setMeasurer } from '../src/text/measure'
import { ToolController } from '../src/tools/controller'
import { Viewport } from '../src/viewport'
import { stubCanvas, stubFrames } from './helpers/canvas'

/** Stub measurer: 10 px per character at any font. */
beforeEach(() => setMeasurer(text => text.length * 10))
afterEach(() => setMeasurer(null))

const rectInit = (over: Partial<ShapeElement> = {}) => ({
  type: 'rectangle' as const, x: 0, y: 0, w: 100, h: 50, angle: 0, locked: false, ...DEFAULT_STYLE, label: '',
  ...over,
})

const lineInit = (over: Partial<LinearElement> = {}): ElementInit => ({
  type: 'line', x: 200, y: 100, w: 40, h: 30, angle: 0, locked: false, ...DEFAULT_STYLE,
  points: [[0, 0], [40, 30]], routing: 'straight', startArrowhead: 'none', endArrowhead: 'none', ...over,
})

const drawInit = (over: Partial<FreedrawElement> = {}): ElementInit => ({
  type: 'freedraw', x: 10, y: 20, w: 5, h: 5, angle: 0, locked: false, ...DEFAULT_STYLE,
  points: [[0, 0], [5, 5]], pressures: [0.5, 0.6], highlighter: false, ...over,
})

function setup(readonly = false) {
  const doc = new Y.Doc()
  const store = new BoardStore(doc)
  const scene = new Scene(store)
  const history = new History(store)
  const viewport = new Viewport()
  viewport.zoom = 1
  viewport.x = 0
  viewport.y = 0
  const c = new ToolController({ store, scene, history, viewport, readonly: () => readonly, invalidate: vi.fn() })
  return { doc, store, scene, history, viewport, c }
}

const imageInit = (src: string, x = 0): ElementInit => ({
  type: 'image', x, y: 0, w: 100, h: 100, angle: 0, locked: false, ...DEFAULT_STYLE, src, naturalW: 100, naturalH: 100,
  crop: null,
} as unknown as ElementInit)

const payload = (elements: unknown[]) => JSON.stringify({ type: CLIPBOARD_TYPE, version: 1, elements })

describe('serializeClipboard / parseClipboard', () => {
  it('round-trip serialize/parse', () => {
    const { store } = setup()
    const els = store.createMany([rectInit({ x: 5, y: 6, label: 'hi', seed: 42 } as never), lineInit(), drawInit()])
    const text = serializeClipboard(els)
    const raw = JSON.parse(text)
    expect(raw.type).toBe(CLIPBOARD_TYPE)
    expect(raw.version).toBe(1)
    expect(raw.elements).toHaveLength(3)
    for (const e of raw.elements) {
      expect(e).not.toHaveProperty('index')
      expect(e).not.toHaveProperty('version')
      expect(typeof e.seed).toBe('number')
    }
    const parsed = parseClipboard(text)
    expect(parsed && 'elements' in parsed).toBe(true)
    const out = (parsed as { elements: ElementInit[] }).elements
    expect(out).toHaveLength(3)
    expect(out[0]).toMatchObject({ type: 'rectangle', x: 5, y: 6, w: 100, h: 50, label: 'hi', seed: els[0]!.seed })
    expect(out[1]).toMatchObject({ type: 'line', points: [[0, 0], [40, 30]] })
    expect(out[2]).toMatchObject({ type: 'freedraw', points: [[0, 0], [5, 5]], pressures: [0.5, 0.6] })
    for (const [i, e] of out.entries()) {
      // the source id is carried only so the paster can remap bindings (pasteElements always assigns new ids)
      expect(e.id).toBe(els[i]!.id)
      expect(e).not.toHaveProperty('index')
      expect(e).not.toHaveProperty('version')
    }
  })

  it('foreign JSON becomes text', () => {
    expect(parseClipboard('{"type":"excalidraw/clipboard","elements":[]}'))
      .toEqual({ text: '{"type":"excalidraw/clipboard","elements":[]}' })
    expect(parseClipboard('[1,2,3]')).toEqual({ text: '[1,2,3]' })
    expect(parseClipboard('hello world')).toEqual({ text: 'hello world' })
  })

  it('malformed JSON becomes text and never throws', () => {
    expect(parseClipboard('{"type": "mei-sketch/clipboard", ')).toEqual({ text: '{"type": "mei-sketch/clipboard", ' })
    expect(parseClipboard('')).toBeNull()
    expect(parseClipboard('   \n ')).toBeNull()
    // own type with junk payloads: never throws
    for (const junk of [
      { type: CLIPBOARD_TYPE },
      { type: CLIPBOARD_TYPE, elements: 'x' },
      { type: CLIPBOARD_TYPE, elements: [null, 1, 'a', [], { type: 'rectangle' }] },
      { type: CLIPBOARD_TYPE, elements: [{ ...rectInit(), x: 'NaN' }, { ...rectInit(), w: Number.NaN }] },
      { type: CLIPBOARD_TYPE, elements: [{ ...lineInit(), points: 'nope' }, { ...lineInit(), points: [[0, 'a']] }] },
      { type: CLIPBOARD_TYPE, elements: [{ ...drawInit(), pressures: {} }] },
    ]) {
      expect(() => parseClipboard(JSON.stringify(junk))).not.toThrow()
    }
    const r = parseClipboard(JSON.stringify({
      type: CLIPBOARD_TYPE,
      elements: [null, { type: 'rectangle' }, { ...rectInit(), x: 'NaN' }, { ...lineInit(), points: [[0, 'a']] },
        { ...drawInit(), pressures: {} }],
    }))
    expect(r).toEqual({ elements: [] })
    // long text is truncated
    const long = parseClipboard('a'.repeat(20_000)) as { text: string }
    expect(long.text).toHaveLength(10_000)
  })

  it('clamps negative sizes and drops unknown props / invalid styles', () => {
    const r = parseClipboard(payload([
      { ...rectInit(), w: -5, h: -1, evil: '<script>', stroke: { x: 1 }, strokeWidth: 99, opacity: 7 },
    ])) as { elements: ElementInit[] }
    const el = r.elements[0] as Record<string, unknown>
    expect(el.w).toBe(0)
    expect(el.h).toBe(0)
    expect(el).not.toHaveProperty('evil')
    expect(el.stroke).toBe(DEFAULT_STYLE.stroke)
    expect(el.strokeWidth).toBe(DEFAULT_STYLE.strokeWidth)
    expect(el.opacity).toBe(1)
  })

  it('hostile payload: coordinates and sizes are clamped', () => {
    const r = parseClipboard(payload([
      { ...rectInit(), x: 1e308, y: -1e308 },
      { ...rectInit(), w: 1e12, h: 1e12 },
    ])) as { elements: ElementInit[] }
    expect(r.elements).toHaveLength(2)
    expect(r.elements[0]).toMatchObject({ x: 1e6, y: -1e6 })
    expect(r.elements[1]).toMatchObject({ w: 1e5, h: 1e5 })
  })

  it('hostile payload: 1e999 (Infinity) is rejected', () => {
    const text = `{"type":"${CLIPBOARD_TYPE}","version":1,"elements":[`
      + `{"type":"rectangle","x":1e999,"y":0,"w":10,"h":10,"angle":0},`
      + `{"type":"rectangle","x":0,"y":0,"w":10,"h":10,"angle":0}]}`
    const r = parseClipboard(text) as { elements: ElementInit[] }
    expect(r.elements).toHaveLength(1)
    expect(r.elements[0]).toMatchObject({ x: 0 })
  })

  it('hostile payload: __proto__ is not copied', () => {
    const text = `{"type":"${CLIPBOARD_TYPE}","version":1,"elements":[`
      + `{"type":"rectangle","x":0,"y":0,"w":10,"h":10,"angle":0,"__proto__":{"polluted":1}}]}`
    const r = parseClipboard(text) as { elements: ElementInit[] }
    const el = r.elements[0]!
    expect(Object.getPrototypeOf(el)).toBe(Object.prototype)
    expect((el as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.prototype.hasOwnProperty.call(el, '__proto__')).toBe(false)
  })

  it('own payloads: exactly 24 000 000 chars accepted, one more is too large; text and label capped', () => {
    const shell = payload([{ ...rectInit(), label: '' }])
    const exact = payload([{ ...rectInit(), label: 'x'.repeat(24_000_000 - shell.length) }])
    expect(exact).toHaveLength(24_000_000)
    const r = parseClipboard(exact) as { elements: ShapeElement[] }
    expect(r.elements).toHaveLength(1)
    expect(r.elements[0]!.label).toHaveLength(10_000)
    const over = payload([{ ...rectInit(), label: 'x'.repeat(24_000_001 - shell.length) }])
    expect(parseClipboard(over)).toEqual({ tooLarge: true })
    const t = parseClipboard(payload([{ type: 'text', x: 0, y: 0, w: 10, h: 10, angle: 0, text: 'y'.repeat(50_000) }])) as {
      elements: TextElement[]
    }
    expect(t.elements[0]!.text).toHaveLength(10_000)
  })

  it('hostile payload: points are capped, out-of-box points dropped, pressures capped', () => {
    const many = Array.from({ length: 30_000 }, (_, i) => [i % 50, (i * 7) % 50])
    const r = parseClipboard(payload([
      { ...drawInit(), w: 50, h: 50, points: many, pressures: many.map(() => 0.5) },
      { ...drawInit(), w: 5, h: 5, points: [[0, 0], [1e9, 1e9], [5, 5]], pressures: [0.1, 0.2, 0.3] },
      { ...lineInit(), points: [[0, 0], [1e9, 0]] },
      { ...drawInit(), w: 5, h: 5, points: [[0, 0], [5, 5]], pressures: [0.1, 0.2, 0.3, 0.4, 0.5] },
    ])) as { elements: FreedrawElement[] }
    // the 2-point line loses a point outside its box: too few left, dropped
    expect(r.elements).toHaveLength(3)
    expect(r.elements[0]!.points).toHaveLength(20_000)
    expect(r.elements[0]!.pressures).toHaveLength(20_000)
    expect(r.elements[1]!.points).toEqual([[0, 0], [5, 5]])
    // aligned pressures follow the kept points
    expect(r.elements[1]!.pressures).toEqual([0.1, 0.3])
    // never more pressures than points
    expect(r.elements[2]!.pressures).toEqual([0.1, 0.2])
  })

  it('foreign or plain text over 2MB ignored; up to 2MB trimmed to 10 000', () => {
    expect(parseClipboard('a'.repeat(2_000_001))).toBeNull()
    expect(parseClipboard(JSON.stringify({ type: 'other', pad: 'x'.repeat(2_000_001) }))).toBeNull()
    expect(parseClipboard('a'.repeat(2_000_000))).toEqual({ text: 'a'.repeat(10_000) })
  })

  it('an image src over 6 000 000 chars is dropped (it would not render)', () => {
    const head = 'data:image/png;base64,'
    const ok = parseClipboard(payload([imageInit(head + 'A'.repeat(6_000_000 - head.length))])) as { elements: ElementInit[] }
    expect(ok.elements).toHaveLength(1)
    const over = parseClipboard(payload([imageInit(head + 'A'.repeat(6_000_001 - head.length))])) as { elements: ElementInit[] }
    expect(over.elements).toHaveLength(0)
  })

  it('over 5000 elements ignored', () => {
    const one = rectInit()
    expect(parseClipboard(payload(Array.from({ length: 5001 }, () => one)))).toBeNull()
    const ok = parseClipboard(payload(Array.from({ length: 5000 }, () => one))) as { elements: ElementInit[] }
    expect(ok.elements).toHaveLength(5000)
  })

  it('unknown element type dropped', () => {
    const r = parseClipboard(payload([{ ...rectInit(), type: 'image' }, rectInit({ x: 7 })])) as { elements: ElementInit[] }
    expect(r.elements).toHaveLength(1)
    expect(r.elements[0]).toMatchObject({ type: 'rectangle', x: 7 })
  })
})

describe('ToolController paste / duplicate', () => {
  it('paste offsets and selects, one undo step', () => {
    const { c, store, history } = setup()
    const src = store.createMany([rectInit({ x: 10, y: 20 }), lineInit()])
    history.stopCapturing()
    const parsed = parseClipboard(serializeClipboard(src)) as { elements: ElementInit[] }
    c.pasteElements(parsed.elements, null)
    const all = store.all()
    expect(all).toHaveLength(4)
    const pasted = all.slice(2)
    expect(pasted.map(e => e.id).some(id => src.some(s => s.id === id))).toBe(false)
    // relative layout and z-order kept, +16 offset
    expect(pasted[0]).toMatchObject({ type: 'rectangle', x: 26, y: 36 })
    expect(pasted[1]).toMatchObject({ type: 'line', x: 216, y: 116, points: [[0, 0], [40, 30]] })
    expect([...c.selectedIds.value].sort()).toEqual(pasted.map(e => e.id).sort())
    history.undo()
    expect(store.all()).toHaveLength(2)
  })

  it('paste at pointer', () => {
    const { c, store } = setup()
    const src = store.createMany([rectInit({ x: 10, y: 20 }), lineInit()])
    const parsed = parseClipboard(serializeClipboard(src)) as { elements: ElementInit[] }
    c.pasteElements(parsed.elements, { x: 500, y: 400 })
    const pasted = store.all().slice(2)
    // the group's top-left (10, 20) lands at the pointer
    expect(pasted[0]).toMatchObject({ x: 500, y: 400 })
    expect(pasted[1]).toMatchObject({ x: 690, y: 480 })
  })

  it('paste text creates an auto-sized text element (one undo step)', () => {
    const { c, store, history } = setup()
    c.pasteText('hello', { x: 30, y: 40 })
    const [el, ...rest] = store.all() as TextElement[]
    expect(rest).toHaveLength(0)
    expect(el).toMatchObject({ type: 'text', text: 'hello', autoSize: true, x: 30, y: 40, w: 50, h: 25 })
    expect(c.selectedIds.value).toEqual(new Set([el!.id]))
    history.undo()
    expect(store.all()).toHaveLength(0)
  })

  it('paste text strips XML-invalid control characters', () => {
    const { c, store } = setup()
    c.pasteText('he\u0007llo\u000b', { x: 0, y: 0 })
    expect((store.all()[0] as TextElement).text).toBe('hello')
    // nothing but control characters: no element
    c.pasteText('\u0007\u0001', { x: 0, y: 0 })
    expect(store.all()).toHaveLength(1)
  })

  it('paste is a no-op when read-only', () => {
    const { c, store } = setup(true)
    c.pasteElements([rectInit()], null)
    c.pasteText('x', null)
    expect(store.all()).toHaveLength(0)
  })

  it('duplicate mod+d', () => {
    const { c, store, history } = setup()
    const [a] = store.createMany([rectInit({ x: 1, y: 2 }), rectInit({ x: 300 })])
    history.stopCapturing()
    c.setSelection([a!.id])
    expect(c.keyDown({ key: 'd', mod: true, shift: false })).toBe(true)
    const all = store.all()
    expect(all).toHaveLength(3)
    const dup = all[2]!
    expect(dup.id).not.toBe(a!.id)
    expect(dup).toMatchObject({ x: 17, y: 18, w: 100, h: 50 })
    expect(c.selectedIds.value).toEqual(new Set([dup.id]))
    // tool key `d` (diamond) does not fire with mod
    expect(c.tool.value).toBe('select')
    history.undo()
    expect(store.all()).toHaveLength(2)
  })
})

// ---------- board ----------

const wrappers: VueWrapper[] = []

/** Clipboard event with a DataTransfer-like stub (happy-dom's ClipboardEvent support is partial). */
function clip(type: 'copy' | 'cut' | 'paste', text = '') {
  const data = new Map<string, string>([['text/plain', text]])
  const clipboardData = {
    setData: vi.fn((t: string, v: string) => void data.set(t, v)),
    getData: vi.fn((t: string) => data.get(t) ?? ''),
  }
  const e = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(e, 'clipboardData', { value: clipboardData })
  return { e, clipboardData, data }
}

async function setupBoard(props: Record<string, unknown> = {}, seed?: (store: BoardStore) => void) {
  const provider = memory()
  if (seed) seed(new BoardStore((await provider.connect('b')).doc))
  const connection = await provider.connect('b')
  const wrapper = mount(SketchBoard, { props: { connection, ...props }, attachTo: document.body })
  wrappers.push(wrapper)
  await nextTick()
  const root = wrapper.find('.me-sketch-board')
  // clipboard events act only while focus is inside the board
  ;(root.element as HTMLElement).focus()
  const canvases = wrapper.findAll('canvas')
  const top = canvases[canvases.length - 1]!.element as HTMLCanvasElement
  const store = new BoardStore(connection.doc)
  const pointer = (type: string, x: number, y: number) =>
    top.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, button: 0, pointerId: 1, pointerType: 'mouse', bubbles: true }))
  const selectAll = () => root.trigger('keydown', { key: 'a', ctrlKey: true })
  return { wrapper, root, top, store, pointer, selectAll }
}

describe('SketchBoard clipboard', () => {
  beforeEach(() => {
    stubCanvas()
    stubFrames()
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600)
  })
  afterEach(() => {
    for (const w of wrappers.splice(0)) w.unmount()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('copy writes the selection; paste creates copies', async () => {
    const { root, store, selectAll } = await setupBoard({}, s => s.create(rectInit({ x: 10, y: 20 })))
    await selectAll()
    const { e, clipboardData, data } = clip('copy')
    root.element.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
    expect(clipboardData.setData).toHaveBeenCalledWith('text/plain', expect.any(String))
    const paste = clip('paste', data.get('text/plain'))
    root.element.dispatchEvent(paste.e)
    expect(paste.e.defaultPrevented).toBe(true)
    const all = store.all()
    expect(all).toHaveLength(2)
    // pointer never entered: +16 offset
    expect(all[1]).toMatchObject({ x: 26, y: 36 })
  })

  it('paste at the last pointer position', async () => {
    // empty board: zoom 1, scene origin at the canvas center (400, 300)
    const { root, store, pointer } = await setupBoard()
    pointer('pointermove', 450, 330)
    root.element.dispatchEvent(clip('paste', payload([rectInit({ x: 999, y: 999 })])).e)
    expect(store.all()[0]).toMatchObject({ x: 50, y: 30 })
  })

  it('plain text pastes as a text element', async () => {
    const { root, store } = await setupBoard()
    root.element.dispatchEvent(clip('paste', 'hello').e)
    expect(store.all()[0]).toMatchObject({ type: 'text', text: 'hello' })
  })

  it('a 5 MB data-URL image round-trips copy / paste', async () => {
    const src = `data:image/png;base64,${'A'.repeat(5_000_000)}`
    const { root, store, selectAll } = await setupBoard({}, s => s.create(imageInit(src)))
    await selectAll()
    const copy = clip('copy')
    root.element.dispatchEvent(copy.e)
    expect(copy.e.defaultPrevented).toBe(true)
    const paste = clip('paste', copy.data.get('text/plain'))
    root.element.dispatchEvent(paste.e)
    const all = store.all()
    expect(all).toHaveLength(2)
    expect(all[1]).toMatchObject({ type: 'image', src })
  })

  it('a 30 MB payload is rejected with the inline message (paste and copy)', async () => {
    const big = `data:image/png;base64,${'A'.repeat(5_900_000)}`
    const { root, store, wrapper, selectAll } = await setupBoard({ locale: 'en' }, s => {
      for (let i = 0; i < 5; i++) s.create(imageInit(big, i * 500))
    })
    // paste: a 30 MB own payload
    const paste = clip('paste', payload([{ ...imageInit(big), pad: 'x'.repeat(30_000_000) }]))
    root.element.dispatchEvent(paste.e)
    expect(paste.e.defaultPrevented).toBe(true)
    expect(store.all()).toHaveLength(5)
    await nextTick()
    expect(wrapper.find('.me-sketch-toast').text()).toBe('Too large to copy or paste (max 24 MB).')
    // copy: 5 × 5.9 MB images serialize past the limit — nothing is written, the message shows
    await selectAll()
    const copy = clip('copy')
    root.element.dispatchEvent(copy.e)
    expect(copy.clipboardData.setData).not.toHaveBeenCalled()
    expect(wrapper.find('.me-sketch-toast').exists()).toBe(true)
  })

  it('cut removes', async () => {
    const { root, store, selectAll } = await setupBoard({}, s => s.create(rectInit()))
    await selectAll()
    const { e, data } = clip('cut')
    root.element.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
    expect(store.all()).toHaveLength(0)
    expect(parseClipboard(data.get('text/plain')!)).toMatchObject({ elements: [{ type: 'rectangle' }] })
  })

  it('read-only: copy works, cut and paste do nothing', async () => {
    const { root, store, selectAll } = await setupBoard({ readonly: true }, s => s.create(rectInit()))
    await selectAll()
    const copy = clip('copy')
    root.element.dispatchEvent(copy.e)
    expect(copy.clipboardData.setData).toHaveBeenCalled()
    const cut = clip('cut')
    root.element.dispatchEvent(cut.e)
    expect(cut.e.defaultPrevented).toBe(false)
    expect(store.all()).toHaveLength(1)
    root.element.dispatchEvent(clip('paste', 'hello').e)
    expect(store.all()).toHaveLength(1)
  })

  it('clipboard events dispatched on document reach the focused board', async () => {
    const { root, store } = await setupBoard()
    expect(document.activeElement).toBe(root.element)
    const paste = clip('paste', 'hello')
    document.dispatchEvent(paste.e)
    expect(paste.e.defaultPrevented).toBe(true)
    expect(store.all()[0]).toMatchObject({ type: 'text', text: 'hello' })
    // focus elsewhere: the board ignores document clipboard events
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()
    const other = clip('paste', 'nope')
    document.dispatchEvent(other.e)
    expect(other.e.defaultPrevented).toBe(false)
    expect(store.all()).toHaveLength(1)
    outside.remove()
  })

  it('unmount removes the document clipboard listeners', async () => {
    const { wrapper, store } = await setupBoard()
    const remove = vi.spyOn(document, 'removeEventListener')
    wrapper.unmount()
    wrappers.splice(wrappers.indexOf(wrapper), 1)
    expect(remove.mock.calls.map(c => c[0])).toEqual(expect.arrayContaining(['copy', 'cut', 'paste']))
    const paste = clip('paste', 'hello')
    document.dispatchEvent(paste.e)
    expect(paste.e.defaultPrevented).toBe(false)
    expect(store.all()).toHaveLength(0)
  })

  it('copy ignored when textarea focused', async () => {
    const { wrapper, top, store, selectAll, pointer } = await setupBoard({}, s => s.create(rectInit()))
    // an input inside the board (style panel color) with a selection: native copy
    await selectAll()
    await nextTick()
    const input = wrapper.find('input')
    expect(input.exists()).toBe(true)
    const viaInput = clip('copy')
    input.element.dispatchEvent(viaInput.e)
    expect(viaInput.e.defaultPrevented).toBe(false)
    expect(viaInput.clipboardData.setData).not.toHaveBeenCalled()
    // the text editor textarea: copy and paste stay native
    pointer('pointerdown', 700, 550)
    pointer('pointerup', 700, 550)
    pointer('pointerdown', 700, 550)
    pointer('pointerup', 700, 550)
    top.dispatchEvent(new MouseEvent('dblclick', { clientX: 700, clientY: 550, button: 0, bubbles: true }))
    await nextTick()
    const ta = wrapper.find('textarea.me-sketch-text-editor')
    expect(ta.exists()).toBe(true)
    const viaTa = clip('copy')
    ta.element.dispatchEvent(viaTa.e)
    expect(viaTa.e.defaultPrevented).toBe(false)
    expect(viaTa.clipboardData.setData).not.toHaveBeenCalled()
    const pasteTa = clip('paste', 'hello')
    ta.element.dispatchEvent(pasteTa.e)
    expect(pasteTa.e.defaultPrevented).toBe(false)
    expect(store.all().filter(e => e.type === 'text' && (e as TextElement).text === 'hello')).toHaveLength(0)
  })
})
