import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'

import { kindOf, shapeKeyOf } from '../src/elements/kind'
import { shapeFor } from '../src/elements/shape'
import { elementBounds, handlePositions, hitElement, rotatePoint } from '../src/geometry'
import { exportSvg } from '../src/io/svg'
import { History } from '../src/model/history'
import { Scene } from '../src/model/scene'
import { BoardStore } from '../src/model/store'
import { DEFAULT_STYLE, type ElementType, type ShapeElement, type SketchElement } from '../src/model/types'
import { BitmapCache, bindCacheInvalidation, bitmapPad, cacheKey, zoomBucket } from '../src/render/bitmap-cache'
import { type RenderState, renderStatic } from '../src/render/static'
import { type PointerInput, ToolController } from '../src/tools/controller'
import { Viewport } from '../src/viewport'
import svgM0 from './fixtures/svg-m0.json'
import { type FakeCtx, stubCanvas } from './helpers/canvas'

beforeEach(() => stubCanvas())
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const el = (over: Partial<ShapeElement> = {}): ShapeElement => ({
  id: 'a', type: 'rectangle', x: 0, y: 0, w: 100, h: 50, angle: 0, index: 'a0',
  ...DEFAULT_STYLE, groupIds: [], frameId: null, label: '', seed: 42, version: 1, locked: false, ...over,
})

const init = (over: Partial<ShapeElement> = {}) => ({
  type: 'rectangle' as const, x: 0, y: 0, w: 100, h: 50, angle: 0, locked: false,
  ...DEFAULT_STYLE, label: '', ...over,
})

const state = (over: Partial<RenderState> = {}): RenderState => ({
  viewport: new Viewport(), widthCss: 1000, heightCss: 1000, dpr: 1, theme: 'light', grid: false, ...over,
})

const newCtx = () => document.createElement('canvas').getContext('2d') as unknown as FakeCtx

describe('ElementKind registry', () => {
  it('registers rectangle, ellipse and diamond to the same shape kind', () => {
    const k = kindOf(el())
    expect(kindOf(el({ type: 'ellipse' }))).toBe(k)
    expect(kindOf(el({ type: 'diamond' }))).toBe(k)
  })

  it('kindOf throws a clear error for unregistered types', () => {
    const bogus = { ...el(), type: 'bogus' as ElementType } as SketchElement
    expect(() => kindOf(bogus)).toThrow(/no element kind registered for type "bogus"/)
  })

  it('shape visualPad is strokeWidth + roughness * 4 and drives bitmapPad', () => {
    expect(kindOf(el({ strokeWidth: 2, roughness: 1 })).visualPad(el({ strokeWidth: 2, roughness: 1 }))).toBe(6)
    const e = el({ strokeWidth: 4, roughness: 2 })
    expect(kindOf(e).visualPad(e)).toBe(12)
    expect(bitmapPad(e)).toBe(12)
    expect(bitmapPad(el({ strokeWidth: 1, roughness: 0 }))).toBe(1)
  })

  it('shape hit works in the local unrotated frame', () => {
    const e = el()
    const k = kindOf(e)
    expect(k.hit(e, { x: 0, y: 25 }, 1)).toBe(true) // on the left edge
    expect(k.hit(e, { x: 50, y: 25 }, 1)).toBe(false) // unfilled center
    const f = el({ fill: '#ffc9c9', fillStyle: 'solid' })
    expect(k.hit(f, { x: 50, y: 25 }, 0)).toBe(true)
    const d = el({ type: 'diamond', fill: '#ffc9c9', fillStyle: 'solid' })
    expect(k.hit(d, { x: 5, y: 5 }, 0)).toBe(false)
    expect(k.hit(d, { x: 50, y: 25 }, 0)).toBe(true)
  })

  it('shape resize returns exactly {x, y, w, h}', () => {
    const e = el()
    expect(kindOf(e).resize(e, { x: 1, y: 2, w: 3, h: 4 })).toEqual({ x: 1, y: 2, w: 3, h: 4 })
  })
})

