import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { applyAwarenessUpdate, Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness'
import * as Y from 'yjs'

import {
  defaultUser, GUEST_COLORS, PresencePublisher, PresenceReader, PRESENCE_THROTTLE_MS, RemoteSelectionBoxes,
  sanitizePresence,
} from '../src/collab/presence'
import { SketchBoard } from '../src/engine'
import { BoardStore } from '../src/model/store'
import { Scene } from '../src/model/scene'
import { DEFAULT_STYLE } from '../src/model/types'
import { memory } from '../src/providers/memory'
import type { BoardConnection } from '../src/providers/types'
import { renderInteractive } from '../src/render/interactive'
import type { RenderState } from '../src/render/static'
import { Viewport } from '../src/viewport'
import { ctxOf, makeFakeCtx, stubCanvas, stubFrames } from './helpers/canvas'

vi.mock('../src/text/fonts', async orig => ({
  ...(await orig<typeof import('../src/text/fonts')>()),
  loadFonts: vi.fn(() => Promise.resolve()),
}))

const awarenesses: Awareness[] = []
const wrappers: VueWrapper[] = []

function newAwareness(doc = new Y.Doc()): Awareness {
  const a = new Awareness(doc)
  awarenesses.push(a)
  return a
}

/** Forwards every awareness update of `from` to `to` (one direction; call twice for both). */
function relay(from: Awareness, to: Awareness): void {
  from.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
    if (origin === 'relay') return
    const changed = [...added, ...updated, ...removed]
    applyAwarenessUpdate(to, encodeAwarenessUpdate(from, changed), 'relay')
  })
}

afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount()
  for (const a of awarenesses.splice(0)) a.destroy()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const init = (over: Record<string, unknown> = {}) => ({
  type: 'rectangle' as const, x: 0, y: 0, w: 100, h: 50, angle: 0, locked: false, ...DEFAULT_STYLE, label: '', ...over,
})

