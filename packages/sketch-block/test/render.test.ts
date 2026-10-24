import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'

import { BoardStore } from '../src/model/store'
import { Scene } from '../src/model/scene'
import { DEFAULT_STYLE, type ShapeElement } from '../src/model/types'
import { BitmapCache, bindCacheInvalidation, cacheKey, zoomBucket } from '../src/render/bitmap-cache'
import { renderInteractive, resetAccentCache } from '../src/render/interactive'
import { RenderScheduler, ZoomSettler } from '../src/render/scheduler'
import { shapeKeyOf } from '../src/elements/kind'
import { shapeFor } from '../src/elements/shape'
import { displayColor, roughOptions } from '../src/render/shapes'
import { type RenderState, renderStatic } from '../src/render/static'
import { Viewport } from '../src/viewport'

// ---------- recording fake 2D context ----------
interface Call { name: string; args: unknown[] }
type FakeCtx = CanvasRenderingContext2D & { calls: Call[]; canvas: HTMLCanvasElement }

function makeFakeCtx(canvas: HTMLCanvasElement): FakeCtx {
  const calls: Call[] = []
  const props: Record<string, unknown> = {
    calls, canvas, globalAlpha: 1, lineWidth: 1, strokeStyle: '#000', fillStyle: '#000',
  }
  return new Proxy(props, {
    get(target, key: string) {
      if (key in target) return target[key]
      if (key === 'getLineDash') return () => []
      if (key === 'then') return undefined
      return (...args: unknown[]) => { calls.push({ name: key, args }) }
    },
    set(target, key: string, value) {
      target[key] = value
      calls.push({ name: `set:${key}`, args: [value] })
      return true
    },
  }) as unknown as FakeCtx
}

const ctxs = new WeakMap<HTMLCanvasElement, FakeCtx>()
const ctxOf = (c: HTMLCanvasElement) => {
  let ctx = ctxs.get(c)
  if (!ctx) { ctx = makeFakeCtx(c); ctxs.set(c, ctx) }
  return ctx
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    return ctxOf(this) as never
  } as never)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const count = (ctx: FakeCtx, name: string) => ctx.calls.filter(c => c.name === name).length

const el = (over: Partial<ShapeElement> = {}): ShapeElement => ({
  id: 'a', type: 'rectangle', x: 0, y: 0, w: 100, h: 50, angle: 0, index: 'a0',
  ...DEFAULT_STYLE, groupIds: [], frameId: null, label: '', seed: 42, version: 1, locked: false, ...over,
})

const init = (over: Partial<ShapeElement> = {}) => ({
  type: 'rectangle' as const, x: 0, y: 0, w: 100, h: 50, angle: 0, locked: false,
  ...DEFAULT_STYLE, label: '', ...over,
})

const state = (over: Partial<RenderState> = {}): RenderState => ({
  viewport: new Viewport(), widthCss: 200, heightCss: 200, dpr: 1, theme: 'light', grid: false, ...over,
})

const newCanvas = () => {
  const c = document.createElement('canvas')
  return { canvas: c, ctx: c.getContext('2d') as unknown as FakeCtx }
}