describe('shapeKey', () => {
  it('ignores x, y, angle, index, version, locked, opacity', () => {
    const base = shapeKeyOf(el())
    expect(shapeKeyOf(el({ x: 10, y: -5, angle: 1, index: 'b7', version: 9, locked: true }))).toBe(base)
    expect(shapeKeyOf(el({ id: 'other' }))).toBe(base)
  })

  it('changes with every field that affects the unrotated rendering', () => {
    const base = shapeKeyOf(el())
    const changes: Partial<ShapeElement>[] = [
      { type: 'ellipse' }, { w: 101 }, { h: 51 }, { stroke: '#e03131' }, { fill: '#ffc9c9' },
      { fillStyle: 'solid' }, { strokeWidth: 4 }, { strokeStyle: 'dashed' }, { roughness: 2 },
      { roundness: 'sharp' }, { seed: 43 }, { label: 'hi' }, { fontFamily: 'code' }, { fontSize: 36 },
      { textAlign: 'left' },
    ]
    const keys = changes.map(c => shapeKeyOf(el(c)))
    for (const k of keys) expect(k).not.toBe(base)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('is memoized per element object', () => {
    const e = el()
    const spy = vi.spyOn(kindOf(e), 'shapeKey')
    shapeKeyOf(e)
    shapeKeyOf(e)
    expect(spy).toHaveBeenCalledTimes(1)
    shapeKeyOf({ ...e })
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('cacheKey is id:shapeKey:zoomBucket:dpr:theme', () => {
    const e = el()
    expect(cacheKey(e, 1, 2, 'dark')).toBe(`a:${shapeKeyOf(e)}:${zoomBucket(1)}:2:dark`)
    expect(cacheKey(el({ x: 50, version: 7 }), 1, 2, 'dark')).toBe(cacheKey(e, 1, 2, 'dark'))
  })

  it('shapeFor drawables are shared by shapeKey + theme, not object identity', () => {
    const a = el()
    expect(shapeFor({ ...a, x: 300, angle: 2 })).toBe(shapeFor(a))
    expect(shapeFor(a, 'dark')).not.toBe(shapeFor(a, 'light'))
    expect(shapeFor(el({ stroke: '#e03131' }))).not.toBe(shapeFor(a))
  })

  it('shapeFor cache is an LRU capped at 5000 entries', () => {
    const first = el({ seed: 1 })
    const d = shapeFor(first)
    for (let i = 2; i <= 5000; i++) shapeFor(el({ seed: i, roughness: 0 }))
    expect(shapeFor(first)).toBe(d) // refreshed: now most recent
    for (let i = 5001; i <= 10001; i++) shapeFor(el({ seed: i, roughness: 0 }))
    expect(shapeFor(first)).not.toBe(d)
  })
})

describe('bitmaps survive moves and rotations', () => {
  it('moving an element keeps its shapeKey and reuses the bitmap', () => {
    const store = new BoardStore(new Y.Doc())
    const a = store.create(init({ x: 10, y: 10 }))
    const scene = new Scene(store)
    const cache = new BitmapCache()
    const off = bindCacheInvalidation(scene, cache)
    renderStatic(newCtx(), scene, state(), cache)
    const before = shapeKeyOf(scene.get(a.id)!)
    store.update(a.id, { x: 200 })
    store.update(a.id, { angle: 0.7 })
    expect(shapeKeyOf(scene.get(a.id)!)).toBe(before)
    const created = vi.spyOn(document, 'createElement')
    const ctx = newCtx()
    created.mockClear()
    expect(renderStatic(ctx, scene, state(), cache).drawn).toBe(1)
    expect(created).not.toHaveBeenCalled()
    expect(ctx.calls.filter(c => c.name === 'drawImage').length).toBe(1)
    off()
    scene.destroy()
  })

  it('changing stroke changes shapeKey and rebuilds', () => {
    const store = new BoardStore(new Y.Doc())
    const a = store.create(init())
    const scene = new Scene(store)
    const cache = new BitmapCache()
    const off = bindCacheInvalidation(scene, cache)
    renderStatic(newCtx(), scene, state(), cache)
    const before = shapeKeyOf(scene.get(a.id)!)
    const pixels = cache.pixels
    store.update(a.id, { stroke: '#e03131' })
    expect(shapeKeyOf(scene.get(a.id)!)).not.toBe(before)
    expect(cache.pixels).toBe(0) // stale bitmap pruned
    const created = vi.spyOn(document, 'createElement')
    renderStatic(newCtx(), scene, state(), cache)
    expect(created).toHaveBeenCalledWith('canvas')
    expect(cache.pixels).toBe(pixels)
    off()
    scene.destroy()
  })

  it('pruneElement keeps only the keys with the given prefix for that id', () => {
    const cache = new BitmapCache()
    const bmp = () => {
      const c = document.createElement('canvas')
      c.width = 10
      c.height = 10
      return c
    }
    cache.set('a:k1:1:1:light', bmp())
    cache.set('a:k1:2:1:dark', bmp())
    cache.set('a:k0:1:1:light', bmp())
    cache.set('ab:k0:1:1:light', bmp())
    cache.pruneElement('a', 'a:k1:')
    expect(cache.get('a:k1:1:1:light')).toBeDefined()
    expect(cache.get('a:k1:2:1:dark')).toBeDefined()
    expect(cache.get('a:k0:1:1:light')).toBeUndefined()
    expect(cache.get('ab:k0:1:1:light')).toBeDefined()
    expect(cache.pixels).toBe(300)
  })

  it('bindCacheInvalidation drops all bitmaps of removed elements', () => {
    const store = new BoardStore(new Y.Doc())
    const a = store.create(init())
    const scene = new Scene(store)
    const cache = new BitmapCache()
    const off = bindCacheInvalidation(scene, cache)
    renderStatic(newCtx(), scene, state(), cache)
    expect(cache.pixels).toBeGreaterThan(0)
    store.remove([a.id])
    expect(cache.pixels).toBe(0)
    off()
    scene.destroy()
  })

  it('concurrent remote edit with collapsed version still rebuilds', () => {
    const doc1 = new Y.Doc()
    const doc2 = new Y.Doc()
    doc1.clientID = 1
    doc2.clientID = 2
    const store1 = new BoardStore(doc1)
    const a = store1.create(init())
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))
    const store2 = new BoardStore(doc2)
    const scene = new Scene(store1)
    const cache = new BitmapCache() // deliberately not bound: keys alone must be content-addressed

    store1.update(a.id, { stroke: '#e03131' })
    store2.update(a.id, { stroke: '#1971c2' })
    const e1 = store1.get(a.id)!
    const e2 = store2.get(a.id)!
    expect(e1.version).toBe(e2.version)
    renderStatic(newCtx(), scene, state(), cache)

    Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2))
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))
    const merged = scene.get(a.id)!
    expect(merged.version).toBe(e1.version) // version collapsed
    expect(store2.get(a.id)!.stroke).toBe(merged.stroke)
    const winner = merged.stroke === e1.stroke ? e1 : e2
    expect(winner).toBe(e2) // remote wins with these client ids, so doc1's bitmap is stale
    expect(shapeKeyOf(merged)).toBe(shapeKeyOf(winner))
    expect(shapeKeyOf(merged)).not.toBe(shapeKeyOf(e1))

    const created = vi.spyOn(document, 'createElement')
    renderStatic(newCtx(), scene, state(), cache)
    expect(created).toHaveBeenCalledWith('canvas')
    scene.destroy()
  })
})

