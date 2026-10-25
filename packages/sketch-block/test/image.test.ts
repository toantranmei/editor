import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import * as Y from 'yjs'

import { imageKind, srcHashCount } from '../src/elements/image'
import { kindOf, shapeKeyOf } from '../src/elements/kind'
import { SketchBoard } from '../src/engine'
import { CLIPBOARD_TYPE, clipboardImageFiles, parseClipboard, pastedImageFiles } from '../src/io/clipboard'
import {
  clearImageCache, getLoadedImage, IMAGE_ERROR_TTL, isImageTainted, loadImage, onImageLoaded, retryFailedImages,
} from '../src/io/image-loader'
import { fitWithin, ImageInsertError, prepareImage } from '../src/io/image-insert'
import { exportSvg } from '../src/io/svg'
import { messages } from '../src/messages'
import { History } from '../src/model/history'
import { Scene } from '../src/model/scene'
import { relevantStyleKeys } from '../src/model/style'
import { BitmapCache } from '../src/render/bitmap-cache'
import { CROP_DIM_ALPHA, renderInteractive } from '../src/render/interactive'
import { BoardStore, LOCAL_ORIGIN } from '../src/model/store'
import { DEFAULT_STYLE, type ElementInit, type ImageElement, isImageSrc, isRenderable } from '../src/model/types'
import { memory } from '../src/providers/memory'
import { type PointerInput, ToolController } from '../src/tools/controller'
import { Viewport } from '../src/viewport'
import { makeFakeCtx, stubCanvas, stubFrames } from './helpers/canvas'

// ---------- happy-dom has no image decoding: a controllable Image stub ----------

class FakeImage {
  /** 'auto': fires onload (or onerror for `failing` srcs) in a microtask with `size`; 'manual': the test fires. */
  static mode: 'auto' | 'manual' = 'auto'
  static size: [number, number] = [800, 600]
  static failing = new Set<string>()
  /** srcs whose host sends no CORS headers: they fail when crossOrigin is set. */
  static corsless = new Set<string>()
  static created: FakeImage[] = []
  naturalWidth = 0
  naturalHeight = 0
  width = 0
  height = 0
  crossOrigin: string | null = null
  decoding = 'auto'
  onload: (() => void) | null = null
  onerror: ((e?: unknown) => void) | null = null
  private _src = ''
  get src(): string {
    return this._src
  }

  set src(v: string) {
    this._src = v
    FakeImage.created.push(this)
    if (FakeImage.mode === 'auto') {
      queueMicrotask(() => (FakeImage.failing.has(v) || (FakeImage.corsless.has(v) && this.crossOrigin)
        ? this.fail()
        : this.load(...FakeImage.size)))
    }
  }

  load(w: number, h: number): void {
    this.naturalWidth = this.width = w
    this.naturalHeight = this.height = h
    this.onload?.()
  }

  fail(): void {
    this.onerror?.(new Event('error'))
  }
}

beforeEach(() => {
  FakeImage.mode = 'auto'
  FakeImage.size = [800, 600]
  FakeImage.failing = new Set()
  FakeImage.corsless = new Set()
  FakeImage.created = []
  vi.stubGlobal('Image', FakeImage)
  vi.stubGlobal('requestAnimationFrame', () => 0)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:fake')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  clearImageCache()
})
afterEach(() => {
  clearImageCache()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
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
  return { store, scene, history, viewport, c }
}

const ptr = (x: number, y: number, extra: Partial<PointerInput> = {}): PointerInput => ({
  screen: { x, y }, button: 0, shift: false, alt: false, mod: false, pressure: 0.5, ...extra,
})
const key = (k: string, mods: { mod?: boolean; shift?: boolean; alt?: boolean } = {}) =>
  ({ key: k, mod: false, shift: false, alt: false, ...mods })

const SRC = 'https://cdn.example/a.png'

const imageInit = (over: Partial<ImageElement> = {}): ElementInit => ({
  ...DEFAULT_STYLE,
  type: 'image', x: 0, y: 0, w: 200, h: 100, angle: 0, locked: false,
  src: SRC, naturalW: 400, naturalH: 200, crop: null,
  ...over,
} as ElementInit)

const image = (over: Partial<ImageElement> = {}): ImageElement => ({
  ...(imageInit() as unknown as ImageElement), id: 'img', index: 'a0', seed: 1, version: 1, groupIds: [], frameId: null,
  ...over,
})

const file = (type: string, bytes = 10, name = 'a') => new File([new Uint8Array(bytes)], name, { type })

describe('image src allowlist', () => {
  it('accepts http(s), blob and raster data URLs; rejects other schemes', () => {
    expect(isImageSrc('https://x/a.png')).toBe(true)
    expect(isImageSrc('http://x/a.png')).toBe(true)
    expect(isImageSrc('blob:https://x/1')).toBe(true)
    expect(isImageSrc('blob:https://x/1', false)).toBe(false)
    for (const t of ['png', 'jpeg', 'webp', 'gif']) expect(isImageSrc(`data:image/${t};base64,AA`)).toBe(true)
    for (const bad of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', ' https://x', 'data:image/svg+xml;base64,AA',
      'data:text/html,<b>', 'file:///etc/passwd', 'x', '', 'vbscript:x']) {
      expect(isImageSrc(bad), bad).toBe(false)
    }
    expect(isImageSrc(5 as never)).toBe(false)
  })

  it('isRenderable rejects an image whose src has a disallowed scheme', () => {
    const raw = { ...image(), src: 'javascript:alert(1)' } as unknown as Record<string, unknown>
    expect(isRenderable(raw)).toBe(false)
    expect(isRenderable({ ...raw, src: SRC })).toBe(true)
    const { src: _src, ...noSrc } = raw
    expect(isRenderable(noSrc)).toBe(false)
  })

  it('the image style panel shows opacity only', () => {
    expect([...relevantStyleKeys('image')]).toEqual(['opacity'])
  })
})

