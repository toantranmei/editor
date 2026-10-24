import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import * as Y from 'yjs'

import { SketchBoard } from '../src/engine'
import { messages } from '../src/messages'
import { BoardStore } from '../src/model/store'
import { DEFAULT_STYLE } from '../src/model/types'
import { memory } from '../src/providers/memory'
import type { BoardConnection } from '../src/providers/types'
import { BitmapCache } from '../src/render/bitmap-cache'
import { ctxOf, stubCanvas, stubFrames } from './helpers/canvas'

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
function wheel(init: { deltaX?: number; deltaY?: number; ctrlKey?: boolean; clientX?: number; clientY?: number }) {
  const e = new WheelEvent('wheel', { deltaX: init.deltaX ?? 0, deltaY: init.deltaY ?? 0, cancelable: true, bubbles: true })
  for (const k of ['ctrlKey', 'clientX', 'clientY'] as const) {
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
  it('mounts with a memory connection and renders toolbar with 6 buttons', async () => {
    const { wrapper } = await setup()
    expect(wrapper.findAll('canvas')).toHaveLength(2)
    expect(wrapper.find('.me-sketch-board').attributes('tabindex')).toBe('0')
    const buttons = wrapper.findAll('.me-sketch-toolbar button')
    expect(buttons).toHaveLength(6)
    expect(buttons.map(b => b.attributes('title'))).toEqual([
      messages.vi.tools.hand, messages.vi.tools.select, messages.vi.tools.rectangle,
      messages.vi.tools.diamond, messages.vi.tools.ellipse, messages.vi.tools.lock,
    ])
    // select is the default tool
    expect(buttons[1]!.classes()).toContain('is-active')
    expect(wrapper.find('.me-sketch-zoom-pct').text()).toBe('100%')
  })

  it('pressing r then dragging creates an element and emits change', async () => {
    const { wrapper, key, drag, store } = await setup()
    await key('r')
    expect(wrapper.findAll('.me-sketch-toolbar button')[2]!.classes()).toContain('is-active')
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

    await wrapper.findAll('.me-sketch-toolbar button')[1]!.trigger('click')
    const input = document.createElement('input')
    root.element.appendChild(input)
    const ev2 = new KeyboardEvent('keydown', { key: 'r', bubbles: true, cancelable: true })
    input.dispatchEvent(ev2)
    expect(ev2.defaultPrevented).toBe(false)
    await nextTick()
    expect(wrapper.findAll('.me-sketch-toolbar button')[1]!.classes()).toContain('is-active')
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
    const btn = (i: number) => wrapper.findAll('.me-sketch-toolbar button')[i]!
    await btn(4).trigger('click')
    expect(btn(4).classes()).toContain('is-active')
    expect(btn(5).attributes('aria-pressed')).toBe('false')
    await btn(5).trigger('click')
    expect(btn(5).attributes('aria-pressed')).toBe('true')
  })

  it('uses en messages when locale is en', async () => {
    const { wrapper } = await setup({ locale: 'en' })
    expect(wrapper.findAll('.me-sketch-toolbar button')[0]!.attributes('title')).toBe(messages.en.tools.hand)
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
})
