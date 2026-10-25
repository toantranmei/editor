import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import * as Y from 'yjs'

import { installRepair, REPAIR_ORIGIN } from '../src/collab/repair'
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

// counts installs (passes through to the real observer)
vi.mock('../src/collab/repair', async orig => {
  const real = await orig<typeof import('../src/collab/repair')>()
  return { ...real, installRepair: vi.fn(real.installRepair) }
})

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

  it('toolbar shows M2 tools', async () => {
    const { wrapper } = await setup()
    const toolbar = wrapper.find('.me-sketch-toolbar')
    const buttons = toolbar.findAll('button')
    const order = [
      'lock', 'hand', 'select', 'lasso', 'rectangle', 'diamond', 'ellipse', 'shapes', 'arrow', 'line',
      'pen', 'highlighter', 'text', 'sticky', 'frame', 'image', 'eraser', 'laser', 'eyedropper',
    ] as const
    const title = (n: typeof order[number]) =>
      n === 'shapes' ? messages.vi.shapes : n === 'image' ? messages.vi.insertImage : messages.vi.tools[n]
    expect(buttons).toHaveLength(19)
    expect(buttons.map(b => b.attributes('data-tool'))).toEqual([...order])
    expect(buttons.map(b => b.attributes('title'))).toEqual(order.map(title))
    const badges = buttons.map(b => b.find('.me-sketch-badge').exists() ? b.find('.me-sketch-badge').text() : '')
    expect(badges).toEqual(['Q', 'H', 'V', '', 'R', 'D', 'O', '', 'A', 'L', 'P', 'M', 'T', 'S', 'F', '', 'E', 'K', 'I'])
    // every badge is the letter the tooltip names
    for (const [i, b] of buttons.entries()) {
      const key = /\(([A-Z])\)$/.exec(b.attributes('title')!)?.[1] ?? ''
      expect(badges[i]).toBe(key)
    }
    // groups: lock | hand select lasso | shapes & lines | pen highlighter text sticky frame image | eraser laser eyedropper
    const kids = [...toolbar.element.children].map(c => (c.classList.contains('me-toolbar-divider') ? '|' : c.getAttribute('data-tool')))
    expect(kids.join(' ')).toBe(
      'lock | hand select lasso | rectangle diamond ellipse shapes arrow line | pen highlighter text sticky frame image | eraser laser eyedropper',
    )
    // the image button opens the file picker
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    await wrapper.find('[data-tool="image"]').trigger('click')
    expect(click).toHaveBeenCalledTimes(1)
    // en strings exist for the new buttons
    expect(messages.en.shapes).toBeTruthy()
    expect(messages.en.insertImage).toBeTruthy()
  })

  it('shapes popover sets tool to chosen shape', async () => {
    const { SHAPE_TYPES } = await import('../src/model/types')
    const { wrapper, key, drag, store } = await setup({ locale: 'en' })
    const popover = () => wrapper.find('.me-sketch-shapes')
    const shapesBtn = () => wrapper.find('[data-tool="shapes"]')
    expect(popover().exists()).toBe(false)
    await shapesBtn().trigger('click')
    expect(popover().exists()).toBe(true)
    expect(popover().attributes('aria-label')).toBe(messages.en.shapes)
    const cells = popover().findAll('button[data-shape]')
    expect(cells.map(c => c.attributes('data-shape'))).toEqual([...SHAPE_TYPES])
    // each cell: a tiny outline preview and the shape's name
    for (const c of cells) {
      expect(c.find('svg path, svg polygon').exists()).toBe(true)
      expect(c.text()).toBe(messages.en.tools[c.attributes('data-shape') as typeof SHAPE_TYPES[number]].replace(/ \([A-Z]\)$/, ''))
    }
    await popover().find('[data-shape="star"]').trigger('click')
    expect(popover().exists()).toBe(false)
    // the shapes button stands for the chosen shape: active while it is the tool, its preview as the icon
    expect(shapesBtn().classes()).toContain('is-active')
    expect(shapesBtn().attributes('data-shape')).toBe('star')
    drag(100, 100, 200, 160)
    expect(store.all().map(e => e.type)).toEqual(['star'])
    // another tool: the button is no longer active but keeps the last shape
    await key('r')
    expect(shapesBtn().classes()).not.toContain('is-active')
    expect(shapesBtn().attributes('data-shape')).toBe('star')
    // Escape closes the popover without choosing (and without leaving the board)
    await shapesBtn().trigger('click')
    await popover().trigger('keydown', { key: 'Escape' })
    expect(popover().exists()).toBe(false)
    expect(wrapper.emitted('exit')).toBeUndefined()
    expect(wrapper.find('[data-tool="rectangle"]').classes()).toContain('is-active')
  })

  it('focus: a pick hands focus to the board, Escape back to the shapes button; focus leaving closes it', async () => {
    const { wrapper, root } = await setup()
    const popover = () => wrapper.find('.me-sketch-shapes')
    const shapesBtn = () => wrapper.find('[data-tool="shapes"]')
    // the shapes button is a menu button: expanded state, no pressed state
    expect(shapesBtn().attributes('aria-pressed')).toBeUndefined()
    expect(shapesBtn().attributes('aria-expanded')).toBe('false')
    await shapesBtn().trigger('click')
    expect(shapesBtn().attributes('aria-expanded')).toBe('true')
    await nextTick()
    expect(document.activeElement?.getAttribute('data-shape')).toBe('rectangle')
    await popover().find('[data-shape="hexagon"]').trigger('click')
    expect(document.activeElement).toBe(root.element)
    // Escape: focus returns to the shapes button
    await shapesBtn().trigger('click')
    await nextTick()
    await popover().trigger('keydown', { key: 'Escape' })
    expect(document.activeElement).toBe(shapesBtn().element)
    // focus moving out of the popover closes it; moving inside it does not
    await shapesBtn().trigger('click')
    await nextTick()
    const cells = popover().findAll('button[data-shape]')
    await cells[0]!.trigger('focusout', { relatedTarget: cells[1]!.element })
    expect(popover().exists()).toBe(true)
    await cells[0]!.trigger('focusout', { relatedTarget: root.element })
    expect(popover().exists()).toBe(false)
  })

  it('clicking the shapes button while the popover is open closes it (focusout to the button does not reopen it)', async () => {
    const { wrapper } = await setup()
    const popover = () => wrapper.find('.me-sketch-shapes')
    const shapesBtn = () => wrapper.find('[data-tool="shapes"]')
    await shapesBtn().trigger('click')
    await nextTick()
    expect(popover().exists()).toBe(true)
    // a real click: focus leaves the focused cell for the shapes button, then the click fires
    await popover().find('button[data-shape]').trigger('focusout', { relatedTarget: shapesBtn().element })
    expect(popover().exists()).toBe(true)
    await shapesBtn().trigger('click')
    expect(popover().exists()).toBe(false)
    expect(shapesBtn().attributes('aria-expanded')).toBe('false')
  })

  it('a gesture on the board blocks native drag-and-drop of a draggable ancestor (the block node view)', async () => {
    const { pointer, store } = await setup()
    const dragstart = () => {
      const e = new Event('dragstart', { bubbles: true, cancelable: true })
      document.body.dispatchEvent(e)
      return e.defaultPrevented
    }
    // no board gesture: other drags on the page are left alone
    expect(dragstart()).toBe(false)
    pointer('pointerdown', 100, 100)
    pointer('pointermove', 110, 110, { buttons: 1 })
    // the browser starts dragging the draggable node view wrapper: refused, the gesture goes on
    expect(dragstart()).toBe(true)
    pointer('pointerup', 110, 110)
    expect(dragstart()).toBe(false)
    expect(store.all()).toHaveLength(0)
  })

  it('a last shape with its own button shows the generic shapes icon', async () => {
    const { wrapper } = await setup()
    const shapesBtn = () => wrapper.find('[data-tool="shapes"]')
    await shapesBtn().trigger('click')
    await wrapper.find('.me-sketch-shapes [data-shape="diamond"]').trigger('click')
    expect(shapesBtn().find('.me-sketch-shape-icon').exists()).toBe(false)
    expect(shapesBtn().find('.lucide').exists()).toBe(true)
    await shapesBtn().trigger('click')
    await wrapper.find('.me-sketch-shapes [data-shape="cloud"]').trigger('click')
    expect(shapesBtn().find('.me-sketch-shape-icon').exists()).toBe(true)
  })

  it('read-only Escape treats readonly like view mode: the hand tool does not switch to select', async () => {
    const { wrapper, key } = await setup({ readonly: true })
    await key('h')
    expect(wrapper.find('[data-tool="hand"]').classes()).toContain('is-active')
    await key('Escape')
    expect(wrapper.emitted('exit')).toHaveLength(1)
  })

  it('zen, view mode, grid, snap and the last shape live in the session (survive remounts)', async () => {
    const connection = await connect()
    const session = createBoardSession(connection)
    const mountBoard = async () => {
      const w = mount(SketchBoard, { props: { connection, session }, attachTo: document.body })
      wrappers.push(w)
      await nextTick()
      return w
    }
    const first = await mountBoard()
    const k = (key: string, init: KeyboardEventInit = {}) => first.find('.me-sketch-board').trigger('keydown', { key, ...init })
    await first.find('[data-action="grid"]').trigger('click')
    await first.find('[data-action="snap"]').trigger('click')
    await first.find('[data-tool="shapes"]').trigger('click')
    await first.find('[data-shape="cloud"]').trigger('click')
    await k('®', { code: 'KeyR', altKey: true })
    await k('Ω', { code: 'KeyZ', altKey: true })
    expect(session.zen.value).toBe(true)
    expect(session.viewMode.value).toBe(true)
    first.unmount()
    wrappers.splice(wrappers.indexOf(first), 1)

    const second = await mountBoard()
    expect(second.find('.me-sketch-exit-zen').exists()).toBe(true)
    expect(second.find('.me-sketch-toolbar').exists()).toBe(false)
    await second.find('.me-sketch-exit-zen').trigger('click')
    // still in view mode: hand only
    expect(second.findAll('.me-sketch-toolbar button').map(b => b.attributes('data-tool'))).toEqual(['hand'])
    expect(second.find('[data-tool="hand"]').classes()).toContain('is-active')
    await second.find('.me-sketch-view-mode').trigger('click')
    expect(second.find('[data-tool="shapes"]').attributes('data-shape')).toBe('cloud')
    expect(second.find('[data-action="grid"]').attributes('aria-pressed')).toBe('true')
    expect(second.find('[data-action="snap"]').attributes('aria-pressed')).toBe('false')
    // without a session each board starts fresh
    const { wrapper: fresh } = await setup()
    expect(fresh.find('[data-action="grid"]').attributes('aria-pressed')).toBe('false')
    expect(fresh.find('[data-tool="shapes"]').attributes('data-shape')).toBeUndefined()
    session.destroy()
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

  it('mounts with unknown / malformed elements in the doc and ignores them', async () => {
    const { wrapper, store } = await setup({}, s => {
      s.create(init())
      const raw = (props: Record<string, unknown>) => {
        const m = new Y.Map<unknown>()
        for (const [k, v] of Object.entries(props)) m.set(k, v)
        return m
      }
      const elements = s.doc.getMap('elements') as Y.Map<Y.Map<unknown>>
      elements.set('holo', raw({ id: 'holo', type: 'hologram', x: 0, y: 0, w: 1, h: 1, angle: 0, index: 'b0' }))
      elements.set('bad', raw({ ...init(), type: 'freedraw', id: 'bad', index: 'b1', seed: 1, version: 1 }))
    })
    frames.flush()
    const vm = wrapper.vm as unknown as { getElements(): { type: string }[], fit(): void }
    expect(vm.getElements().map(e => e.type)).toEqual(['rectangle'])
    expect(store.all()).toHaveLength(1)
    expect(() => vm.fit()).not.toThrow()
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

  it('Escape during a multi-point line finishes the line and stays on the board', async () => {
    const { wrapper, key, pointer, store } = await setup()
    await key('l')
    // click, click: an open multi-point draft (no pointer held between clicks)
    pointer('pointerdown', 100, 100)
    pointer('pointerup', 100, 100)
    pointer('pointermove', 200, 150)
    pointer('pointerdown', 200, 150)
    pointer('pointerup', 200, 150)
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    wrapper.find('.me-sketch-board').element.dispatchEvent(ev)
    await nextTick()
    expect(ev.defaultPrevented).toBe(true)
    expect(wrapper.emitted('exit')).toBeUndefined()
    const els = store.all()
    expect(els).toHaveLength(1)
    expect(els[0]!.type).toBe('line')
  })

  it('Escape with a non-select tool switches to select instead of exiting', async () => {
    const { wrapper, key } = await setup()
    await key('r')
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    wrapper.find('.me-sketch-board').element.dispatchEvent(ev)
    await nextTick()
    expect(ev.defaultPrevented).toBe(true)
    expect(wrapper.find('[data-tool="select"]').classes()).toContain('is-active')
    expect(wrapper.emitted('exit')).toBeUndefined()
    // select tool, empty selection: now Escape exits
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

  it('grid and snap toggles: buttons and shortcuts (grid off, snap on by default)', async () => {
    const { wrapper, key } = await setup()
    const grid = () => wrapper.find('[data-action="grid"]')
    const snap = () => wrapper.find('[data-action="snap"]')
    expect(grid().attributes('aria-pressed')).toBe('false')
    expect(snap().attributes('aria-pressed')).toBe('true')
    expect(grid().attributes('title')).toContain(messages.vi.grid)
    await grid().trigger('click')
    expect(grid().attributes('aria-pressed')).toBe('true')
    await key('\'', { code: 'Quote', ctrlKey: true })
    expect(grid().attributes('aria-pressed')).toBe('false')
    await snap().trigger('click')
    expect(snap().attributes('aria-pressed')).toBe('false')
    await key('ß', { code: 'KeyS', altKey: true })
    expect(snap().attributes('aria-pressed')).toBe('true')
    expect(messages.en.grid).toBeTruthy()
    expect(messages.en.objectSnap).toBeTruthy()
  })

  it('emits change only for local edits and undo / redo, not for repair, copy or remote writes', async () => {
    const { COPY_ORIGIN } = await import('../src/block/clone')
    const { wrapper, store, connection } = await setup()
    const count = () => wrapper.emitted('change')?.length ?? 0
    const el = store.create(init())
    expect(count()).toBe(1)
    store.updateMany({ [el.id]: { x: 5 } }, REPAIR_ORIGIN)
    const other = new Y.Doc()
    Y.applyUpdate(other, Y.encodeStateAsUpdate(connection.doc))
    new BoardStore(other).update(el.id, { y: 40 })
    const diff = () => Y.encodeStateAsUpdate(other, Y.encodeStateVector(connection.doc))
    Y.applyUpdate(connection.doc, diff(), COPY_ORIGIN)
    new BoardStore(other).update(el.id, { y: 80 })
    Y.applyUpdate(connection.doc, diff(), 'remote')
    // a local transaction with another origin (e.g. a provider write) is not a board edit either
    connection.doc.transact(() => (connection.doc.getMap('elements').get(el.id) as Y.Map<unknown>).set('w', 120), 'provider')
    expect(count()).toBe(1)
    const mine = store.create(init({ x: 300 }))
    expect(count()).toBe(2)
    await nextTick() // the undo button is enabled
    await wrapper.find('[data-action="undo"]').trigger('click')
    expect(store.get(mine.id)).toBeUndefined()
    expect(count()).toBe(3)
    await nextTick()
    await wrapper.find('[data-action="redo"]').trigger('click')
    expect(store.get(mine.id)).toBeDefined()
    expect(count()).toBe(4)
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

  it('repairs derived data after remote edits while mounted (not when read-only, not after unmount)', async () => {
    const { wrapper, connection } = await setup()
    const store = new BoardStore(connection.doc)
    const f = store.create({ ...DEFAULT_STYLE, type: 'frame', name: 'F', x: 0, y: 0, w: 400, h: 300, angle: 0, locked: false } as never)
    const r = store.create(init({ x: 50, y: 50, frameId: f.id }))
    const remoteDelete = (id: string) => connection.doc.transact(() => connection.doc.getMap('elements').delete(id), 'remote')
    remoteDelete(f.id)
    await flushPromises()
    expect(store.get(r.id)!.frameId).toBeNull()
    // read-only: other peers repair
    const f2 = store.create({ ...DEFAULT_STYLE, type: 'frame', name: 'G', x: 0, y: 0, w: 400, h: 300, angle: 0, locked: false } as never)
    store.update(r.id, { frameId: f2.id })
    await wrapper.setProps({ readonly: true })
    remoteDelete(f2.id)
    await flushPromises()
    expect(store.get(r.id)!.frameId).toBe(f2.id)
    await wrapper.setProps({ readonly: false })
    // unmounted: uninstalled
    const f3 = store.create({ ...DEFAULT_STYLE, type: 'frame', name: 'H', x: 0, y: 0, w: 400, h: 300, angle: 0, locked: false } as never)
    store.update(r.id, { frameId: f3.id })
    wrapper.unmount()
    wrappers.splice(wrappers.indexOf(wrapper), 1)
    remoteDelete(f3.id)
    await flushPromises()
    expect(store.get(r.id)!.frameId).toBe(f3.id)
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

  it('one repair observer per session: inline + fullscreen mounts repair each remote update once', async () => {
    const connection = await connect()
    const installs = vi.mocked(installRepair)
    installs.mockClear()
    const session = createBoardSession(connection)
    const mountBoard = () => {
      const w = mount(SketchBoard, { props: { connection, session }, attachTo: document.body })
      wrappers.push(w)
      return w
    }
    const inline = mountBoard()
    const full = mountBoard()
    await nextTick()
    expect(installs).toHaveBeenCalledTimes(1)
    const store = session.store
    const f = store.create({ ...DEFAULT_STYLE, type: 'frame', name: 'F', x: 0, y: 0, w: 400, h: 300, angle: 0, locked: false } as never)
    const r = store.create(init({ x: 50, y: 50, frameId: f.id }))
    let passes = 0
    const onTr = (tr: { origin: unknown }) => { if (tr.origin === REPAIR_ORIGIN) passes++ }
    connection.doc.on('afterTransaction', onTr)
    connection.doc.transact(() => connection.doc.getMap('elements').delete(f.id), 'remote')
    await flushPromises()
    expect(store.get(r.id)!.frameId).toBeNull()
    expect(passes).toBe(1)
    // a read-only board closes the session's write gate
    await inline.setProps({ readonly: true })
    const g = store.create({ ...DEFAULT_STYLE, type: 'frame', name: 'G', x: 0, y: 0, w: 400, h: 300, angle: 0, locked: false } as never)
    store.update(r.id, { frameId: g.id })
    connection.doc.transact(() => connection.doc.getMap('elements').delete(g.id), 'remote')
    await flushPromises()
    expect(store.get(r.id)!.frameId).toBe(g.id)
    await inline.setProps({ readonly: false })
    // unmounting the boards keeps it; destroying the session uninstalls it
    inline.unmount()
    full.unmount()
    wrappers.splice(0)
    const h = store.create({ ...DEFAULT_STYLE, type: 'frame', name: 'H', x: 0, y: 0, w: 400, h: 300, angle: 0, locked: false } as never)
    store.update(r.id, { frameId: h.id })
    connection.doc.transact(() => connection.doc.getMap('elements').delete(h.id), 'remote')
    await flushPromises()
    expect(store.get(r.id)!.frameId).toBeNull()
    session.destroy()
    store.update(r.id, { frameId: 'gone' })
    connection.doc.transact(() => (connection.doc.getMap('elements') as Y.Map<Y.Map<unknown>>).get(r.id)!.set('x', 60), 'remote')
    await flushPromises()
    expect(store.get(r.id)!.frameId).toBe('gone')
    connection.doc.off('afterTransaction', onTr)
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

  it('pointercancel at bogus coordinates after a drag does not move the element there', async () => {
    const { wrapper, pointer, store } = await setup({}, s => s.create(init({ x: 0, y: 0, w: 100, h: 50, fill: '#ffffff', fillStyle: 'solid' })))
    const vm = wrapper.vm as unknown as { toScreen(p: { x: number; y: number }): { x: number; y: number } }
    const c = vm.toScreen({ x: 50, y: 25 })
    const before = store.all()[0]!
    pointer('pointerdown', c.x, c.y)
    pointer('pointermove', c.x + 40, c.y + 30, { buttons: 1 })
    frames.flush()
    expect(store.all()[0]!.x).toBeGreaterThan(before.x)
    pointer('pointercancel', 0, 0)
    frames.flush()
    // the move is reverted, never applied at (0, 0)
    const after = store.all()[0]!
    expect({ x: after.x, y: after.y }).toEqual({ x: before.x, y: before.y })
    // the gesture is over: a later press works
    pointer('pointerdown', c.x, c.y, { pointerId: 2 })
    pointer('pointermove', c.x + 10, c.y, { pointerId: 2, buttons: 1 })
    frames.flush()
    pointer('pointerup', c.x + 10, c.y, { pointerId: 2 })
    expect(store.all()[0]!.x).not.toBe(before.x)
  })

  it('pointercancel during a pen stroke commits it at the last known position', async () => {
    const { key, pointer, store } = await setup()
    await key('p')
    pointer('pointerdown', 300, 300)
    pointer('pointermove', 340, 320, { buttons: 1 })
    pointer('pointermove', 380, 340, { buttons: 1 })
    pointer('lostpointercapture', 0, 0)
    const [el] = store.all()
    expect(el!.type).toBe('freedraw')
    // the box spans the real stroke only (screen 300..380 at zoom 1), not the bogus (0, 0)
    expect(el!.w).toBeCloseTo(80)
    expect(el!.h).toBeCloseTo(40)
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
    expect(wrapper.findAll('.me-sketch-toolbar button')).toHaveLength(19)
    await key('r')
    drag(100, 100, 200, 160)
    expect(store.all()).toHaveLength(1)
  })
})