describe('image loader', () => {
  it('caches by src, sets crossOrigin, and notifies on load', async () => {
    const cb = vi.fn()
    const off = onImageLoaded(cb)
    expect(getLoadedImage(SRC)).toBeUndefined()
    const p1 = loadImage(SRC)
    const p2 = loadImage(SRC)
    expect(FakeImage.created).toHaveLength(1)
    expect(FakeImage.created[0]!.crossOrigin).toBe('anonymous')
    const img = await p1
    expect(await p2).toBe(img)
    expect(getLoadedImage(SRC)).toBe(img)
    expect(cb).toHaveBeenCalledWith(SRC)
    off()
  })

  it('retries once without CORS for a host without CORS headers; the image is then tainted', async () => {
    const plain = 'https://cors.example/ok.png'
    expect(await loadImage(plain)).toBeDefined()
    expect(isImageTainted(plain)).toBe(false)

    FakeImage.corsless.add(SRC)
    const img = await loadImage(SRC)
    expect(getLoadedImage(SRC)).toBe(img)
    expect(isImageTainted(SRC)).toBe(true)
    const tries = FakeImage.created.filter(i => i.src === SRC)
    expect(tries.map(i => i.crossOrigin)).toEqual(['anonymous', null])
    // data URLs are never retried (CORS does not apply)
    const data = 'data:image/png;base64,AA'
    FakeImage.failing.add(data)
    await expect(loadImage(data)).rejects.toThrow()
    expect(FakeImage.created.filter(i => i.src === data)).toHaveLength(1)
  })

  it('a failed load is retried after 30 s, or at once after retryFailedImages()', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      FakeImage.failing.add(SRC)
      await expect(loadImage(SRC)).rejects.toThrow()
      const n = FakeImage.created.length
      expect(getLoadedImage(SRC)).toBe('error')
      vi.advanceTimersByTime(IMAGE_ERROR_TTL - 1)
      expect(getLoadedImage(SRC)).toBe('error')
      expect(FakeImage.created).toHaveLength(n)
      vi.advanceTimersByTime(1)
      FakeImage.failing.delete(SRC)
      // expired: this access starts a new load
      expect(getLoadedImage(SRC)).toBeUndefined()
      expect(FakeImage.created.length).toBeGreaterThan(n)
      await flushPromises()
      expect(getLoadedImage(SRC)).toBeInstanceOf(FakeImage)

      const other = 'https://cdn.example/b.png'
      FakeImage.failing.add(other)
      await expect(loadImage(other)).rejects.toThrow()
      FakeImage.failing.delete(other)
      retryFailedImages()
      expect(getLoadedImage(other)).toBeUndefined()
      await flushPromises()
      expect(getLoadedImage(other)).toBeInstanceOf(FakeImage)
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects disallowed schemes without creating an image', async () => {
    await expect(loadImage('javascript:alert(1)')).rejects.toThrow()
    expect(getLoadedImage('javascript:alert(1)')).toBe('error')
    expect(FakeImage.created).toHaveLength(0)
  })
})