// ---------- shapes ----------
describe('shapes', () => {
  it('roughOptions maps style fields', () => {
    const o = roughOptions(el({ roughness: 2, seed: 7, strokeStyle: 'dashed', strokeWidth: 4 }))
    expect(o.roughness).toBe(2)
    expect(o.seed).toBe(7)
    expect(o.strokeWidth).toBe(4)
    expect(o.strokeLineDash).toEqual([8, 8])
    expect(roughOptions(el({ strokeStyle: 'dotted' })).strokeLineDash).toEqual([1.5, 6])
    expect(roughOptions(el()).strokeLineDash).toBeUndefined()
  })

  it('roughOptions fills only when visible', () => {
    expect(roughOptions(el({ fill: 'transparent', fillStyle: 'solid' })).fill).toBeUndefined()
    expect(roughOptions(el({ fill: '#f00', fillStyle: 'none' })).fill).toBeUndefined()
    const o = roughOptions(el({ fill: '#f00', fillStyle: 'cross-hatch' }))
    expect(o.fill).toBe('#f00')
    expect(o.fillStyle).toBe('cross-hatch')
  })

  it('displayColor swaps the default stroke in dark theme only', () => {
    expect(displayColor('#1e1e1e', 'dark')).toBe('#e3e3e3')
    expect(displayColor('#1e1e1e', 'light')).toBe('#1e1e1e')
    expect(displayColor('#ff0000', 'dark')).toBe('#ff0000')
    expect(roughOptions(el(), 'dark').stroke).toBe('#e3e3e3')
  })

  it('shapeFor caches by shapeKey + theme', () => {
    const a = el()
    expect(shapeFor(a)).toBe(shapeFor(a))
    expect(shapeFor({ ...a })).toBe(shapeFor(a))
    expect(shapeFor({ ...a, seed: 43 })).not.toBe(shapeFor(a))
    expect(shapeFor(a, 'dark')).not.toBe(shapeFor(a, 'light'))
  })

  it('shapeFor produces drawables for each type, rounded rect via path', () => {
    expect(shapeFor(el({ roundness: 'sharp' })).shape).toBe('rectangle')
    expect(shapeFor(el({ roundness: 'round' })).shape).toBe('path')
    expect(shapeFor(el({ type: 'ellipse' })).shape).toBe('ellipse')
    expect(shapeFor(el({ type: 'diamond' })).shape).toBe('polygon')
  })
})

// ---------- bitmap cache ----------
describe('bitmap cache', () => {
  it('zoomBucket snaps to powers of √2', () => {
    expect(zoomBucket(1.05)).toBe(zoomBucket(1))
    expect(zoomBucket(1)).toBe(1)
    expect(zoomBucket(2)).toBeCloseTo(2)
    expect(zoomBucket(1.4)).toBeCloseTo(Math.SQRT2)
  })

  it('cacheKey changes with shapeKey, zoom bucket, dpr, theme (not version)', () => {
    const a = el()
    const base = cacheKey(a, 1, 1, 'light')
    expect(base).toBe(`a:${shapeKeyOf(a)}:${zoomBucket(1)}:1:light`)
    expect(cacheKey({ ...a, version: 2 }, 1, 1, 'light')).toBe(base)
    expect(cacheKey({ ...a, stroke: '#e03131' }, 1, 1, 'light')).not.toBe(base)
    expect(cacheKey(a, 2, 1, 'light')).not.toBe(base)
    expect(cacheKey(a, 1.05, 1, 'light')).toBe(base)
    expect(cacheKey(a, 1, 2, 'light')).not.toBe(base)
    expect(cacheKey(a, 1, 1, 'dark')).not.toBe(base)
  })

  const bmp = (w: number, h: number) => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    return c
  }

  it('BitmapCache evicts least recently used above maxPixels', () => {
    const cache = new BitmapCache(300)
    cache.set('a:1:1:1:light', bmp(10, 10))
    cache.set('b:1:1:1:light', bmp(10, 10))
    expect(cache.pixels).toBe(200)
    cache.get('a:1:1:1:light') // a is now most recent
    cache.set('c:1:1:1:light', bmp(10, 10))
    expect(cache.pixels).toBe(300)
    cache.set('d:1:1:1:light', bmp(10, 10))
    expect(cache.get('b:1:1:1:light')).toBeUndefined()
    expect(cache.get('a:1:1:1:light')).toBeDefined()
    expect(cache.pixels).toBe(300)
  })

  it('deleteElement drops all keys of that id', () => {
    const cache = new BitmapCache()
    cache.set('a:1:1:1:light', bmp(10, 10))
    cache.set('a:2:2:1:dark', bmp(10, 10))
    cache.set('ab:1:1:1:light', bmp(10, 10))
    cache.deleteElement('a')
    expect(cache.get('a:1:1:1:light')).toBeUndefined()
    expect(cache.get('a:2:2:1:dark')).toBeUndefined()
    expect(cache.get('ab:1:1:1:light')).toBeDefined()
    expect(cache.pixels).toBe(100)
    cache.clear()
    expect(cache.pixels).toBe(0)
  })

  it('bindCacheInvalidation drops bitmaps of changed ids', () => {
    const store = new BoardStore(new Y.Doc())
    const a = store.create(init())
    const b = store.create(init({ x: 300 }))
    const scene = new Scene(store)
    const cache = new BitmapCache()
    cache.set(`${a.id}:1:1:1:light`, bmp(10, 10))
    cache.set(`${b.id}:1:1:1:light`, bmp(10, 10))
    const off = bindCacheInvalidation(scene, cache)
    store.update(a.id, { x: 5 })
    expect(cache.get(`${a.id}:1:1:1:light`)).toBeUndefined()
    expect(cache.get(`${b.id}:1:1:1:light`)).toBeDefined()
    off()
    store.update(b.id, { x: 5 })
    expect(cache.get(`${b.id}:1:1:1:light`)).toBeDefined()
    scene.destroy()
  })
})