describe('presence model', () => {
  it('default guest name and color stable per clientID', () => {
    const a = defaultUser(12345, 'vi')
    expect(a).toEqual(defaultUser(12345, 'vi'))
    expect(a.name).toMatch(/^Khách \d+$/)
    const en = defaultUser(12345, 'en')
    expect(en.name).toMatch(/^Guest \d+$/)
    expect(en.color).toBe(a.color)
    expect(en.name.split(' ')[1]).toBe(a.name.split(' ')[1])
    expect(GUEST_COLORS).toEqual(['#e03131', '#2f9e44', '#1971c2', '#f08c00', '#9c36b5', '#0c8599'])
    const colors = new Set<string>()
    for (let id = 1; id < 200; id++) {
      const u = defaultUser(id * 7919, 'en')
      expect(GUEST_COLORS).toContain(u.color)
      colors.add(u.color)
    }
    // the hash spreads clients over the palette
    expect(colors.size).toBe(GUEST_COLORS.length)
  })

  it('sanitizes malicious presence', () => {
    expect(sanitizePresence(null)).toBeNull()
    expect(sanitizePresence('x')).toBeNull()
    expect(sanitizePresence({})).toBeNull()
    const huge = sanitizePresence({
      user: { name: `<img src=x onerror=alert(1)>${'a'.repeat(500)}`, color: 'red; background:url(x)' },
      cursor: { x: Infinity, y: 2 },
      selection: [...Array.from({ length: 5000 }, (_, i) => `id${i}`), 42, { a: 1 }],
      viewport: { x: Number.NaN, y: 0, zoom: 1 },
      laser: Array.from({ length: 1000 }, (_, i) => ({ x: i, y: 0, t: i })),
    }, 7)!
    expect(huge).not.toBeNull()
    expect(huge.user.name.length).toBeLessThanOrEqual(40)
    // invalid color: the guest color of the client
    expect(huge.user.color).toBe(defaultUser(7, 'en').color)
    expect(huge.cursor).toBeNull()
    expect(huge.selection).toHaveLength(2000)
    expect(huge.selection.every(s => typeof s === 'string')).toBe(true)
    expect(huge.viewport).toBeNull()
    expect(huge.laser).toHaveLength(200)
    // the newest points are kept
    expect(huge.laser[199]!.x).toBe(999)

    const ok = sanitizePresence({
      user: { name: '  Ann  ', color: '#AbCdEf' },
      cursor: { x: 1, y: 2 },
      selection: 'nope',
      viewport: { x: 10, y: 20, zoom: 1e9 },
      laser: [{ x: 1, y: 2, t: 3, start: true }, { x: 'a', y: 0, t: 0 }, { x: 4, y: 5, t: 6 }],
    })!
    expect(ok.user).toEqual({ name: 'Ann', color: '#abcdef' })
    expect(ok.cursor).toEqual({ x: 1, y: 2 })
    expect(ok.selection).toEqual([])
    expect(ok.viewport!.zoom).toBe(30)
    expect(ok.laser).toEqual([{ x: 1, y: 2, t: 3, start: true }, { x: 4, y: 5, t: 6 }])
    // control characters are dropped from names; an empty name is ''
    expect(sanitizePresence({ user: { name: 'a\u0000b‮c' } })!.user.name).toBe('abc')
    expect(sanitizePresence({ user: { name: 5 } })!.user.name).toBe('')
  })

  it('publishes throttled state', () => {
    vi.useFakeTimers()
    const a = newAwareness()
    const changes = vi.fn()
    a.on('change', changes)
    const pub = new PresencePublisher(a, { name: 'Ann', color: '#2f9e44' })
    // the identity goes out at once
    expect(a.getLocalState()).toMatchObject({ user: { name: 'Ann', color: '#2f9e44' }, cursor: null, selection: [], laser: [] })
    changes.mockClear()
    for (let i = 0; i < 10; i++) {
      pub.set({ cursor: { x: i, y: i } })
      vi.advanceTimersByTime(4)
    }
    // 40 ms in: nothing sent yet
    expect(changes).not.toHaveBeenCalled()
    vi.advanceTimersByTime(PRESENCE_THROTTLE_MS)
    expect(changes).toHaveBeenCalledTimes(1)
    expect(a.getLocalState()!.cursor).toEqual({ x: 9, y: 9 })
    // at most one publish per 50 ms
    changes.mockClear()
    for (let i = 0; i < 25; i++) {
      pub.set({ selection: [`s${i}`] })
      vi.advanceTimersByTime(10)
    }
    vi.advanceTimersByTime(PRESENCE_THROTTLE_MS)
    expect(changes.mock.calls.length).toBeLessThanOrEqual(Math.ceil(250 / PRESENCE_THROTTLE_MS) + 1)
    expect(changes.mock.calls.length).toBeGreaterThanOrEqual(4)
    expect(a.getLocalState()!.selection).toEqual(['s24'])
    // destroy clears our state (only because we set it)
    pub.set({ cursor: { x: 0, y: 0 } })
    pub.destroy()
    expect(a.getLocalState()).toBeNull()
    vi.advanceTimersByTime(200)
    expect(a.getLocalState()).toBeNull()
  })

  it('publisher re-adds the user when the local state lost it', () => {
    vi.useFakeTimers()
    const a = newAwareness()
    const pub = new PresencePublisher(a, { name: 'Ann', color: '#2f9e44' })
    // something else cleared (or replaced) the local state
    a.setLocalState(null)
    pub.set({ cursor: { x: 1, y: 2 } })
    vi.advanceTimersByTime(PRESENCE_THROTTLE_MS)
    expect(a.getLocalState()).toMatchObject({ user: { name: 'Ann', color: '#2f9e44' }, cursor: { x: 1, y: 2 } })
    a.setLocalState({ app: 1 })
    pub.set({ cursor: null })
    pub.flush()
    expect(a.getLocalState()).toMatchObject({ app: 1, user: { name: 'Ann', color: '#2f9e44' }, cursor: null })
    pub.destroy()
  })

  it('reader keeps a peer selection array while its ids do not change', () => {
    const a = newAwareness()
    const peer = newAwareness()
    relay(peer, a)
    const reader = new PresenceReader(a, { now: () => 0, locale: () => 'en', onChange: () => {} })
    peer.setLocalState({ user: { name: 'Eve', color: '#0c8599' }, cursor: null, selection: ['x', 'y'], viewport: null, laser: [] })
    const first = reader.get(peer.clientID)!.selection
    peer.setLocalState({ ...peer.getLocalState(), cursor: { x: 5, y: 5 } })
    expect(reader.get(peer.clientID)!.cursor).toEqual({ x: 5, y: 5 })
    expect(reader.get(peer.clientID)!.selection).toBe(first)
    peer.setLocalState({ ...peer.getLocalState(), selection: ['x'] })
    expect(reader.get(peer.clientID)!.selection).toEqual(['x'])
    reader.destroy()
  })

  it('remote selection boxes are memoized per peer and culled to the view', () => {
    const store = new BoardStore(new Y.Doc())
    const scene = new Scene(store)
    const near = store.create(init({ x: 0, y: 0 }))
    const far = store.create(init({ x: 5000, y: 5000 }))
    const cache = new RemoteSelectionBoxes()
    const selection = [near.id, far.id, 'missing']
    const view = { minX: -100, minY: -100, maxX: 800, maxY: 600 }
    const one = cache.boxes({ clientId: 1, selection }, scene, view)
    expect(one).toHaveLength(1)
    expect(one[0]).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }])
    expect(cache.boxes({ clientId: 1, selection }, scene, null)).toHaveLength(2)
    // same selection array and scene elements: nothing is recomputed
    const computed = cache.computed
    cache.boxes({ clientId: 1, selection }, scene, view)
    expect(cache.computed).toBe(computed)
    // a scene change recomputes
    store.update(far.id, { x: 10, y: 10 })
    expect(cache.boxes({ clientId: 1, selection }, scene, view)).toHaveLength(2)
    expect(cache.computed).toBe(computed + 1)
    // another peer has its own entry; peers that left are dropped
    cache.boxes({ clientId: 2, selection: [near.id] }, scene, view)
    cache.retain([2])
    expect(cache.size).toBe(1)
    scene.destroy()
  })

  it('reader exposes sanitized remote peers and re-times their laser', () => {
    vi.useFakeTimers()
    const ours = newAwareness()
    const peer = newAwareness()
    relay(peer, ours)
    let now = 5000
    const onChange = vi.fn()
    const reader = new PresenceReader(ours, { now: () => now, locale: () => 'en', onChange })
    expect(reader.peers()).toEqual([])
    peer.setLocalState({ user: { name: 'Bob', color: '#1971c2' }, cursor: { x: 1, y: 2 }, selection: ['a'], viewport: null, laser: [{ x: 0, y: 0, t: 100, start: true }, { x: 1, y: 0, t: 120 }] })
    expect(onChange).toHaveBeenCalled()
    const [p] = reader.peers()
    expect(p!.clientId).toBe(peer.clientID)
    expect(p!.user.name).toBe('Bob')
    // the newest point is "now" on our clock
    expect(p!.laser.map(l => l.t)).toEqual([4980, 5000])
    // other fields changing do not refresh the laser's age
    now = 5500
    peer.setLocalStateField('cursor', { x: 3, y: 3 })
    expect(reader.peers()[0]!.laser.map(l => l.t)).toEqual([4980, 5000])
    peer.setLocalState(null)
    expect(reader.peers()).toEqual([])
    reader.destroy()
  })
})