describe('prepareImage', () => {
  it('prepareImage rejects non-image', async () => {
    await expect(prepareImage(file('text/plain'), null)).rejects.toMatchObject({ code: 'type' })
    await expect(prepareImage(file('image/svg+xml'), null)).rejects.toBeInstanceOf(ImageInsertError)
    // an "image" that does not decode
    FakeImage.failing.add('blob:fake')
    await expect(prepareImage(file('image/png'), null)).rejects.toMatchObject({ code: 'type' })
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake')
  })

  it('fitWithin scales down only, keeping the ratio', () => {
    expect(fitWithin(4000, 3000, 2048)).toEqual({ w: 2048, h: 1536 })
    expect(fitWithin(1000, 3000, 2048)).toEqual({ w: 683, h: 2048 })
    expect(fitWithin(100, 50, 2048)).toEqual({ w: 100, h: 50 })
    expect(fitWithin(5000, 1, 2048)).toEqual({ w: 2048, h: 1 })
    expect(fitWithin(0, 0, 600)).toEqual({ w: 0, h: 0 })
  })

  it('downscales large image data URL path', async () => {
    stubCanvas()
    FakeImage.size = [4000, 3000]
    const sizes: Array<[number, number]> = []
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function (this: HTMLCanvasElement) {
      sizes.push([this.width, this.height])
      return 'data:image/jpeg;base64,AAAA'
    })
    const info = await prepareImage(file('image/jpeg', 1000), null)
    expect(info).toEqual({ src: 'data:image/jpeg;base64,AAAA', naturalW: 2048, naturalH: 1536 })
    expect(sizes).toEqual([[2048, 1536]])
    expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.85)
  })

  it('keeps a PNG with alpha as PNG when downscaling, and rejects over 4 MB after encoding', async () => {
    stubCanvas()
    FakeImage.size = [3000, 3000]
    const big = `data:image/png;base64,${'A'.repeat(Math.ceil((4 * 1024 * 1024 + 10) * 4 / 3))}`
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(big)
    await expect(prepareImage(file('image/png'), null)).rejects.toMatchObject({ code: 'size' })
    // the fake context cannot report pixels: a PNG source is assumed to have alpha
    expect(toDataURL).toHaveBeenCalledWith('image/png')
  })

  it('small images keep their original bytes as a data URL', async () => {
    FakeImage.size = [300, 200]
    const info = await prepareImage(file('image/png', 12), null)
    expect(info.src.startsWith('data:image/png;base64,')).toBe(true)
    expect(info).toMatchObject({ naturalW: 300, naturalH: 200 })
  })

  it('uses uploader when given', async () => {
    FakeImage.size = [5000, 4000]
    const upload = vi.fn(async () => 'https://cdn.example/up.png')
    const f = file('image/png')
    const info = await prepareImage(f, upload)
    expect(upload).toHaveBeenCalledWith(f)
    // no downscale: the uploaded original keeps its size
    expect(info).toEqual({ src: 'https://cdn.example/up.png', naturalW: 5000, naturalH: 4000 })
    await expect(prepareImage(f, async () => { throw new Error('offline') })).rejects.toMatchObject({ code: 'upload' })
    await expect(prepareImage(f, async () => 'javascript:alert(1)')).rejects.toMatchObject({ code: 'upload' })
    // blob: URLs die with the page: refused
    await expect(prepareImage(f, async () => 'blob:https://x/1')).rejects.toMatchObject({ code: 'upload' })
    // an uploader returning a data URL still obeys the 4 MB limit
    const big = `data:image/png;base64,${'A'.repeat(Math.ceil((4 * 1024 * 1024 + 10) * 4 / 3))}`
    await expect(prepareImage(f, async () => big)).rejects.toMatchObject({ code: 'size' })
    expect(await prepareImage(f, async () => 'data:image/png;base64,AAAA')).toMatchObject({ src: 'data:image/png;base64,AAAA' })
  })
})