describe('visual-pad bounds and culling', () => {
  it('elementBounds pads by visualPad', () => {
    const b = elementBounds(el({ angle: Math.PI / 2, strokeWidth: 2, roughness: 1 }))
    expect(b.minX).toBeCloseTo(19, 6)
    expect(b.minY).toBeCloseTo(-31, 6)
    expect(b.maxX).toBeCloseTo(81, 6)
    expect(b.maxY).toBeCloseTo(81, 6)
    const z = elementBounds(el({ strokeWidth: 1, roughness: 0 }))
    expect(z).toEqual({ minX: -1, minY: -1, maxX: 101, maxY: 51 })
  })

  it('culling includes rough overshoot without MAX_ROUGH_PAD', () => {
    const store = new BoardStore(new Y.Doc())
    // right edge -10. roughness 2, strokeWidth 2 → ink reaches 0; roughness 0, strokeWidth 1 → -9
    store.create(init({ x: -110, y: 0, w: 100, h: 50, strokeWidth: 2, roughness: 2 }))
    store.create(init({ x: -110, y: 100, w: 100, h: 50, strokeWidth: 1, roughness: 0 }))
    const scene = new Scene(store)
    const vp = new Viewport()
    const run = (x: number) => {
      vp.x = x
      return renderStatic(newCtx(), scene, state({ viewport: vp, widthCss: 200, heightCss: 200 }), new BitmapCache()).drawn
    }
    expect(run(-9.5)).toBe(2)
    expect(run(-4)).toBe(1) // rough one still overshoots onto the screen
    expect(run(-8)).toBe(1) // calm one is off screen: no global inflation
    expect(run(1)).toBe(0)
    scene.destroy()
  })
})