describe('remote overlay', () => {
  it('renders remote cursor and selection', () => {
    const store = new BoardStore(new Y.Doc())
    const id = store.create(init({ x: 0, y: 0, w: 100, h: 50 }))
    const scene = new Scene(store)
    const canvas = document.createElement('canvas')
    const ctx = makeFakeCtx(canvas)
    const viewport = new Viewport()
    viewport.zoom = 2
    const state: RenderState = { viewport, widthCss: 400, heightCss: 400, dpr: 1, theme: 'light', grid: false }
    const corners = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }]
    renderInteractive(ctx, scene, state, {
      selectedIds: new Set(), marquee: null, hoverId: null, draft: null, pointHandles: null, previewSegment: null,
      erasing: new Set(), laser: [], lasso: null, bindTarget: null, guides: [], now: 1000,
      remote: [{
        clientId: 9, color: '#9c36b5', name: 'Mallory <b>', cursor: { x: 10, y: 20 },
        selectionBoxes: [corners], laser: [{ x: 0, y: 0, t: 900, start: true }, { x: 5, y: 5, t: 950 }],
      }],
    })
    void id
    const strokes = ctx.calls.filter(c => c.name === 'set:strokeStyle').map(c => c.args[0])
    const fills = ctx.calls.filter(c => c.name === 'set:fillStyle').map(c => c.args[0])
    expect(strokes).toContain('#9c36b5')
    expect(fills).toContain('#9c36b5')
    // 1.5 screen px selection outline around the rotated box
    const widths = ctx.calls.filter(c => c.name === 'set:lineWidth').map(c => c.args[0])
    expect(widths).toContain(1.5 / 2)
    const lineTos = ctx.calls.filter(c => c.name === 'lineTo').map(c => c.args)
    expect(lineTos).toContainEqual([100, 0])
    expect(lineTos).toContainEqual([100, 50])
    expect(lineTos).toContainEqual([0, 50])
    // the name tag is plain canvas text
    const texts = ctx.calls.filter(c => c.name === 'fillText')
    expect(texts.map(c => c.args[0])).toContain('Mallory <b>')
    // cursor drawn at screen size: the screen transform is set, and the tag sits next to (20, 40) screen px
    const tag = texts.find(c => c.args[0] === 'Mallory <b>')!
    expect(tag.args[1] as number).toBeGreaterThan(20)
    expect(tag.args[2] as number).toBeGreaterThan(40)
    // remote laser fades like the local one (age 50 ms → 0.95)
    const alphas = ctx.calls.filter(c => c.name === 'set:globalAlpha').map(c => c.args[0] as number)
    expect(alphas.some(v => Math.abs(v - 0.95) < 1e-9)).toBe(true)
    scene.destroy()
  })
})