describe('ToolController.insertImage', () => {
  it('insertImage fits 600 box and is one undo step', () => {
    const { c, store, history } = setup()
    c.setTool('rectangle')
    c.insertImage({ src: SRC, naturalW: 1200, naturalH: 600 }, { x: 100, y: 100 })
    const [el] = store.all() as ImageElement[]
    expect(el).toMatchObject({ type: 'image', src: SRC, naturalW: 1200, naturalH: 600, crop: null, w: 600, h: 300, x: -200, y: -50 })
    expect([...c.selectedIds.value]).toEqual([el!.id])
    expect(c.tool.value).toBe('select')
    history.undo()
    expect(store.all()).toHaveLength(0)

    // small images keep their size; no point → the viewport's top-left area
    c.insertImage({ src: SRC, naturalW: 100, naturalH: 40 }, null)
    expect(store.all()[0]).toMatchObject({ w: 100, h: 40 })
  })

  it('rejects disallowed src and read-only', () => {
    const { c, store } = setup()
    c.insertImage({ src: 'javascript:alert(1)', naturalW: 10, naturalH: 10 }, null)
    c.insertImage({ src: 'blob:https://x/1', naturalW: 10, naturalH: 10 }, null)
    expect(store.all()).toHaveLength(0)
    const ro = setup(true)
    ro.c.insertImage({ src: SRC, naturalW: 10, naturalH: 10 }, null)
    expect(ro.store.all()).toHaveLength(0)
  })

  it('an insert during a gesture is queued and lands when it ends, as its own undo step', () => {
    const { c, store, history } = setup()
    const el = store.create(imageInit())
    history.stopCapturing()
    c.setSelection([el.id])
    c.keyDown(key('Enter'))
    expect(c.cropping.value).toBe(el.id)
    c.insertImage({ src: 'https://cdn.example/q.png', naturalW: 100, naturalH: 50 }, { x: 500, y: 500 })
    expect(store.all()).toHaveLength(1)
    c.pointerDown(ptr(0, 0))
    c.pointerMove(ptr(50, 20))
    c.pointerUp(ptr(50, 20))
    // the pointer gesture ended but crop mode is still a gesture
    expect(store.all()).toHaveLength(1)
    c.keyDown(key('Enter'))
    const all = store.all() as ImageElement[]
    expect(all).toHaveLength(2)
    expect(all[1]).toMatchObject({ src: 'https://cdn.example/q.png', x: 450, y: 475 })
    expect([...c.selectedIds.value]).toEqual([all[1]!.id])
    history.undo()
    expect(store.all()).toHaveLength(1)
    expect(store.get(el.id)).toMatchObject({ crop: { x: 100, y: 40, w: 300, h: 160 } })
    history.undo()
    expect(store.get(el.id)).toMatchObject({ crop: null })

    // queued during a drag: lands on pointerup; dropped when the board turned read-only meanwhile
    c.pointerDown(ptr(1000, 1000))
    c.insertImage({ src: 'https://cdn.example/r.png', naturalW: 10, naturalH: 10 }, null)
    expect(store.all()).toHaveLength(1)
    c.pointerUp(ptr(1000, 1000))
    expect(store.all()).toHaveLength(2)
  })

  it('resize keeps the aspect ratio by default; Shift frees it', () => {
    const { c, store } = setup()
    const el = store.create(imageInit())
    c.setSelection([el.id])
    // se handle at (200, 100) → drag to (300, 120): ratio kept (2:1) → 300×150
    c.pointerDown(ptr(200, 100))
    c.pointerMove(ptr(300, 120))
    c.pointerUp(ptr(300, 120))
    expect(store.get(el.id)).toMatchObject({ w: 300, h: 150 })
    c.pointerDown(ptr(300, 150))
    c.pointerMove(ptr(320, 400, { shift: true }))
    c.pointerUp(ptr(320, 400, { shift: true }))
    expect(store.get(el.id)).toMatchObject({ w: 320, h: 400 })
  })
})