// ---------- static layer ----------
describe('renderStatic', () => {
  const spreadScene = (n: number) => {
    const store = new BoardStore(new Y.Doc())
    for (let i = 0; i < n; i++) {
      store.create(init({ x: (i % 40) * 200, y: Math.floor(i / 40) * 200, w: 100, h: 100 }))
    }
    return new Scene(store)
  }

  it('draws only visible elements', () => {
    const scene = spreadScene(1000)
    const st = state({ widthCss: 450, heightCss: 450 })
    const visible = scene.queryBox(st.viewport.visibleBox(450, 450)).length
    const { ctx } = newCanvas()
    const cache = new BitmapCache()
    const { drawn } = renderStatic(ctx, scene, st, cache)
    expect(drawn).toBeLessThanOrEqual(visible)
    expect(drawn).toBe(9)
    expect(count(ctx, 'drawImage')).toBe(9)
    scene.destroy()
  })

  it('reuses cached bitmaps on the next frame', () => {
    const scene = spreadScene(4)
    const cache = new BitmapCache()
    const { ctx } = newCanvas()
    renderStatic(ctx, scene, state({ widthCss: 1000 }), cache)
    const created = vi.spyOn(document, 'createElement')
    renderStatic(ctx, scene, state({ widthCss: 1000 }), cache)
    expect(created).not.toHaveBeenCalled()
    scene.destroy()
  })

  it('reuses bitmaps (scaled) while cacheZoom is held during zoom', () => {
    const scene = spreadScene(4)
    const cache = new BitmapCache()
    const { ctx } = newCanvas()
    const vp = new Viewport()
    renderStatic(ctx, scene, state({ viewport: vp, widthCss: 1000, cacheZoom: 1 }), cache)
    vp.zoom = 2.5 // different bucket
    const created = vi.spyOn(document, 'createElement')
    ctx.calls.length = 0
    const { drawn } = renderStatic(ctx, scene, state({ viewport: vp, widthCss: 1000, cacheZoom: 1 }), cache)
    expect(created).not.toHaveBeenCalled()
    expect(drawn).toBeGreaterThan(0)
    expect(count(ctx, 'drawImage')).toBe(drawn)
    scene.destroy()
  })

  it('draws bitmaps at their exact pixel size / scale, centered on the element', () => {
    const store = new BoardStore(new Y.Doc())
    // pad = 2 + 1*4 = 6; sw = 112.3 → 113 px at s = 1
    store.create(init({ x: 10, y: 20, w: 100.3, h: 50, angle: 0.5 }))
    const scene = new Scene(store)
    const { ctx } = newCanvas()
    renderStatic(ctx, scene, state(), new BitmapCache())
    const di = ctx.calls.find(c => c.name === 'drawImage')!
    const img = di.args[0] as HTMLCanvasElement
    expect(img.width).toBe(113)
    expect(img.height).toBe(62)
    expect(di.args.slice(1)).toEqual([-100.3 / 2 - 6, -25 - 6, 113, 62])
    expect(ctx.calls.find(c => c.name === 'translate')!.args).toEqual([10 + 100.3 / 2, 45])
    expect(ctx.calls.find(c => c.name === 'rotate')!.args).toEqual([0.5])
    scene.destroy()
  })

  it('composites a highlighter bitmap with multiply in light theme only', () => {
    for (const theme of ['light', 'dark'] as const) {
      const store = new BoardStore(new Y.Doc())
      store.create({
        type: 'freedraw', x: 0, y: 0, w: 100, h: 0, angle: 0, locked: false, ...DEFAULT_STYLE,
        points: [[0, 0], [100, 0]], pressures: [], highlighter: true,
      })
      store.create(init({ x: 0, y: 50, w: 50, h: 50 }))
      const scene = new Scene(store)
      const { ctx } = newCanvas()
      renderStatic(ctx, scene, state({ theme }), new BitmapCache())
      const ops: string[] = []
      let op = 'source-over'
      for (const c of ctx.calls) {
        if (c.name === 'set:globalCompositeOperation') op = c.args[0] as string
        if (c.name === 'drawImage') ops.push(op)
      }
      expect(ops).toHaveLength(2)
      if (theme === 'light') expect(ops.sort()).toEqual(['multiply', 'source-over'])
      else expect(ops).toEqual(['source-over', 'source-over'])
      expect(op).toBe('source-over')
      scene.destroy()
    }
  })

  it('draws bitmap dimensions divided by the bitmap scale', () => {
    const store = new BoardStore(new Y.Doc())
    store.create(init({ w: 100.3, h: 50 }))
    const scene = new Scene(store)
    const { ctx } = newCanvas()
    renderStatic(ctx, scene, state({ dpr: 2 }), new BitmapCache())
    const di = ctx.calls.find(c => c.name === 'drawImage')!
    const img = di.args[0] as HTMLCanvasElement
    expect(img.width).toBe(Math.ceil(112.3 * 2))
    expect(di.args[3]).toBe(img.width / 2)
    expect(di.args[4]).toBe(img.height / 2)
    scene.destroy()
  })

  it('culls by index bounds padded with the visual pad', () => {
    const store = new BoardStore(new Y.Doc())
    // right edge -10; index maxX = -10 + visualPad (2 + 2*4) = 0, where rough strokes reach
    store.create(init({ x: -110, y: 0, w: 100, h: 50, strokeWidth: 2, roughness: 2 }))
    const scene = new Scene(store)
    const vp = new Viewport()
    vp.x = -4 // the stroke is on screen
    const { ctx } = newCanvas()
    expect(renderStatic(ctx, scene, state({ viewport: vp }), new BitmapCache()).drawn).toBe(1)
    vp.x = 5 // beyond the padded index bounds → culled
    expect(renderStatic(ctx, scene, state({ viewport: vp }), new BitmapCache()).drawn).toBe(0)
    scene.destroy()
  })

  it('skips ids in skipIds', () => {
    const scene = spreadScene(4)
    const { ctx } = newCanvas()
    const first = scene.elements[0]!.id
    const { drawn } = renderStatic(ctx, scene, state({ widthCss: 1000 }), new BitmapCache(), new Set([first]))
    expect(drawn).toBe(3)
    scene.destroy()
  })

  it('uses LOD below zoom 0.3', () => {
    const scene = spreadScene(100)
    const vp = new Viewport()
    vp.zoom = 0.2
    const { ctx } = newCanvas()
    const cache = new BitmapCache()
    const { drawn } = renderStatic(ctx, scene, state({ viewport: vp, widthCss: 2000, heightCss: 2000 }), cache)
    expect(drawn).toBeGreaterThan(0)
    expect(count(ctx, 'drawImage')).toBe(0)
    expect(count(ctx, 'stroke')).toBe(drawn)
    expect(cache.pixels).toBe(0)
    scene.destroy()
  })

  it('applies the viewport transform in device pixels and opacity', () => {
    const store = new BoardStore(new Y.Doc())
    store.create(init({ opacity: 0.5 }))
    const scene = new Scene(store)
    const vp = new Viewport()
    vp.x = 10
    vp.y = 20
    vp.zoom = 2
    const { ctx } = newCanvas()
    renderStatic(ctx, scene, state({ viewport: vp, dpr: 2 }), new BitmapCache())
    const st = ctx.calls.find(c => c.name === 'setTransform' && (c.args as number[])[0] === 4)
    expect(st?.args).toEqual([4, 0, 0, 4, -40, -80])
    expect(ctx.calls.some(c => c.name === 'set:globalAlpha' && c.args[0] === 0.5)).toBe(true)
    scene.destroy()
  })

  it('caps bitmap sides at 4096 px', () => {
    const store = new BoardStore(new Y.Doc())
    store.create(init({ w: 3000, h: 100 }))
    const scene = new Scene(store)
    const vp = new Viewport()
    vp.zoom = 4
    const cache = new BitmapCache()
    const { ctx } = newCanvas()
    renderStatic(ctx, scene, state({ viewport: vp }), cache)
    const img = ctx.calls.find(c => c.name === 'drawImage')!.args[0] as HTMLCanvasElement
    expect(img.width).toBeLessThanOrEqual(4096)
    expect(img.height).toBeLessThanOrEqual(4096)
    scene.destroy()
  })

  it('draws the grid only when enabled and dense enough', () => {
    const scene = spreadScene(1)
    const a = newCanvas()
    renderStatic(a.ctx, scene, state({ grid: true }), new BitmapCache())
    const withGrid = count(a.ctx, 'lineTo')
    const b = newCanvas()
    renderStatic(b.ctx, scene, state({ grid: false }), new BitmapCache())
    expect(withGrid).toBeGreaterThan(count(b.ctx, 'lineTo'))
    const vp = new Viewport()
    vp.zoom = 0.35 // 20 * 0.35 = 7 px < 8
    const c = newCanvas()
    renderStatic(c.ctx, scene, state({ grid: true, viewport: vp }), new BitmapCache())
    const d = newCanvas()
    renderStatic(d.ctx, scene, state({ grid: false, viewport: vp }), new BitmapCache())
    expect(count(c.ctx, 'lineTo')).toBe(count(d.ctx, 'lineTo'))
    scene.destroy()
  })
})

