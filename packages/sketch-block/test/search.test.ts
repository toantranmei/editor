import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import * as Y from 'yjs'

import { SketchBoard } from '../src/engine'
import { messages } from '../src/messages'
import { Scene } from '../src/model/scene'
import { BoardStore } from '../src/model/store'
import { DEFAULT_STYLE, type ElementInit, stickyInit } from '../src/model/types'
import { memory } from '../src/providers/memory'
import { renderInteractive } from '../src/render/interactive'
import { focusElement, normalizeSearch, searchElements } from '../src/tools/search'
import { Viewport } from '../src/viewport'
import { makeFakeCtx, stubCanvas, stubFrames } from './helpers/canvas'

vi.mock('../src/text/fonts', async orig => ({
  ...(await orig<typeof import('../src/text/fonts')>()),
  loadFonts: vi.fn(() => Promise.resolve()),
}))

const rect = (over: Record<string, unknown> = {}): ElementInit => ({
  type: 'rectangle', x: 0, y: 0, w: 100, h: 50, angle: 0, locked: false, ...DEFAULT_STYLE, label: '', ...over,
}) as ElementInit

describe('searchElements', () => {
  it('diacritics-insensitive match', () => {
    const store = new BoardStore(new Y.Doc())
    const a = store.create({ ...DEFAULT_STYLE, type: 'text', x: 0, y: 0, w: 10, h: 10, angle: 0, locked: false, text: 'Đường đi', autoSize: true })
    const b = store.create(rect({ label: 'Café sữa' }))
    const c = store.create(stickyInit(0, 0, { text: 'NHÀ HÀNG' }))
    const d = store.create({ ...DEFAULT_STYLE, type: 'frame', x: 0, y: 0, w: 10, h: 10, angle: 0, locked: false, name: 'Kế hoạch' })
    const e = store.create({
      ...DEFAULT_STYLE, type: 'arrow', x: 0, y: 0, w: 10, h: 10, angle: 0, locked: false, label: 'đường tắt',
      points: [[0, 0], [10, 10]], routing: 'straight', startArrowhead: 'none', endArrowhead: 'arrow',
    } as ElementInit)
    store.create(rect({ label: 'nothing' }))
    const scene = new Scene(store)
    expect(normalizeSearch('Đường ĐI')).toBe('duong di')
    expect(searchElements(scene.elements, 'duong')).toEqual([a.id, e.id])
    expect(searchElements(scene.elements, 'CAFE SUA')).toEqual([b.id])
    expect(searchElements(scene.elements, 'nha hang')).toEqual([c.id])
    expect(searchElements(scene.elements, 'kế HOACH')).toEqual([d.id])
    // empty / blank queries match nothing
    expect(searchElements(scene.elements, '')).toEqual([])
    expect(searchElements(scene.elements, '   ')).toEqual([])
  })

  it('focusElement centers the element, keeping the zoom unless it does not fit', () => {
    const vp = new Viewport()
    vp.zoom = 2
    focusElement(vp, { x: 1000, y: 500, w: 100, h: 50, angle: 0 }, 800, 600)
    expect(vp.zoom).toBe(2)
    expect(vp.toScreen({ x: 1050, y: 525 })).toEqual({ x: 400, y: 300 })
    // too big at zoom 2: fitted
    focusElement(vp, { x: 0, y: 0, w: 4000, h: 100, angle: 0 }, 800, 600)
    expect(vp.zoom).toBeLessThan(2)
    const c = vp.toScreen({ x: 2000, y: 50 })
    expect(c.x).toBeCloseTo(400)
    expect(c.y).toBeCloseTo(300)
  })

  it('draws a translucent highlight for each match', () => {
    const store = new BoardStore(new Y.Doc())
    const a = store.create(rect({ label: 'x' }))
    const b = store.create(rect({ x: 200, label: 'x' }))
    const scene = new Scene(store)
    const canvas = document.createElement('canvas')
    const state = { viewport: new Viewport(), widthCss: 800, heightCss: 600, dpr: 1, theme: 'light' as const, grid: false, cacheZoom: 1 }
    const base = {
      selectedIds: new Set<string>(), marquee: null, hoverId: null, draft: null, pointHandles: null, previewSegment: null,
      erasing: new Set<string>(), laser: [], lasso: null, bindTarget: null, guides: [],
    }
    const plain = makeFakeCtx(canvas)
    renderInteractive(plain, scene, state, base)
    const lit = makeFakeCtx(canvas)
    renderInteractive(lit, scene, state, { ...base, searchMatches: [a.id, b.id], activeMatch: b.id })
    const fills = (ctx: typeof plain) => ctx.calls.filter(c => c.name === 'fill').length
    expect(fills(lit) - fills(plain)).toBe(2)
    // translucent
    const alphas = lit.calls.filter(c => c.name === 'set:globalAlpha').map(c => c.args[0] as number)
    expect(alphas.some(a => a > 0 && a < 1)).toBe(true)
  })
})

// ---------- the board's search box ----------
const wrappers: VueWrapper[] = []
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