describe('image kind', () => {
  it('placeholder drawn on load error and no throw', async () => {
    FakeImage.mode = 'manual'
    const el = image()
    const ctx = makeFakeCtx(document.createElement('canvas'))
    const keyBefore = imageKind.shapeKey(el)
    expect(() => imageKind.draw(ctx, el, 'light')).not.toThrow()
    expect(ctx.calls.some(c => c.name === 'drawImage')).toBe(false)
    expect(ctx.calls.some(c => c.name === 'setLineDash')).toBe(true)
    expect(ctx.calls.some(c => c.name === 'strokeRect')).toBe(true)
    const glyphLines = ctx.calls.filter(c => c.name === 'lineTo').length
    expect(glyphLines).toBeGreaterThan(0)

    const pending = loadImage(SRC)
    FakeImage.created[0]!.fail()
    await flushPromises()
    // the retry without CORS fails too
    expect(FakeImage.created).toHaveLength(2)
    FakeImage.created[1]!.fail()
    await expect(pending).rejects.toThrow()
    expect(getLoadedImage(SRC)).toBe('error')
    ctx.calls.length = 0
    expect(() => imageKind.draw(ctx, el, 'dark')).not.toThrow()
    expect(ctx.calls.some(c => c.name === 'drawImage')).toBe(false)
    expect(ctx.calls.some(c => c.name === 'strokeRect')).toBe(true)
    // loading and error both draw the placeholder: same bitmap key
    expect(imageKind.shapeKey(el)).toBe(keyBefore)
    expect(() => imageKind.drawLod(ctx, el, 'light', 0.2)).not.toThrow()
  })

  it('draws the cropped region once loaded; the shape key changes with the load state', async () => {
    FakeImage.mode = 'manual'
    const el = image({ crop: { x: 10, y: 20, w: 100, h: 50 } })
    const loaded = vi.fn()
    const off = onImageLoaded(loaded)
    const key0 = shapeKeyOf(el)
    expect(getLoadedImage(SRC)).toBeUndefined()
    FakeImage.created[0]!.load(400, 200)
    await flushPromises()
    expect(loaded).toHaveBeenCalledWith(SRC)
    // same element snapshot: the key is not memoized across the load
    expect(shapeKeyOf(el)).not.toBe(key0)
    const ctx = makeFakeCtx(document.createElement('canvas'))
    kindOf(el).draw(ctx, el, 'light')
    const call = ctx.calls.find(c => c.name === 'drawImage')!
    expect(call.args.slice(1)).toEqual([10, 20, 100, 50, 0, 0, 200, 100])
    off()
  })

  it('the src hash is computed once across snapshots (no re-hash of a data URL while dragging)', () => {
    const src = `data:image/png;base64,${'A'.repeat(100_000)}`
    const before = srcHashCount()
    const a = image({ src, x: 0 })
    const b = image({ src: `${src}`, x: 50, w: 300 })
    imageKind.shapeKey(a)
    imageKind.shapeKey(b)
    imageKind.shapeKey({ ...b, x: 70 })
    expect(srcHashCount() - before).toBe(1)
    expect(imageKind.shapeKey(a)).not.toBe(imageKind.shapeKey(b))
  })

  it('svg uses clipPath when cropped', () => {
    const src = 'https://cdn.example/a.png?x=1&y="2"'
    const plain = imageKind.svg(image({ src }), 'light')
    expect(plain).toContain('<image')
    expect(plain).toContain('preserveAspectRatio="none"')
    expect(plain).toContain('href="https://cdn.example/a.png?x=1&amp;y=&quot;2&quot;"')
    expect(plain).not.toContain('clipPath')

    const cropped = imageKind.svg(image({ crop: { x: 100, y: 50, w: 200, h: 100 } }), 'light')
    expect(cropped).toMatch(/<clipPath id="([^"]+)"><rect x="0" y="0" width="200" height="100"\/><\/clipPath>/)
    const id = /<clipPath id="([^"]+)"/.exec(cropped)![1]
    expect(cropped).toContain(`clip-path="url(#${id})"`)
    // scale 1 (200 units for 200 natural px): the full image is offset by the crop origin
    expect(cropped).toContain('x="-100" y="-50" width="400" height="200"')

    const svg = exportSvg([image({ crop: { x: 100, y: 50, w: 200, h: 100 } })])
    expect(new DOMParser().parseFromString(svg, 'image/svg+xml').querySelector('parsererror')).toBeNull()

    const evil = imageKind.svg(image({ src: 'javascript:alert(1)' }), 'light')
    expect(evil).not.toContain('<image')
    expect(evil).not.toContain('javascript')
  })
})