// ---------- interactive layer ----------
describe('renderInteractive', () => {
  const sceneWith = () => {
    const store = new BoardStore(new Y.Doc())
    const a = store.create(init())
    const b = store.create(init({ x: 300 }))
    return { scene: new Scene(store), a, b }
  }
  const overlay = (over = {}) => ({
    selectedIds: new Set<string>(), marquee: null, hoverId: null, draft: null, pointHandles: null, previewSegment: null,
    erasing: new Set<string>(), laser: [], lasso: null,
    ...over,
  })
  const lineInit = (n: number) => ({
    ...init(), type: 'line' as const, h: 0, w: 100 * (n - 1),
    points: Array.from({ length: n }, (_, i) => [i * 100, 0] as [number, number]),
    routing: 'straight' as const, startArrowhead: 'none' as const, endArrowhead: 'none' as const,
  })

  it('draws point handles as circles; a 2-point line has no resize handles, 3+ points keep them', () => {
    const store = new BoardStore(new Y.Doc())
    const two = store.create(lineInit(2))
    const three = store.create(lineInit(3))
    const scene = new Scene(store)
    const a = newCanvas()
    renderInteractive(a.ctx, scene, state(), overlay({
      selectedIds: new Set([two.id]), pointHandles: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    }))
    expect(count(a.ctx, 'fillRect')).toBe(0)
    expect(count(a.ctx, 'arc')).toBe(2)
    const b = newCanvas()
    renderInteractive(b.ctx, scene, state(), overlay({
      selectedIds: new Set([three.id]), pointHandles: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }],
    }))
    expect(count(b.ctx, 'fillRect')).toBe(9)
    expect(count(b.ctx, 'arc')).toBe(3)
    // 8 px / zoom diameter
    const z = newCanvas()
    const vp = new Viewport()
    vp.zoom = 2
    renderInteractive(z.ctx, scene, state({ viewport: vp }), overlay({ pointHandles: [{ x: 5, y: 5 }] }))
    expect(z.ctx.calls.find(c => c.name === 'arc')!.args.slice(0, 3)).toEqual([5, 5, 2])
    scene.destroy()
  })

  it('draws the multi-point preview segment', () => {
    const { scene } = sceneWith()
    const { ctx } = newCanvas()
    renderInteractive(ctx, scene, state(), overlay({ previewSegment: [{ x: 1, y: 2 }, { x: 30, y: 40 }] }))
    const i = ctx.calls.findIndex(c => c.name === 'moveTo' && c.args[0] === 1 && c.args[1] === 2)
    expect(i).toBeGreaterThanOrEqual(0)
    expect(ctx.calls[i + 1]).toEqual({ name: 'lineTo', args: [30, 40] })
    scene.destroy()
  })

  it('draws handles only for a single selection', () => {
    const { scene, a, b } = sceneWith()
    const one = newCanvas()
    renderInteractive(one.ctx, scene, state(), overlay({ selectedIds: new Set([a.id]) }))
    const two = newCanvas()
    renderInteractive(two.ctx, scene, state(), overlay({ selectedIds: new Set([a.id, b.id]) }))
    // 1 selection rect + 9 handles vs 2 selection rects
    expect(count(one.ctx, 'strokeRect')).toBe(10)
    expect(count(two.ctx, 'strokeRect')).toBe(2)
    expect(count(one.ctx, 'fillRect')).toBe(9)
    scene.destroy()
  })

  it('blends a highlighter draft with multiply in light theme only, then restores', () => {
    vi.stubGlobal('Path2D', class {})
    const { scene } = sceneWith()
    const draft = {
      ...el({ id: 'hl' }), type: 'freedraw' as const, h: 0,
      points: [[0, 0], [100, 0]] as [number, number][], pressures: [], highlighter: true,
    }
    for (const theme of ['light', 'dark'] as const) {
      const { ctx } = newCanvas()
      renderInteractive(ctx, scene, state({ theme }), overlay({ draft }))
      let op = 'source-over'
      const atFill: string[] = []
      for (const c of ctx.calls) {
        if (c.name === 'set:globalCompositeOperation') op = c.args[0] as string
        if (c.name === 'fill') atFill.push(op)
      }
      expect(atFill[0]).toBe(theme === 'light' ? 'multiply' : 'source-over')
      expect(op).toBe('source-over')
    }
    scene.destroy()
  })

  it('reads the accent once per canvas until reset', () => {
    const { scene, a } = sceneWith()
    const { ctx } = newCanvas()
    const spy = vi.spyOn(window, 'getComputedStyle')
    resetAccentCache()
    renderInteractive(ctx, scene, state(), overlay({ selectedIds: new Set([a.id]) }))
    renderInteractive(ctx, scene, state(), overlay({ selectedIds: new Set([a.id]) }))
    expect(spy).toHaveBeenCalledTimes(1)
    resetAccentCache()
    renderInteractive(ctx, scene, state(), overlay())
    expect(spy).toHaveBeenCalledTimes(2)
    scene.destroy()
  })

  it('draws the marquee and the draft element', () => {
    const { scene } = sceneWith()
    const { ctx } = newCanvas()
    renderInteractive(ctx, scene, state(), overlay({
      marquee: { minX: 0, minY: 0, maxX: 50, maxY: 50 },
      draft: el({ id: 'draft', roundness: 'sharp' }),
    }))
    expect(count(ctx, 'fillRect')).toBeGreaterThanOrEqual(1)
    expect(count(ctx, 'bezierCurveTo')).toBeGreaterThan(0) // roughjs strokes
    expect(count(ctx, 'clearRect')).toBe(1)
    scene.destroy()
  })

  it('draws erase-marked elements at 0.3 opacity', () => {
    const { scene, a } = sceneWith()
    const { ctx } = newCanvas()
    renderInteractive(ctx, scene, state(), overlay({ erasing: new Set([a.id]) }))
    const alphas = ctx.calls.filter(c => c.name === 'set:globalAlpha').map(c => c.args[0])
    expect(alphas).toContain(0.3 * a.opacity)
    expect(count(ctx, 'bezierCurveTo')).toBeGreaterThan(0)
    scene.destroy()
  })

  it('draws the laser trail in red, fading with age, and the lasso path', () => {
    const { scene } = sceneWith()
    const { ctx } = newCanvas()
    renderInteractive(ctx, scene, state(), overlay({
      laser: [{ x: 0, y: 0, t: 0, start: true }, { x: 10, y: 0, t: 500 }, { x: 20, y: 0, t: 900 }],
      now: 1000,
      lasso: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }],
    }))
    const strokes = ctx.calls.filter(c => c.name === 'set:strokeStyle').map(c => c.args[0])
    expect(strokes).toContain('#e03131')
    const alphas = ctx.calls.filter(c => c.name === 'set:globalAlpha').map(c => c.args[0] as number)
    // segment alphas follow the newer point's age: 1 - 500/1000, 1 - 100/1000
    expect(alphas).toContain(0.5)
    expect(alphas.some(v => Math.abs(v - 0.9) < 1e-9)).toBe(true)
    expect(count(ctx, 'closePath')).toBeGreaterThanOrEqual(1)
    scene.destroy()
  })
})