describe('SketchBoard presence', () => {
  let frames: ReturnType<typeof stubFrames>

  beforeEach(() => {
    stubCanvas()
    frames = stubFrames()
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600)
  })

  async function setup(withAwareness: boolean, props: Record<string, unknown> = {}) {
    const base = await memory().connect('b')
    const awareness = withAwareness ? newAwareness(base.doc) : undefined
    const connection: BoardConnection = { ...base, awareness, destroy: () => base.destroy() }
    const wrapper = mount(SketchBoard, { props: { connection, locale: 'en', ...props }, attachTo: document.body })
    wrappers.push(wrapper)
    await nextTick()
    const canvases = wrapper.findAll('canvas')
    const top = canvases[canvases.length - 1]!.element as HTMLCanvasElement
    const pointer = (type: string, x: number, y: number, init: PointerEventInit = {}) =>
      top.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, button: 0, pointerId: 1, pointerType: 'mouse', bubbles: true, ...init }))
    return { wrapper, connection, awareness, top, pointer }
  }

  it('inert without awareness', async () => {
    const set = vi.spyOn(PresencePublisher.prototype, 'set')
    const read = vi.spyOn(PresenceReader.prototype, 'peers')
    const { wrapper, pointer } = await setup(false)
    for (let i = 0; i < 5; i++) pointer('pointermove', 10 + i, 10)
    pointer('pointerleave', 10, 10)
    frames.flush()
    expect(set).not.toHaveBeenCalled()
    expect(read).not.toHaveBeenCalled()
    expect(wrapper.find('.me-sketch-avatars').exists()).toBe(false)
  })

  it('publishes cursor, selection and viewport; clears them on unmount', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { wrapper, awareness, pointer } = await setup(true, { user: { name: 'Ann', color: '#f08c00' } })
    const state = () => awareness!.getLocalState() as Record<string, any>
    expect(state().user).toEqual({ name: 'Ann', color: '#f08c00' })
    pointer('pointermove', 400, 300)
    vi.advanceTimersByTime(PRESENCE_THROTTLE_MS)
    const vp = state().viewport
    expect(vp.zoom).toBe(1)
    // cursor is in scene coords; the viewport is the scene point at the view center
    expect(state().cursor).toEqual({ x: vp.x, y: vp.y })
    pointer('pointerleave', 400, 300)
    vi.advanceTimersByTime(PRESENCE_THROTTLE_MS)
    expect(state().cursor).toBeNull()
    const id = new BoardStore(awareness!.doc).create(init()).id
    await nextTick()
    ;(wrapper.vm as unknown as { select(ids: string[]): void }).select([id])
    await nextTick()
    vi.advanceTimersByTime(PRESENCE_THROTTLE_MS)
    expect(state().selection).toEqual([id])
    wrapper.unmount()
    wrappers.splice(wrappers.indexOf(wrapper), 1)
    expect(awareness!.getLocalState()).toBeNull()
  })

  it('a default guest identity uses the locale and the client id', async () => {
    const { awareness } = await setup(true)
    const s = awareness!.getLocalState() as Record<string, any>
    expect(s.user).toEqual(defaultUser(awareness!.clientID, 'en'))
  })

  it('follow tracks viewport and stops on local pan', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { wrapper, awareness } = await setup(true)
    const peer = newAwareness()
    relay(peer, awareness!)
    relay(awareness!, peer)
    peer.setLocalState({ user: { name: 'Bob Stone', color: '#1971c2' }, cursor: { x: 5, y: 5 }, selection: [], viewport: { x: 1000, y: 500, zoom: 2 }, laser: [] })
    await nextTick()
    const avatar = wrapper.find('.me-sketch-avatar')
    expect(avatar.exists()).toBe(true)
    expect(avatar.text()).toBe('BS')
    expect(avatar.attributes('title')).toContain('Bob Stone')
    await avatar.trigger('click')
    await nextTick()
    expect(wrapper.find('.me-sketch-following').text()).toContain('Bob Stone')
    const toScreen = (p: { x: number; y: number }) => (wrapper.vm as unknown as { toScreen(p: { x: number; y: number }): { x: number; y: number } }).toScreen(p)
    // the peer's view center is at our view center (800×600 canvas), at their zoom
    expect(toScreen({ x: 1000, y: 500 })).toEqual({ x: 400, y: 300 })
    expect(wrapper.find('.me-sketch-zoom-pct').text()).toBe('200%')
    peer.setLocalStateField('viewport', { x: 0, y: 0, zoom: 1 })
    await nextTick()
    expect(toScreen({ x: 0, y: 0 })).toEqual({ x: 400, y: 300 })
    // a local pan (wheel) stops following
    const e = new WheelEvent('wheel', { deltaX: 0, deltaY: 40, cancelable: true, bubbles: true })
    wrapper.find('.me-sketch-board').element.dispatchEvent(e)
    await nextTick()
    expect(wrapper.find('.me-sketch-following').exists()).toBe(false)
    const before = toScreen({ x: 0, y: 0 })
    peer.setLocalStateField('viewport', { x: 300, y: 300, zoom: 1 })
    await nextTick()
    expect(toScreen({ x: 0, y: 0 })).toEqual(before)
    // follow again, then Escape stops it; the stop button too
    await wrapper.find('.me-sketch-avatar').trigger('click')
    expect(wrapper.find('.me-sketch-following').exists()).toBe(true)
    await wrapper.find('.me-sketch-board').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('.me-sketch-following').exists()).toBe(false)
    await wrapper.find('.me-sketch-avatar').trigger('click')
    await wrapper.find('.me-sketch-following button').trigger('click')
    expect(wrapper.find('.me-sketch-following').exists()).toBe(false)
  })

  it('remote state invalidates only the interactive layer and draws the cursor', async () => {
    const { awareness } = await setup(true)
    const peer = newAwareness()
    relay(peer, awareness!)
    frames.flush()
    const canvases = document.querySelectorAll('canvas')
    const staticCtx = ctxOf(canvases[canvases.length - 2] as HTMLCanvasElement)
    const topCtx = ctxOf(canvases[canvases.length - 1] as HTMLCanvasElement)
    staticCtx.calls.length = 0
    topCtx.calls.length = 0
    peer.setLocalState({ user: { name: 'Eve', color: '#0c8599' }, cursor: { x: 0, y: 0 }, selection: [], viewport: null, laser: [] })
    frames.flush()
    expect(staticCtx.calls.length).toBe(0)
    expect(topCtx.calls.some(c => c.name === 'fillText' && c.args[0] === 'Eve')).toBe(true)
  })

  it('mounts when a peer already has a laser trail (no TDZ on the clock) and draws it', async () => {
    const base = await memory().connect('b')
    const awareness = newAwareness(base.doc)
    const peer = newAwareness()
    relay(peer, awareness)
    peer.setLocalState({
      user: { name: 'Eve', color: '#0c8599' }, cursor: null, selection: [], viewport: null,
      laser: [{ x: 0, y: 0, t: 5, start: true }, { x: 50, y: 50, t: 10 }],
    })
    const connection: BoardConnection = { ...base, awareness, destroy: () => base.destroy() }
    const wrapper = mount(SketchBoard, { props: { connection, locale: 'en' }, attachTo: document.body })
    wrappers.push(wrapper)
    await nextTick()
    frames.flush()
    const canvases = document.querySelectorAll('canvas')
    const topCtx = ctxOf(canvases[canvases.length - 1] as HTMLCanvasElement)
    expect(topCtx.calls.some(c => c.name === 'set:strokeStyle' && c.args[0] === '#0c8599')).toBe(true)
  })

  it('shows at most 5 avatars plus +N', async () => {
    const { wrapper, awareness } = await setup(true)
    for (let i = 0; i < 7; i++) {
      const peer = newAwareness()
      relay(peer, awareness!)
      peer.setLocalState({ user: { name: `P${i}`, color: '#e03131' }, cursor: null, selection: [], viewport: null, laser: [] })
    }
    await nextTick()
    expect(wrapper.findAll('.me-sketch-avatar')).toHaveLength(5)
    expect(wrapper.find('.me-sketch-avatars-more').text()).toBe('+2')
  })
})