describe('crop mode', () => {
  it('crop commit adjusts crop and box', () => {
    const { c, store, history } = setup()
    const el = store.create(imageInit())
    c.setSelection([el.id])
    expect(c.keyDown(key('Enter'))).toBe(true)
    expect(c.cropping.value).toBe(el.id)
    expect(c.isGestureActive()).toBe(true)
    // drag the nw crop handle from (0, 0) to (50, 20)
    c.pointerDown(ptr(0, 0))
    c.pointerMove(ptr(50, 20))
    c.pointerUp(ptr(50, 20))
    // nothing is written until the commit
    expect(store.get(el.id)).toMatchObject({ x: 0, y: 0, w: 200, h: 100, crop: null })
    // dragging the se handle beyond the image is clamped to the image
    c.pointerDown(ptr(200, 100))
    c.pointerMove(ptr(260, 150))
    c.pointerUp(ptr(260, 150))
    expect(c.keyDown(key('Enter'))).toBe(true)
    expect(c.cropping.value).toBeNull()
    // scale 0.5 unit/px: crop starts at (100, 40) px; the box keeps the scale
    expect(store.get(el.id)).toMatchObject({ x: 50, y: 20, w: 150, h: 80, crop: { x: 100, y: 40, w: 300, h: 160 } })
    history.undo()
    expect(store.get(el.id)).toMatchObject({ x: 0, y: 0, w: 200, h: 100, crop: null })
  })

  it('the crop commit applies to the current element: a concurrent remote move is kept', () => {
    const { c, store, history } = setup()
    const el = store.create(imageInit())
    history.stopCapturing()
    c.setSelection([el.id])
    c.keyDown(key('Enter'))
    c.pointerDown(ptr(0, 0))
    c.pointerMove(ptr(50, 20))
    c.pointerUp(ptr(50, 20))
    // a peer moves (and scales up) the image meanwhile
    const m = (store.doc.getMap('elements') as Y.Map<Y.Map<unknown>>).get(el.id)!
    store.doc.transact(() => {
      m.set('x', 1000)
      m.set('y', 500)
      m.set('w', 400)
      m.set('h', 200)
    }, 'remote')
    expect(LOCAL_ORIGIN).not.toBe('remote')
    c.keyDown(key('Enter'))
    // same natural crop; offset and size at the peer's scale (1 unit/px) from the peer's position
    expect(store.get(el.id)).toMatchObject({ x: 1100, y: 540, w: 300, h: 160, crop: { x: 100, y: 40, w: 300, h: 160 } })
  })

  it('re-cropping can widen back out to the full image (crop null)', () => {
    const { c, store } = setup()
    const el = store.create(imageInit({ x: 50, y: 20, w: 150, h: 80, crop: { x: 100, y: 40, w: 300, h: 160 } }))
    c.setSelection([el.id])
    c.keyDown(key('Enter'))
    c.pointerDown(ptr(50, 20))
    c.pointerMove(ptr(-100, -100))
    c.pointerUp(ptr(-100, -100))
    c.pointerDown(ptr(200, 100))
    c.pointerMove(ptr(900, 900))
    c.pointerUp(ptr(900, 900))
    c.keyDown(key('Enter'))
    expect(store.get(el.id)).toMatchObject({ x: 0, y: 0, w: 200, h: 100, crop: null })
  })

  it('Escape cancels with no write; double-click enters; click outside commits', () => {
    const { c, store, history } = setup()
    const el = store.create(imageInit())
    history.stopCapturing()
    c.setSelection([el.id])
    c.pointerDown(ptr(100, 50))
    c.pointerUp(ptr(100, 50))
    c.doubleClick({ x: 100, y: 50 })
    expect(c.cropping.value).toBe(el.id)
    c.pointerDown(ptr(0, 0))
    c.pointerMove(ptr(40, 0))
    c.pointerUp(ptr(40, 0))
    expect(c.keyDown(key('Escape'))).toBe(true)
    expect(c.cropping.value).toBeNull()
    expect(store.get(el.id)).toMatchObject({ x: 0, w: 200, crop: null })

    c.keyDown(key('Enter'))
    c.pointerDown(ptr(200, 50))
    c.pointerMove(ptr(160, 50))
    c.pointerUp(ptr(160, 50))
    // a click outside the image commits
    c.pointerDown(ptr(500, 500))
    c.pointerUp(ptr(500, 500))
    expect(c.cropping.value).toBeNull()
    expect(store.get(el.id)).toMatchObject({ x: 0, w: 160, crop: { x: 0, y: 0, w: 320, h: 200 } })
    history.undo()
    expect(store.get(el.id)).toMatchObject({ w: 200, crop: null })
  })

  it('a crop committed after the board turned read-only writes nothing', () => {
    let ro = false
    const doc = new Y.Doc()
    const store = new BoardStore(doc)
    const scene = new Scene(store)
    const history = new History(store)
    const viewport = new Viewport()
    const c = new ToolController({ store, scene, history, viewport, readonly: () => ro, invalidate: vi.fn() })
    const el = store.create(imageInit())
    c.setSelection([el.id])
    c.keyDown(key('Enter'))
    c.pointerDown(ptr(0, 0))
    c.pointerMove(ptr(50, 20))
    c.pointerUp(ptr(50, 20))
    ro = true
    c.commitCrop()
    expect(c.cropping.value).toBeNull()
    expect(store.get(el.id)).toMatchObject({ x: 0, w: 200, crop: null })
  })

  it('the crop overlay draws the dimmed image, the crop rect and 8 handles', () => {
    const { c, store, scene, viewport } = setup()
    const el = store.create(imageInit())
    c.setSelection([el.id])
    c.keyDown(key('Enter'))
    const o = c.overlay()
    expect(o.crop).toMatchObject({ id: el.id, rect: { x: 0, y: 0, w: 200, h: 100 }, full: { x: 0, y: 0, w: 200, h: 100 } })
    // the selection box is hidden while cropping
    expect(o.selectedIds.size).toBe(0)
    const ctx = makeFakeCtx(document.createElement('canvas'))
    renderInteractive(ctx, scene, { viewport, widthCss: 800, heightCss: 600, dpr: 1, theme: 'light', grid: false }, o)
    expect(ctx.calls.filter(k => k.name === 'fillRect')).toHaveLength(8)
    expect(ctx.calls.some(k => k.name === 'clip')).toBe(true)
    expect(ctx.calls.some(k => k.name === 'set:globalAlpha' && k.args[0] === CROP_DIM_ALPHA)).toBe(true)
    // a locked image cannot be cropped
    c.keyDown(key('Escape'))
    store.update(el.id, { locked: true })
    c.setSelection([el.id])
    expect(c.keyDown(key('Enter'))).toBe(false)
    expect(c.cropping.value).toBeNull()
  })
})

