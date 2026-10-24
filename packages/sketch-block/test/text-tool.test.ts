import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import * as Y from 'yjs'

import { SketchBoard } from '../src/engine'
import { History } from '../src/model/history'
import { Scene } from '../src/model/scene'
import { BoardStore } from '../src/model/store'
import { DEFAULT_STYLE, type ShapeElement, type SketchElement, type TextElement } from '../src/model/types'
import { memory } from '../src/providers/memory'
import { setMeasurer } from '../src/text/measure'
import { type PointerInput, ToolController } from '../src/tools/controller'
import TextEditor from '../src/ui/TextEditor.vue'
import { Viewport } from '../src/viewport'
import { ctxOf, stubCanvas, stubFrames } from './helpers/canvas'

/** Stub measurer: 10 px per character at any font. */
const CHAR = 10

let frames: ReturnType<typeof stubFrames>
const wrappers: VueWrapper[] = []

beforeEach(() => {
  stubCanvas()
  frames = stubFrames()
  setMeasurer(text => text.length * CHAR)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600)
})
afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount()
  setMeasurer(null)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const rect = (over: Partial<ShapeElement> = {}) => ({
  type: 'rectangle' as const, x: 0, y: 0, w: 100, h: 50, angle: 0, locked: false, ...DEFAULT_STYLE, label: '', ...over,
})
const textInit = (over: Partial<TextElement> = {}) => ({
  type: 'text' as const, x: 0, y: 0, w: 30, h: 25, angle: 0, locked: false, ...DEFAULT_STYLE,
  text: 'abc', autoSize: true, ...over,
})

// ---------- board helpers ----------

async function setupBoard(seed?: (store: BoardStore) => void) {
  const provider = memory()
  if (seed) seed(new BoardStore((await provider.connect('b')).doc))
  const connection = await provider.connect('b')
  const wrapper = mount(SketchBoard, { props: { connection }, attachTo: document.body })
  wrappers.push(wrapper)
  await nextTick()
  const root = wrapper.find('.me-sketch-board')
  const canvases = wrapper.findAll('canvas')
  const top = canvases[canvases.length - 1]!.element as HTMLCanvasElement
  const store = new BoardStore(connection.doc)
  const pointer = (type: string, x: number, y: number) =>
    top.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, button: 0, pointerId: 1, pointerType: 'mouse', bubbles: true }))
  const click = async (x: number, y: number) => {
    pointer('pointerdown', x, y)
    pointer('pointerup', x, y)
    await nextTick()
  }
  const dblclick = async (x: number, y: number) => {
    pointer('pointerdown', x, y)
    pointer('pointerup', x, y)
    pointer('pointerdown', x, y)
    pointer('pointerup', x, y)
    top.dispatchEvent(new MouseEvent('dblclick', { clientX: x, clientY: y, button: 0, bubbles: true }))
    await nextTick()
  }
  const editor = () => wrapper.find('textarea.me-sketch-text-editor')
  const type = async (value: string) => {
    const ta = editor().element as HTMLTextAreaElement
    ta.value = value
    ta.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
  }
  const key = (k: string) => root.trigger('keydown', { key: k })
  return { wrapper, root, top, store, click, dblclick, editor, type, key, connection }
}

// ---------- controller helpers ----------

function setupController() {
  const doc = new Y.Doc()
  const store = new BoardStore(doc)
  const scene = new Scene(store)
  const history = new History(store)
  const viewport = new Viewport()
  const c = new ToolController({
    store, scene, history, viewport,
    readonly: () => false,
    invalidate: vi.fn(),
  })
  return { store, scene, history, viewport, c }
}

const ptr = (x: number, y: number): PointerInput => ({
  screen: { x, y }, button: 0, shift: false, alt: false, mod: false, pressure: 0.5,
})
function clickAt(c: ToolController, x: number, y: number) {
  c.pointerDown(ptr(x, y))
  c.pointerUp(ptr(x, y))
}