describe('rotated resize keeps the opposite corner fixed', () => {
  const ptr = (x: number, y: number, extra: Partial<PointerInput> = {}): PointerInput => ({
    screen: { x, y }, button: 0, shift: false, alt: false, mod: false, pressure: 0.5, ...extra,
  })
  const corner = (b: { x: number; y: number; w: number; h: number; angle: number }, fx: 0 | 1, fy: 0 | 1) =>
    rotatePoint({ x: b.x + fx * b.w, y: b.y + fy * b.h }, { x: b.x + b.w / 2, y: b.y + b.h / 2 }, b.angle)

  function setup() {
    let frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const store = new BoardStore(new Y.Doc())
    const scene = new Scene(store)
    const viewport = new Viewport()
    const c = new ToolController({
      store, scene, history: new History(store), viewport,
      readonly: () => false, invalidate: () => {},
    })
    const flush = () => {
      const run = frames
      frames = []
      for (const cb of run) cb(0)
    }
    return { store, scene, c, flush }
  }

  for (const [handle, fixed, delta] of [
    ['se', [0, 0], { x: 40, y: 25 }],
    ['nw', [1, 1], { x: -30, y: -20 }],
  ] as const) {
    it(`${handle} at 30° via kind.resize`, () => {
      const { store, scene, c, flush } = setup()
      const a = store.create(init({ x: 100, y: 100, w: 120, h: 60, angle: Math.PI / 6, fill: '#ffc9c9', fillStyle: 'solid' }))
      const resize = vi.spyOn(kindOf(store.get(a.id)!), 'resize')
      const start = store.get(a.id)!
      const center = { x: start.x + start.w / 2, y: start.y + start.h / 2 }
      c.pointerDown(ptr(center.x, center.y))
      c.pointerUp(ptr(center.x, center.y))
      expect([...c.selectedIds.value]).toEqual([a.id])
      const h = handlePositions(start, 1)[handle]
      const before = corner(start, fixed[0], fixed[1])
      const to = { x: h.x + delta.x, y: h.y + delta.y }
      c.pointerDown(ptr(h.x, h.y))
      c.pointerMove(ptr(to.x, to.y))
      c.pointerUp(ptr(to.x, to.y))
      flush()
      expect(resize).toHaveBeenCalled()
      const after = store.get(a.id)!
      expect(after.w).not.toBeCloseTo(start.w)
      const now = corner(after, fixed[0], fixed[1])
      expect(now.x).toBeCloseTo(before.x, 6)
      expect(now.y).toBeCloseTo(before.y, 6)
      expect(hitElement(after, now, 1)).toBe(true)
      scene.destroy()
    })
  }
})

describe('svg output for shapes is unchanged', () => {
  const svgEl = (over: Partial<ShapeElement> = {}): SketchElement => ({
    id: 'a', type: 'rectangle', x: 0, y: 0, w: 100, h: 50, angle: 0, index: 'a0', seed: 7, version: 1,
    locked: false, ...DEFAULT_STYLE, groupIds: [], frameId: null, label: '', ...over,
  })
  // same inputs the M0 snapshot (fixtures/svg-m0.json) was captured from
  const cases: Record<keyof typeof svgM0, SketchElement[]> = {
    roundRect: [svgEl()],
    sharpRect: [svgEl({ roundness: 'sharp', x: 10, y: 20 })],
    ellipse: [svgEl({ type: 'ellipse', fill: '#a5d8ff', fillStyle: 'solid', roughness: 2, strokeWidth: 4 })],
    diamond: [svgEl({ type: 'diamond', strokeStyle: 'dashed', fill: '#ffc9c9', fillStyle: 'hachure', angle: 0.5 })],
    mixed: [
      svgEl({ id: 'b', type: 'ellipse', x: 200, y: -40, w: 80, h: 80, opacity: 0.5, strokeStyle: 'dotted', roughness: 0, strokeWidth: 1 }),
      svgEl({ id: 'c', type: 'rectangle', x: -60, y: 90, w: 30, h: 120, fill: '#b2f2bb', fillStyle: 'cross-hatch', angle: Math.PI / 6 }),
    ],
  }
  const num = (n: number) => String(Math.round(n * 100) / 100)

  for (const name of Object.keys(cases) as (keyof typeof svgM0)[]) {
    it(name, () => {
      const els = cases[name]
      const bs = els.map(elementBounds)
      const minX = Math.min(...bs.map(b => b.minX)) - 16
      const minY = Math.min(...bs.map(b => b.minY)) - 16
      const w = Math.max(...bs.map(b => b.maxX)) + 16 - minX
      const h = Math.max(...bs.map(b => b.maxY)) + 16 - minY
      const expected = svgM0[name].replace(
        /viewBox="[^"]*" width="[^"]*" height="[^"]*"/,
        `viewBox="${num(minX)} ${num(minY)} ${num(w)} ${num(h)}" width="${num(w)}" height="${num(h)}"`,
      )
      expect(exportSvg(els)).toBe(expected)
    })
  }
})