async function setup(seed: (store: BoardStore) => void, props: Record<string, unknown> = {}) {
  const provider = memory()
  const first = await provider.connect('b')
  seed(new BoardStore(first.doc))
  const connection = await provider.connect('b')
  const wrapper = mount(SketchBoard, { props: { connection, ...props }, attachTo: document.body })
  wrappers.push(wrapper)
  await nextTick()
  const root = wrapper.find('.me-sketch-board')
  const vm = wrapper.vm as unknown as {
    toScreen(p: { x: number; y: number }): { x: number; y: number }
  }
  const box = () => wrapper.find('.me-sketch-search')
  const input = () => wrapper.find<HTMLInputElement>('.me-sketch-search input')
  const open = async () => {
    await root.trigger('keydown', { key: 'f', code: 'KeyF', ctrlKey: true })
    await nextTick()
  }
  const type = async (q: string) => {
    await input().setValue(q)
    await nextTick()
  }
  return { wrapper, root, vm, box, input, open, type }
}

describe('SketchBoard search', () => {
  it('mod+F opens the box focused and prevents the browser find', async () => {
    const { root, box, input } = await setup(() => {})
    expect(box().exists()).toBe(false)
    const ev = new KeyboardEvent('keydown', { key: 'f', code: 'KeyF', ctrlKey: true, bubbles: true, cancelable: true })
    root.element.dispatchEvent(ev)
    await nextTick()
    expect(ev.defaultPrevented).toBe(true)
    expect(box().exists()).toBe(true)
    expect(document.activeElement).toBe(input().element)
    // letters typed in the box never reach the tools
    const before = root.find('[data-tool="select"]').classes()
    await input().trigger('keydown', { key: 'r' })
    expect(root.find('[data-tool="select"]').classes()).toEqual(before)
    expect(root.find('[data-tool="rectangle"]').classes()).not.toContain('is-active')
  })

  it('cycles and pans', async () => {
    const ids: string[] = []
    const { wrapper, vm, open, type, input } = await setup(store => {
      ids.push(store.create(rect({ x: 0, y: 0, label: 'Ứng dụng A' })).id)
      store.create(rect({ x: 1000, y: 0, label: 'other' }))
      ids.push(store.create(rect({ x: 3000, y: 2000, label: 'ung dung B' })).id)
    })
    const pct = () => wrapper.find('.me-sketch-zoom-pct').text()
    const zoomBefore = pct()
    await open()
    await type('ung dung')
    expect(wrapper.find('.me-sketch-search-status').text()).toBe('0/2')
    const centerOf = (x: number, y: number) => vm.toScreen({ x: x + 50, y: y + 25 })
    const selectedIds = () => wrapper.findComponent({ name: 'StylePanel' }).props('elements').map((e: { id: string }) => e.id)

    await input().trigger('keydown', { key: 'Enter' })
    expect(selectedIds()).toEqual([ids[0]])
    expect(centerOf(0, 0)).toEqual({ x: 400, y: 300 })
    expect(wrapper.find('.me-sketch-search-status').text()).toBe('1/2')

    await input().trigger('keydown', { key: 'Enter' })
    expect(selectedIds()).toEqual([ids[1]])
    expect(centerOf(3000, 2000)).toEqual({ x: 400, y: 300 })
    // the zoom stays when the match fits
    expect(pct()).toBe(zoomBefore)

    // wraps around
    await input().trigger('keydown', { key: 'Enter' })
    expect(selectedIds()).toEqual([ids[0]])
    // Shift+Enter steps back (wrapping)
    await input().trigger('keydown', { key: 'Enter', shiftKey: true })
    expect(selectedIds()).toEqual([ids[1]])
    expect(wrapper.find('.me-sketch-search-status').text()).toBe('2/2')
  })

  it('escape closes', async () => {
    const { wrapper, root, open, type, input, box } = await setup(store => {
      store.create(rect({ label: 'hello' }))
    })
    await open()
    await type('hello')
    await input().trigger('keydown', { key: 'Enter' })
    await input().trigger('keydown', { key: 'Escape' })
    await nextTick()
    expect(box().exists()).toBe(false)
    expect(document.activeElement).toBe(root.element)
    // closing does not leave the board nor drop the selection
    expect(wrapper.emitted('exit')).toBeUndefined()
    expect(wrapper.findComponent({ name: 'StylePanel' }).props('elements')).toHaveLength(1)
    // reopening keeps the last query selected
    await open()
    expect(input().element.value).toBe('hello')
  })

  it('no matches message', async () => {
    const { wrapper, open, type, input } = await setup(store => {
      store.create(rect({ label: 'hello' }))
    }, { locale: 'en' })
    await open()
    await type('zzz')
    expect(wrapper.find('.me-sketch-search-status').text()).toBe(messages.en.search.noMatches)
    // Enter with no matches does nothing
    await input().trigger('keydown', { key: 'Enter' })
    expect(wrapper.findComponent({ name: 'StylePanel' }).props('elements')).toHaveLength(0)
    // the box's strings exist in both locales
    for (const loc of ['vi', 'en'] as const) {
      for (const v of Object.values(messages[loc].search)) expect(v).toBeTruthy()
    }
    expect(input().attributes('aria-label')).toBe(messages.en.search.label)
  })
})