describe('text tool (board)', () => {
  it('text tool click creates and focuses editor', async () => {
    const { store, click, editor, key } = await setupBoard()
    await key('t')
    await click(200, 150)
    const els = store.all()
    expect(els).toHaveLength(1)
    expect(els[0]!.type).toBe('text')
    expect((els[0] as TextElement).text).toBe('')
    expect(editor().exists()).toBe(true)
    expect(document.activeElement).toBe(editor().element)
  })

  it('commit sets text and autosize box', async () => {
    const { store, click, editor, type, key } = await setupBoard()
    await key('t')
    await click(200, 150)
    await type('Xin chào\nab')
    ;(editor().element as HTMLTextAreaElement).blur()
    await nextTick()
    const el = store.all()[0] as TextElement
    expect(el.text).toBe('Xin chào\nab')
    expect(el.w).toBe(8 * CHAR)
    expect(el.h).toBe(2 * DEFAULT_STYLE.fontSize * 1.25)
    expect(editor().exists()).toBe(false)
  })

  it('empty commit removes element', async () => {
    const { store, click, editor, key, wrapper } = await setupBoard()
    await key('t')
    await click(200, 150)
    expect(store.all()).toHaveLength(1)
    ;(editor().element as HTMLTextAreaElement).blur()
    await nextTick()
    expect(store.all()).toHaveLength(0)
    expect(editor().exists()).toBe(false)
    // nothing left to undo
    expect(wrapper.find('[data-action="undo"]').attributes('disabled')).toBeDefined()
  })

  it('Enter during composition does not commit', async () => {
    const { store, click, editor, type, key, wrapper } = await setupBoard()
    await key('t')
    await click(200, 150)
    const ta = editor()
    ta.element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    await type('vie')
    await ta.trigger('keydown', { key: 'Enter', ctrlKey: true, isComposing: true })
    await ta.trigger('keydown', { key: 'Escape', isComposing: true })
    // isComposing missing (some browsers) but between compositionstart…compositionend: still ignored
    await ta.trigger('keydown', { key: 'Escape' })
    expect(editor().exists()).toBe(true)
    expect((store.all()[0] as TextElement).text).toBe('')
    ta.element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'việt' }))
    await type('việt')
    await editor().trigger('keydown', { key: 'Escape' })
    expect(editor().exists()).toBe(false)
    expect((store.all()[0] as TextElement).text).toBe('việt')
    // keydowns never reached the board
    expect(wrapper.emitted('exit')).toBeUndefined()
  })

  it('Escape commits', async () => {
    const { store, click, editor, type, key, wrapper } = await setupBoard()
    await key('t')
    await click(200, 150)
    await type('hi')
    await editor().trigger('keydown', { key: 'Escape' })
    expect(editor().exists()).toBe(false)
    expect((store.all()[0] as TextElement).text).toBe('hi')
    expect(wrapper.emitted('exit')).toBeUndefined()
  })

  it('plain Enter keeps editing; Ctrl/Cmd+Enter commits', async () => {
    const { store, click, editor, type, key } = await setupBoard()
    await key('t')
    await click(200, 150)
    await type('a')
    await editor().trigger('keydown', { key: 'Enter' })
    expect(editor().exists()).toBe(true)
    await editor().trigger('keydown', { key: 'Enter', metaKey: true })
    expect(editor().exists()).toBe(false)
    expect((store.all()[0] as TextElement).text).toBe('a')
  })

  it('Delete and tool keys inside the editor do not reach the board', async () => {
    const { store, click, editor, key } = await setupBoard()
    await key('t')
    await click(200, 150)
    await editor().trigger('keydown', { key: 'Delete' })
    await editor().trigger('keydown', { key: 'r' })
    expect(store.all()).toHaveLength(1)
    expect(editor().exists()).toBe(true)
  })

  it('dblclick on shape edits label', async () => {
    const { store, dblclick, editor, type } = await setupBoard(s => { s.create(rect()) })
    // fit() centers the rectangle in the 800×600 board
    await dblclick(400, 300)
    expect(editor().exists()).toBe(true)
    await type('Nhãn')
    ;(editor().element as HTMLTextAreaElement).blur()
    await nextTick()
    const el = store.all()[0] as ShapeElement
    expect(el.label).toBe('Nhãn')
    expect(store.all()).toHaveLength(1)
  })

  it('dblclick on text edits it; on empty canvas creates text', async () => {
    const { store, dblclick, editor, type } = await setupBoard(s => { s.create(textInit()) })
    await dblclick(400, 300)
    expect((editor().element as HTMLTextAreaElement).value).toBe('abc')
    await type('abcd')
    ;(editor().element as HTMLTextAreaElement).blur()
    await nextTick()
    expect((store.all()[0] as TextElement).text).toBe('abcd')
    expect(store.all()[0]!.w).toBe(4 * CHAR)
    await dblclick(20, 20)
    expect(store.all()).toHaveLength(2)
    expect(editor().exists()).toBe(true)
  })

  it('hides the edited element from the static layer', async () => {
    const { wrapper, dblclick } = await setupBoard(s => { s.create(textInit()) })
    frames.flush()
    const st = ctxOf(wrapper.findAll('canvas')[0]!.element as HTMLCanvasElement)
    expect(st.calls.some(c => c.name === 'drawImage')).toBe(true)
    await dblclick(400, 300)
    st.calls.length = 0
    frames.flush()
    expect(st.calls.some(c => c.name === 'clearRect')).toBe(true)
    expect(st.calls.some(c => c.name === 'drawImage')).toBe(false)
  })

  it('a dblclick that finishes a multi-point line does not create text', async () => {
    const { store, root, top } = await setupBoard()
    await root.trigger('keydown', { key: 'l' })
    const p = (type: string, x: number, y: number) =>
      top.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, button: 0, pointerId: 1, pointerType: 'mouse', bubbles: true }))
    p('pointerdown', 100, 100); p('pointerup', 100, 100)
    p('pointerdown', 200, 100); p('pointerup', 200, 100)
    // a double click on the last point: the second click finishes the line
    p('pointerdown', 200, 100); p('pointerup', 200, 100)
    top.dispatchEvent(new MouseEvent('dblclick', { clientX: 200, clientY: 100, bubbles: true }))
    await nextTick()
    expect(store.all().map(e => e.type)).toEqual(['line'])
    expect(document.querySelector('textarea.me-sketch-text-editor')).toBeNull()
  })
})

