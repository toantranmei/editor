import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import * as Y from 'yjs'

import { createBoardSession, SketchBoard } from '../src/engine'
import { messages } from '../src/messages'
import { BoardStore } from '../src/model/store'
import { DEFAULT_STYLE } from '../src/model/types'
import { memory } from '../src/providers/memory'
import type { BoardConnection } from '../src/providers/types'
import { BitmapCache } from '../src/render/bitmap-cache'
import { loadFonts } from '../src/text/fonts'
import { ctxOf, stubCanvas, stubFrames } from './helpers/canvas'

// the real loader warns (no FontFace in happy-dom) and caches one promise; tests control it instead
vi.mock('../src/text/fonts', async orig => ({
  ...(await orig<typeof import('../src/text/fonts')>()),
  loadFonts: vi.fn(() => Promise.resolve()),
}))

let frames: ReturnType<typeof stubFrames>
const wrappers: VueWrapper[] = []

beforeEach(() => {
  stubCanvas()
  frames = stubFrames()
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600)
})
afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const init = (over: Record<string, unknown> = {}) => ({
  type: 'rectangle' as const, x: 0, y: 0, w: 100, h: 50, angle: 0, locked: false, ...DEFAULT_STYLE, label: '', ...over,
})

/** happy-dom's WheelEvent ignores modifier/coordinate init fields, so define them on the instance. */
function wheel(init: { deltaX?: number; deltaY?: number; deltaMode?: number; ctrlKey?: boolean; clientX?: number; clientY?: number }) {
  const e = new WheelEvent('wheel', { deltaX: init.deltaX ?? 0, deltaY: init.deltaY ?? 0, cancelable: true, bubbles: true })
  for (const k of ['ctrlKey', 'clientX', 'clientY', 'deltaMode'] as const) {
    if (init[k] !== undefined) Object.defineProperty(e, k, { value: init[k] })
  }
  return e
}

async function connect(seed?: (store: BoardStore) => void): Promise<BoardConnection> {
  const provider = memory()
  if (seed) {
    const first = await provider.connect('b')
    seed(new BoardStore(first.doc))
  }
  return provider.connect('b')
}

async function setup(props: Record<string, unknown> = {}, seed?: (store: BoardStore) => void) {
  const connection = await connect(seed)
  const wrapper = mount(SketchBoard, { props: { connection, ...props }, attachTo: document.body })
  wrappers.push(wrapper)
  await nextTick()
  const root = wrapper.find('.me-sketch-board')
  const canvases = wrapper.findAll('canvas')
  const top = canvases[canvases.length - 1]!.element as HTMLCanvasElement
  const store = new BoardStore(connection.doc)
  const pointer = (type: string, x: number, y: number, init: PointerEventInit = {}) =>
    top.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, button: 0, pointerId: 1, pointerType: 'mouse', bubbles: true, ...init }))
  const key = (k: string, init: KeyboardEventInit = {}) => root.trigger('keydown', { key: k, ...init })
  const drag = (x1: number, y1: number, x2: number, y2: number) => {
    pointer('pointerdown', x1, y1)
    pointer('pointermove', x2, y2, { buttons: 1 })
    pointer('pointerup', x2, y2)
  }
  const pct = () => wrapper.find('.me-sketch-zoom-pct').text()
  return { wrapper, connection, root, top, store, pointer, key, drag, pct }
}