describe('clipboard (images)', () => {
  const paste = (el: Record<string, unknown>) =>
    parseClipboard(JSON.stringify({ type: CLIPBOARD_TYPE, version: 1, elements: [el] })) as { elements: ElementInit[] }
  const raw = () => {
    const { id: _i, index: _x, version: _v, ...rest } = image()
    return rest as Record<string, unknown>
  }

  it('keeps allowed srcs, drops blob: and other schemes, clamps the crop', () => {
    expect(paste(raw()).elements[0]).toMatchObject({ type: 'image', src: SRC, naturalW: 400, naturalH: 200, crop: null })
    expect(paste({ ...raw(), src: 'data:image/webp;base64,AA' }).elements).toHaveLength(1)
    for (const src of ['blob:https://x/1', 'javascript:alert(1)', 'data:image/svg+xml,<svg/>', 5, undefined]) {
      expect(paste({ ...raw(), src }).elements, String(src)).toHaveLength(0)
    }
    const r = paste({ ...raw(), crop: { x: -5, y: 150, w: 1000, h: 1000 } }).elements[0] as unknown as ImageElement
    expect(r.crop).toEqual({ x: 0, y: 150, w: 400, h: 50 })
    expect((paste({ ...raw(), crop: { x: 1, y: 1, w: Number.NaN, h: 1 } }).elements[0] as unknown as ImageElement).crop).toBeNull()
    expect((paste({ ...raw(), naturalW: -3 }).elements[0] as unknown as ImageElement).naturalW).toBe(0)
  })

  it('paste prefers text / our payload over an image that only comes from items', () => {
    const png = file('image/png')
    const items = [{ kind: 'file', type: 'image/png', getAsFile: () => png }]
    const data = (text: string, files: File[] = []) =>
      ({ files: files as unknown as FileList, items: items as never, getData: () => text })
    expect(pastedImageFiles(data(''))).toEqual([png])
    expect(pastedImageFiles(data('hello'))).toEqual([])
    expect(pastedImageFiles(data(JSON.stringify({ type: CLIPBOARD_TYPE, version: 1, elements: [] })))).toEqual([])
    // a real file wins over text
    expect(pastedImageFiles(data('hello', [png]))).toEqual([png])
    expect(pastedImageFiles(null)).toEqual([])
  })

  it('clipboardImageFiles picks image files from files, else items', () => {
    const png = file('image/png')
    const txt = file('text/plain')
    expect(clipboardImageFiles({ files: [png, txt] as unknown as FileList, items: [] as never })).toEqual([png])
    const items = [
      { kind: 'string', type: 'text/plain', getAsFile: () => null },
      { kind: 'file', type: 'image/gif', getAsFile: () => png },
    ]
    expect(clipboardImageFiles({ files: [] as unknown as FileList, items: items as never })).toEqual([png])
    expect(clipboardImageFiles(null)).toEqual([])
  })
})

// ---------- board ----------

const wrappers: VueWrapper[] = []

function clip(files: File[], text = '') {
  const clipboardData = { getData: () => text, files, items: [] }
  const e = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(e, 'clipboardData', { value: clipboardData })
  return e
}

async function setupBoard(props: Record<string, unknown> = {}) {
  const provider = memory()
  const connection = await provider.connect('b')
  const wrapper = mount(SketchBoard, { props: { connection, ...props }, attachTo: document.body })
  wrappers.push(wrapper)
  await nextTick()
  const root = wrapper.find('.me-sketch-board')
  ;(root.element as HTMLElement).focus()
  return { wrapper, root, store: new BoardStore(connection.doc) }
}