describe('text tool (controller)', () => {
  it('create+commit is one undo step', () => {
    const { store, history, c } = setupController()
    c.setTool('text')
    clickAt(c, 50, 60)
    expect(c.editing.value?.kind).toBe('text')
    expect(c.isGestureActive()).toBe(true)
    c.commitEditing('abc')
    expect(c.editing.value).toBeNull()
    expect(c.isGestureActive()).toBe(false)
    expect((store.all()[0] as TextElement).text).toBe('abc')
    history.undo()
    expect(store.all()).toHaveLength(0)
    expect(history.canUndo.value).toBe(false)
    history.redo()
    expect((store.all()[0] as TextElement).text).toBe('abc')
  })

  it('cancelEditing on a new text removes it with no undo step; on an existing one changes nothing', () => {
    const { store, history, c } = setupController()
    c.setTool('text')
    clickAt(c, 50, 60)
    c.cancelEditing()
    expect(store.all()).toHaveLength(0)
    expect(history.canUndo.value).toBe(false)

    const el = store.create(textInit({ x: 0, y: 0 }))
    history.stopCapturing()
    const depth = history.canUndo.value
    c.startEditing(el.id, 'text')
    c.cancelEditing()
    expect(store.get(el.id)).toMatchObject({ text: 'abc' })
    expect(history.canUndo.value).toBe(depth)
  })

  it('label commit updates the label as one undo step; editing blocks Delete', () => {
    const { store, history, c } = setupController()
    const el = store.create(rect())
    history.stopCapturing()
    c.setSelection([el.id])
    c.startEditing(el.id, 'label')
    expect(c.keyDown({ key: 'Delete', mod: false, shift: false })).toBe(false)
    expect(c.keyDown({ key: 'z', mod: true, shift: false })).toBe(false)
    expect(store.get(el.id)).toBeDefined()
    c.commitEditing('Hello')
    expect((store.get(el.id) as ShapeElement).label).toBe('Hello')
    history.undo()
    expect((store.get(el.id) as ShapeElement).label).toBe('')
  })

  it('text tool click on a shape edits its label; new text uses the current text style', () => {
    const { store, c } = setupController()
    const el = store.create(rect({ x: 0, y: 0, w: 100, h: 50 }))
    c.setTool('text')
    clickAt(c, 50, 25)
    expect(c.editing.value).toEqual({ id: el.id, kind: 'label' })
    c.commitEditing('x')
    clickAt(c, 300, 300)
    // committing returns to select (tool not locked)
    expect(c.tool.value).toBe('select')
    c.setTool('text')
    clickAt(c, 300, 300)
    const t = store.all().find(e => e.type === 'text') as TextElement
    expect(t).toMatchObject({ fontFamily: 'hand', fontSize: 20, textAlign: 'center', text: '', autoSize: true })
    expect(t.w).toBeGreaterThanOrEqual(0)
    expect(t.h).toBe(25)
  })

  it('t and 8 select the text tool', () => {
    const { c } = setupController()
    c.keyDown({ key: 't', mod: false, shift: false })
    expect(c.tool.value).toBe('text')
    c.setTool('select')
    c.keyDown({ key: '8', mod: false, shift: false })
    expect(c.tool.value).toBe('text')
  })

  it('remote deletion of the edited element ends editing', () => {
    const { store, c } = setupController()
    const el = store.create(rect())
    c.startEditing(el.id, 'label')
    store.remove([el.id])
    expect(c.editing.value).toBeNull()
    expect(c.isGestureActive()).toBe(false)
  })
})