describe('SketchBoard', () => {
  it('mounts with a memory connection and renders the toolbar', async () => {
    const { wrapper } = await setup()
    expect(wrapper.findAll('canvas')).toHaveLength(2)
    expect(wrapper.find('.me-sketch-board').attributes('tabindex')).toBe('0')
    expect(wrapper.find('.me-sketch-toolbar').attributes('aria-label')).toBeTruthy()
    // select is the default tool
    expect(wrapper.find('[data-tool="select"]').classes()).toContain('is-active')
    expect(wrapper.find('.me-sketch-zoom-pct').text()).toBe('100%')
  })

  it('toolbar renders 15 tools in order with letter badges', async () => {
    const { wrapper } = await setup()
    const toolbar = wrapper.find('.me-sketch-toolbar')
    const buttons = toolbar.findAll('button')
    const order = [
      'lock', 'hand', 'select', 'lasso', 'rectangle', 'diamond', 'ellipse', 'arrow', 'line',
      'pen', 'highlighter', 'text', 'eraser', 'laser', 'eyedropper',
    ] as const
    expect(buttons).toHaveLength(15)
    expect(buttons.map(b => b.attributes('data-tool'))).toEqual([...order])
    expect(buttons.map(b => b.attributes('title'))).toEqual(order.map(n => messages.vi.tools[n]))
    const badges = buttons.map(b => b.find('.me-sketch-badge').exists() ? b.find('.me-sketch-badge').text() : '')
    expect(badges).toEqual(['Q', 'H', 'V', '', 'R', 'D', 'O', 'A', 'L', 'P', 'M', 'T', 'E', 'K', 'I'])
    // every badge is the letter the tooltip names
    for (const [i, b] of buttons.entries()) {
      const key = /\(([A-Z])\)$/.exec(b.attributes('title')!)?.[1] ?? ''
      expect(badges[i]).toBe(key)
    }
    // groups: lock | hand select lasso | shapes & lines | pen highlighter text | eraser laser eyedropper
    const kids = [...toolbar.element.children].map(c => (c.classList.contains('me-toolbar-divider') ? '|' : c.getAttribute('data-tool')))
    expect(kids.join(' ')).toBe(
      'lock | hand select lasso | rectangle diamond ellipse arrow line | pen highlighter text | eraser laser eyedropper',
    )
  })

  it('pressing r then dragging creates an element and emits change', async () => {
    const { wrapper, key, drag, store } = await setup()
    await key('r')
    expect(wrapper.find('[data-tool="rectangle"]').classes()).toContain('is-active')
    drag(100, 100, 200, 160)
    const els = store.all()
    expect(els).toHaveLength(1)
    expect(els[0]!.type).toBe('rectangle')
    expect(els[0]!.w).toBeCloseTo(100)
    expect(wrapper.emitted('change')!.length).toBeGreaterThan(0)
    expect((wrapper.vm as unknown as { getElements(): unknown[] }).getElements()).toHaveLength(1)
  })

  it('draws both layers on the next frame', async () => {
    const { wrapper } = await setup({}, s => s.create(init()))
    frames.flush()
    const [st, it] = wrapper.findAll('canvas').map(c => ctxOf(c.element as HTMLCanvasElement))
    expect(st!.calls.some(c => c.name === 'drawImage')).toBe(true)
    expect(it!.calls.some(c => c.name === 'clearRect')).toBe(true)
    // backing store = css size × dpr
    expect((wrapper.findAll('canvas')[0]!.element as HTMLCanvasElement).width).toBe(800 * (window.devicePixelRatio || 1))
  })

  it('Escape with no selection emits exit', async () => {
    const { wrapper, key } = await setup()
    await key('Escape')
    expect(wrapper.emitted('exit')).toHaveLength(1)
  })

  it('Escape with a selection clears it instead of exiting', async () => {
    const { wrapper, key, drag } = await setup()
    await key('r')
    drag(100, 100, 200, 160) // new element becomes selected
    await key('Escape')
    expect(wrapper.emitted('exit')).toBeUndefined()
    await key('Escape')
    expect(wrapper.emitted('exit')).toHaveLength(1)
  })

  it('handled keys are prevented; keys from inputs are ignored', async () => {
    const { root, wrapper } = await setup()
    const ev = new KeyboardEvent('keydown', { key: 'r', bubbles: true, cancelable: true })
    root.element.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)

    await wrapper.find('[data-tool="select"]').trigger('click')
    const input = document.createElement('input')
    root.element.appendChild(input)
    const ev2 = new KeyboardEvent('keydown', { key: 'r', bubbles: true, cancelable: true })
    input.dispatchEvent(ev2)
    expect(ev2.defaultPrevented).toBe(false)
    await nextTick()
    expect(wrapper.find('[data-tool="select"]').classes()).toContain('is-active')
  })

  it('readonly hides creation tools', async () => {
    const { wrapper, key, drag, store } = await setup({ readonly: true })
    const buttons = wrapper.findAll('.me-sketch-toolbar button')
    expect(buttons).toHaveLength(2)
    expect(buttons.map(b => b.attributes('title'))).toEqual([messages.vi.tools.hand, messages.vi.tools.select])
    await key('r')
    drag(100, 100, 200, 160)
    expect(store.all()).toHaveLength(0)
    expect(wrapper.find('[data-action="undo"]').exists()).toBe(false)
  })

  it('toolbar buttons switch tools and toggle the lock', async () => {
    const { wrapper } = await setup()
    const btn = (name: string) => wrapper.find(`[data-tool="${name}"]`)
    await btn('ellipse').trigger('click')
    expect(btn('ellipse').classes()).toContain('is-active')
    expect(btn('lock').attributes('aria-pressed')).toBe('false')
    await btn('lock').trigger('click')
    expect(btn('lock').attributes('aria-pressed')).toBe('true')
  })

  it('uses en messages when locale is en', async () => {
    const { wrapper } = await setup({ locale: 'en' })
    expect(wrapper.find('[data-tool="hand"]').attributes('title')).toBe(messages.en.tools.hand)
    expect(wrapper.find('[data-tool="lock"]').attributes('title')).toBe(messages.en.tools.lock)
  })

  it('ctrl+wheel zooms at the pointer, plain wheel pans; both prevent default', async () => {
    const { root, pct } = await setup()
    const zoomEv = wheel({ deltaY: -100, ctrlKey: true, clientX: 400, clientY: 300 })
    root.element.dispatchEvent(zoomEv)
    expect(zoomEv.defaultPrevented).toBe(true)
    await nextTick()
    expect(pct()).toBe(`${Math.round(Math.exp(1) * 100)}%`)

    const panEv = wheel({ deltaX: 10, deltaY: 20 })
    root.element.dispatchEvent(panEv)
    expect(panEv.defaultPrevented).toBe(true)
  })

  it('zoom controls step, reset and fit', async () => {
    const { wrapper, pct } = await setup({}, s => s.create(init()))
    // content present → fitted on mount. Bounds include the visual pad 6 (w 100 + 12, h 50 + 12):
    // min((800 - 80) / 112, (600 - 80) / 62) ≈ 6.43
    expect(pct()).toBe('643%')
    await wrapper.find('.me-sketch-zoom-pct').trigger('click')
    expect(pct()).toBe('100%')
    await wrapper.find('[data-action="zoom-in"]').trigger('click')
    expect(pct()).toBe('125%')
    await wrapper.find('[data-action="zoom-out"]').trigger('click')
    await wrapper.find('[data-action="zoom-out"]').trigger('click')
    expect(pct()).toBe('80%')
    await wrapper.find('[data-action="fit"]').trigger('click')
    expect(pct()).toBe('643%')
  })

  it('undo/redo buttons follow history and emit change', async () => {
    const { wrapper, key, drag, store } = await setup()
    const undo = () => wrapper.find('[data-action="undo"]')
    const redo = () => wrapper.find('[data-action="redo"]')
    expect(undo().attributes('disabled')).toBeDefined()
    await key('r')
    drag(100, 100, 200, 160)
    await nextTick()
    expect(undo().attributes('disabled')).toBeUndefined()
    const before = wrapper.emitted('change')!.length
    await undo().trigger('click')
    expect(store.all()).toHaveLength(0)
    expect(wrapper.emitted('change')!.length).toBe(before + 1)
    expect(redo().attributes('disabled')).toBeUndefined()
    await redo().trigger('click')
    expect(store.all()).toHaveLength(1)
  })

  it('remote updates do not emit change', async () => {
    const { wrapper, connection } = await setup()
    const remote = new Y.Doc()
    new BoardStore(remote).create(init())
    Y.applyUpdate(connection.doc, Y.encodeStateAsUpdate(remote))
    expect((wrapper.vm as unknown as { getElements(): unknown[] }).getElements()).toHaveLength(1)
    expect(wrapper.emitted('change')).toBeUndefined()
  })

  it('theme change clears the bitmap cache and redraws', async () => {
    const { wrapper } = await setup({}, s => s.create(init()))
    frames.flush()
    const clear = vi.spyOn(BitmapCache.prototype, 'clear')
    await wrapper.setProps({ theme: 'dark' })
    expect(clear).toHaveBeenCalled()
    expect(frames.pending).toBeGreaterThan(0)
  })

  it('unmount tears down listeners but keeps the connection alive', async () => {
    const { wrapper, store, connection } = await setup()
    const destroy = vi.spyOn(connection, 'destroy')
    wrapper.unmount()
    wrappers.splice(wrappers.indexOf(wrapper), 1)
    store.create(init())
    expect(wrapper.emitted('change')).toBeUndefined()
    expect(destroy).not.toHaveBeenCalled()
    expect(() => frames.flush()).not.toThrow()
    await flushPromises()
  })

  it('a pen move feeds every coalesced sample to the stroke in one pointerMove', async () => {
    const { key, pointer, top, store } = await setup()
    await key('p')
    pointer('pointerdown', 100, 100, { pointerType: 'pen', pressure: 0.3 })
    const move = new PointerEvent('pointermove', {
      clientX: 160, clientY: 100, pointerId: 1, pointerType: 'pen', pressure: 0.5, buttons: 1, bubbles: true,
    })
    const sample = (x: number, y: number, pressure: number) =>
      new PointerEvent('pointermove', { clientX: x, clientY: y, pointerId: 1, pointerType: 'pen', pressure })
    Object.defineProperty(move, 'getCoalescedEvents', {
      value: () => [sample(120, 110, 0.4), sample(140, 90, 0.6), sample(160, 100, 0.5)],
    })
    top.dispatchEvent(move)
    pointer('pointerup', 160, 100, { pointerType: 'pen', pressure: 0 })
    const [el] = store.all()
    expect(el!.type).toBe('freedraw')
    expect((el as { points: unknown[] }).points).toHaveLength(4)
    expect((el as { pressures: number[] }).pressures).toEqual([0.3, 0.4, 0.6, 0.5])
  })

  it('eraser: marked elements are skipped on static and drawn faded on interactive, then removed', async () => {
    const { wrapper, key, pointer, store } = await setup()
    // empty board: scene origin at the canvas center (400, 300)
    store.create(init({ fill: '#ffffff', fillStyle: 'solid' }))
    frames.flush()
    const [st, it] = wrapper.findAll('canvas').map(c => ctxOf(c.element as HTMLCanvasElement))
    expect(st!.calls.some(c => c.name === 'drawImage')).toBe(true)
    await key('e')
    pointer('pointerdown', 380, 325)
    pointer('pointermove', 520, 325, { buttons: 1 })
    st!.calls.length = 0
    it!.calls.length = 0
    frames.flush()
    // marking redraws the static layer without the marked element
    expect(st!.calls.some(c => c.name === 'clearRect')).toBe(true)
    expect(st!.calls.some(c => c.name === 'drawImage')).toBe(false)
    expect(it!.calls.some(c => c.name === 'set:globalAlpha' && c.args[0] === 0.3)).toBe(true)
    pointer('pointerup', 520, 325)
    expect(store.all()).toHaveLength(0)
  })

  it('laser keeps scheduling interactive frames until its trail fades', async () => {
    let t = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => t)
    const { key, pointer, store } = await setup()
    await key('k')
    pointer('pointerdown', 100, 100)
    pointer('pointermove', 150, 120, { buttons: 1 })
    pointer('pointerup', 150, 120)
    for (let i = 0; i < 3; i++) {
      frames.flush()
      expect(frames.pending).toBe(1)
      t += 100
    }
    t += 1000
    frames.flush()
    expect(frames.pending).toBe(0)
    expect(store.all()).toHaveLength(0)
  })
  it('board does not destroy a provided session', async () => {
    const connection = await connect()
    const session = createBoardSession(connection)
    const destroy = vi.spyOn(session.history, 'destroy')
    const wrapper = mount(SketchBoard, { props: { connection, session }, attachTo: document.body })
    await nextTick()
    const top = wrapper.findAll('canvas')[1]!.element as HTMLCanvasElement
    const pointer = (type: string, x: number, y: number) =>
      top.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, button: 0, pointerId: 1, pointerType: 'mouse', bubbles: true, buttons: 1 }))
    await wrapper.find('.me-sketch-board').trigger('keydown', { key: 'r' })
    pointer('pointerdown', 100, 100)
    pointer('pointermove', 200, 160)
    pointer('pointerup', 200, 160)
    // the board edits through the session's store and records in its history
    expect(session.store.all()).toHaveLength(1)
    expect(session.history.canUndo.value).toBe(true)
    wrapper.unmount()
    expect(destroy).not.toHaveBeenCalled()
    session.history.undo()
    expect(session.store.all()).toHaveLength(0)
    session.destroy()
    expect(destroy).toHaveBeenCalled()
  })

  it('without a session the board destroys its own history on unmount', async () => {
    const { History } = await import('../src/model/history')
    const destroy = vi.spyOn(History.prototype, 'destroy')
    const { wrapper } = await setup()
    wrapper.unmount()
    wrappers.splice(wrappers.indexOf(wrapper), 1)
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('lostpointercapture ends gesture (a later pointerdown works)', async () => {
    const { key, pointer, store } = await setup()
    await key('r')
    pointer('pointerdown', 100, 100)
    pointer('pointermove', 200, 160, { buttons: 1 })
    pointer('lostpointercapture', 200, 160)
    expect(store.all()).toHaveLength(1)
    await key('r')
    pointer('pointerdown', 300, 300, { pointerId: 2 })
    pointer('pointermove', 380, 360, { pointerId: 2, buttons: 1 })
    pointer('pointerup', 380, 360, { pointerId: 2 })
    expect(store.all()).toHaveLength(2)
  })

  it('contextmenu prevented', async () => {
    const { top } = await setup()
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    top.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
  })

  it('deltaMode 1 scales pan by 16', async () => {
    const drawAt = async (mode?: number) => {
      const { root, key, drag, store, wrapper } = await setup()
      if (mode !== undefined) root.element.dispatchEvent(wheel({ deltaY: 2, deltaMode: mode }))
      await key('r')
      drag(100, 100, 200, 160)
      const y = store.all()[0]!.y
      wrapper.unmount()
      wrappers.splice(wrappers.indexOf(wrapper), 1)
      return y
    }
    const base = await drawAt()
    expect(await drawAt(0)).toBeCloseTo(base + 2)
    expect(await drawAt(1)).toBeCloseTo(base + 32)
    // pages: the canvas css height (600)
    expect(await drawAt(2)).toBeCloseTo(base + 1200)
  })

  it('fonts loaded clears cache', async () => {
    let resolve!: () => void
    vi.mocked(loadFonts).mockImplementationOnce(() => new Promise<void>(r => (resolve = r)))
    const { wrapper } = await setup({}, s => s.create(init()))
    expect(loadFonts).toHaveBeenCalled()
    frames.flush()
    const clear = vi.spyOn(BitmapCache.prototype, 'clear')
    await flushPromises()
    expect(clear).not.toHaveBeenCalled()
    resolve()
    await flushPromises()
    expect(clear).toHaveBeenCalledTimes(1)
    expect(frames.pending).toBeGreaterThan(0)
    const [st, it] = wrapper.findAll('canvas').map(c => ctxOf(c.element as HTMLCanvasElement))
    st!.calls.length = 0
    it!.calls.length = 0
    frames.flush()
    expect(st!.calls.some(c => c.name === 'clearRect')).toBe(true)
    expect(it!.calls.some(c => c.name === 'clearRect')).toBe(true)
  })

  it('Alt+Z hides toolbar and Esc restores', async () => {
    const { wrapper, key, drag } = await setup()
    const shown = () => ({
      toolbar: wrapper.find('.me-sketch-toolbar').exists(),
      zoom: wrapper.find('.me-sketch-zoom').exists(),
      exit: wrapper.find('.me-sketch-exit-zen').exists(),
    })
    expect(shown()).toEqual({ toolbar: true, zoom: true, exit: false })
    // Alt composes `key` on macOS (Alt+Z → Ω): match the physical key
    await key('Ω', { code: 'KeyZ', altKey: true })
    expect(shown()).toEqual({ toolbar: false, zoom: false, exit: true })
    expect(wrapper.find('.me-sketch-exit-zen').text()).toBe(messages.vi.exitZen)
    // a selected element: Escape clears the selection first, staying in zen
    await key('r')
    drag(100, 100, 200, 160)
    await key('Escape')
    expect(shown().exit).toBe(true)
    // with nothing selected Escape leaves zen instead of exiting the board
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    wrapper.find('.me-sketch-board').element.dispatchEvent(ev)
    await nextTick()
    expect(ev.defaultPrevented).toBe(true)
    expect(shown()).toEqual({ toolbar: true, zoom: true, exit: false })
    expect(wrapper.emitted('exit')).toBeUndefined()
    // the button exits zen too
    await key('Ω', { code: 'KeyZ', altKey: true })
    await wrapper.find('.me-sketch-exit-zen').trigger('click')
    expect(shown().toolbar).toBe(true)
    // zen hides the style panel
    await key('Ω', { code: 'KeyZ', altKey: true })
    expect(wrapper.findComponent({ name: 'StylePanel' }).props('hidden')).toBe(true)
  })

  it('Alt+R blocks drawing', async () => {
    const { wrapper, key, drag, store } = await setup()
    await key('r')
    await key('®', { code: 'KeyR', altKey: true })
    // view mode: only hand on the toolbar, the hand tool active, no undo/redo, no style panel
    expect(wrapper.findAll('.me-sketch-toolbar button').map(b => b.attributes('data-tool'))).toEqual(['hand'])
    expect(wrapper.find('[data-tool="hand"]').classes()).toContain('is-active')
    expect(wrapper.find('[data-action="undo"]').exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'StylePanel' }).props('hidden')).toBe(true)
    await key('r')
    drag(100, 100, 200, 160)
    expect(store.all()).toHaveLength(0)
    // Alt+R again: drawing works again
    await key('®', { code: 'KeyR', altKey: true })
    expect(wrapper.findAll('.me-sketch-toolbar button')).toHaveLength(15)
    await key('r')
    drag(100, 100, 200, 160)
    expect(store.all()).toHaveLength(1)
  })
})