async function settle() {
  for (let i = 0; i < 5; i++) await flushPromises()
}

describe('SketchBoard images', () => {
  let frames: ReturnType<typeof stubFrames>
  beforeEach(() => {
    stubCanvas()
    frames = stubFrames()
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600)
  })
  afterEach(() => {
    for (const w of wrappers.splice(0)) w.unmount()
    vi.useRealTimers()
  })

  it('paste of image file inserts', async () => {
    FakeImage.size = [1200, 900]
    const upload = vi.fn(async () => 'https://cdn.example/pasted.png')
    const { root, store } = await setupBoard({ uploadImage: upload })
    const e = clip([file('image/png')])
    root.element.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
    await settle()
    const [el] = store.all() as ImageElement[]
    expect(el).toMatchObject({ type: 'image', src: 'https://cdn.example/pasted.png', w: 600, h: 450 })
    // centered in the view (empty board: scene origin at the canvas center)
    expect(el!.x + el!.w / 2).toBeCloseTo(0)
    expect(el!.y + el!.h / 2).toBeCloseTo(0)
  })

  it('drop inserts at the drop point; a non-image shows the type error for 4 s', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const upload = vi.fn(async () => 'https://cdn.example/dropped.png')
    const { root, store, wrapper } = await setupBoard({ uploadImage: upload, locale: 'en' })
    const drop = (files: File[]) => {
      const e = new Event('drop', { bubbles: true, cancelable: true })
      Object.assign(e, { clientX: 500, clientY: 400 })
      Object.defineProperty(e, 'dataTransfer', { value: { files, types: ['Files'] } })
      root.element.dispatchEvent(e)
      return e
    }
    const over = new Event('dragover', { bubbles: true, cancelable: true })
    Object.defineProperty(over, 'dataTransfer', { value: { types: ['Files'], dropEffect: 'none' } })
    root.element.dispatchEvent(over)
    expect(over.defaultPrevented).toBe(true)

    expect(drop([file('image/png')]).defaultPrevented).toBe(true)
    await settle()
    const [el] = store.all()
    expect(el!.x + el!.w / 2).toBeCloseTo(100)
    expect(el!.y + el!.h / 2).toBeCloseTo(100)

    drop([file('application/pdf')])
    await settle()
    await nextTick()
    expect(wrapper.find('.me-sketch-toast').text()).toBe(messages.en.imageError.type)
    vi.advanceTimersByTime(4000)
    await nextTick()
    expect(wrapper.find('.me-sketch-toast').exists()).toBe(false)
  })

  it('insertImage() opens a hidden image file picker; a failed upload shows the upload error', async () => {
    const upload = vi.fn(async () => { throw new Error('offline') })
    const { wrapper } = await setupBoard({ uploadImage: upload })
    const input = wrapper.find('input[type="file"]')
    expect(input.attributes('accept')).toBe('image/*')
    const click = vi.spyOn(input.element as HTMLInputElement, 'click').mockImplementation(() => {})
    ;(wrapper.vm as unknown as { insertImage: () => void }).insertImage()
    expect(click).toHaveBeenCalled()
    Object.defineProperty(input.element, 'files', { value: [file('image/png')], configurable: true })
    await input.trigger('change')
    await settle()
    await nextTick()
    expect(upload).toHaveBeenCalled()
    expect(wrapper.find('.me-sketch-toast').text()).toBe(messages.vi.imageError.upload)
  })

  it('mounting a board retries failed images', async () => {
    FakeImage.failing.add(SRC)
    await expect(loadImage(SRC)).rejects.toThrow()
    expect(getLoadedImage(SRC)).toBe('error')
    FakeImage.failing.delete(SRC)
    await setupBoard()
    expect(getLoadedImage(SRC)).toBeUndefined()
  })

  it('an image load invalidates the board and prunes stale bitmaps', async () => {
    FakeImage.mode = 'manual'
    const { store } = await setupBoard()
    const el = store.create(imageInit())
    await nextTick()
    frames.flush()
    // rendering the placeholder started the load
    const img = FakeImage.created.find(i => i.src === SRC)
    expect(img).toBeDefined()
    const prune = vi.spyOn(BitmapCache.prototype, 'pruneElement')
    img!.load(400, 200)
    await settle()
    expect(getLoadedImage(SRC)).toBe(img)
    expect(prune).toHaveBeenCalledWith(el.id, expect.stringMatching(new RegExp(`^${el.id}:`)))
    expect(frames.pending).toBeGreaterThan(0)
    frames.flush()
  })
})