describe('TextEditor', () => {
  const view = { x: 0, y: 0, zoom: 2 }

  it('editor positioned at zoom 2 and rotated element', async () => {
    const element = { ...textInit({ x: 10, y: 20, w: 30, h: 25, angle: Math.PI / 4, text: 'abc' }), id: 't1', index: 'a0', seed: 1, version: 1 } as SketchElement
    const w = mount(TextEditor, { props: { element, kind: 'text', view, theme: 'light' }, attachTo: document.body })
    wrappers.push(w)
    await flushPromises()
    const s = (w.find('textarea').element as HTMLTextAreaElement).style
    expect(s.left).toBe('20px')
    expect(s.top).toBe('40px')
    expect(s.transform).toBe(`rotate(${Math.PI / 4}rad)`)
    // rotation about the element's center
    expect(s.transformOrigin).toBe('30px 25px')
    expect(s.fontSize).toBe('40px')
    expect(s.height).toBe('50px')
    expect(s.textAlign).toBe('center')
  })

  it('label editor is centered in the shape box; dark theme maps the default stroke', async () => {
    const element = { ...rect({ x: 0, y: 0, w: 100, h: 50, label: 'ab' }), id: 's1', index: 'a0', seed: 1, version: 1 } as SketchElement
    const w = mount(TextEditor, { props: { element, kind: 'label', view, theme: 'dark' }, attachTo: document.body })
    wrappers.push(w)
    await flushPromises()
    const s = (w.find('textarea').element as HTMLTextAreaElement).style
    // padded box: x 8..92, one 25-unit line centered in h 50 → y 12.5
    expect(s.left).toBe('16px')
    expect(s.width).toBe('168px')
    expect(s.top).toBe('25px')
    expect(s.height).toBe('50px')
    expect(s.color).toBe('#e3e3e3')
  })
})