// ---------- scheduler ----------
describe('RenderScheduler', () => {
  it('coalesces many invalidations into one frame', () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const s = vi.fn()
    const i = vi.fn()
    const sched = new RenderScheduler(s, i)
    for (let k = 0; k < 10; k++) { sched.invalidateStatic(); sched.invalidateInteractive() }
    expect(frames.length).toBe(1)
    frames.shift()!(0)
    expect(s).toHaveBeenCalledTimes(1)
    expect(i).toHaveBeenCalledTimes(1)
    sched.invalidateInteractive()
    expect(frames.length).toBe(1)
    frames.shift()!(0)
    expect(s).toHaveBeenCalledTimes(1)
    expect(i).toHaveBeenCalledTimes(2)
  })

  it('destroy cancels the pending frame', () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
    const cancel = vi.fn()
    vi.stubGlobal('cancelAnimationFrame', cancel)
    const s = vi.fn()
    const sched = new RenderScheduler(s, vi.fn())
    sched.invalidateStatic()
    sched.destroy()
    expect(cancel).toHaveBeenCalledWith(1)
    frames.shift()?.(0)
    expect(s).not.toHaveBeenCalled()
    sched.invalidateStatic()
    expect(frames.length).toBe(0)
  })
})

describe('ZoomSettler', () => {
  it('settles cacheZoom 150ms after the last update', () => {
    vi.useFakeTimers()
    try {
      const onSettle = vi.fn()
      const z = new ZoomSettler(onSettle)
      z.update(1)
      expect(z.cacheZoom).toBe(1)
      z.update(1.5)
      vi.advanceTimersByTime(100)
      z.update(2)
      vi.advanceTimersByTime(149)
      expect(z.cacheZoom).toBe(1)
      expect(onSettle).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      expect(z.cacheZoom).toBe(2)
      expect(onSettle).toHaveBeenCalledTimes(1)
      z.update(3)
      z.destroy()
      vi.advanceTimersByTime(500)
      expect(z.cacheZoom).toBe(2)
      expect(onSettle).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
