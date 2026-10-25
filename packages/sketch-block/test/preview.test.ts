import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makePreview } from '../src/io/svg'
import { DEFAULT_STYLE, type SketchElement } from '../src/model/types'
import { ctxOf, type FakeCtx } from './helpers/canvas'

// the image cache, controlled per test (happy-dom never loads images)
const loader = vi.hoisted(() => ({
  img: { naturalWidth: 200, naturalHeight: 160, tag: 'fake-img' } as unknown as HTMLImageElement,
  tainted: new Set<string>(),
  failed: new Set<string>(),
  pending: new Set<string>(),
}))
vi.mock('../src/io/image-loader', async orig => ({
  ...(await orig<typeof import('../src/io/image-loader')>()),
  loadImage: vi.fn((src: string) => {
    if (loader.pending.has(src)) return new Promise(() => {})
    return loader.failed.has(src) ? Promise.reject(new Error('x')) : Promise.resolve(loader.img)
  }),
  getLoadedImage: vi.fn((src: string) =>
    loader.failed.has(src) ? 'error' : loader.pending.has(src) ? undefined : loader.img),
  isImageTainted: vi.fn((src: string) => loader.tainted.has(src)),
}))

const base = { angle: 0, version: 1, locked: false, ...DEFAULT_STYLE, groupIds: [], frameId: null }
const rect = (over: Record<string, unknown> = {}): SketchElement => ({
  ...base, id: 'a', type: 'rectangle', x: 0, y: 0, w: 100, h: 50, index: 'a0', seed: 7, label: '', ...over,
} as SketchElement)
const image = (over: Record<string, unknown> = {}): SketchElement => ({
  ...base, id: 'i', type: 'image', x: 200, y: 0, w: 100, h: 80, index: 'a1', seed: 3,
  src: 'https://example.com/a.png', naturalW: 200, naturalH: 160, crop: null, ...over,
} as SketchElement)

/** Canvases the preview created, with their recording contexts. */
let canvases: HTMLCanvasElement[]
let toBlob: ReturnType<typeof vi.fn>

beforeEach(() => {
  canvases = []
  loader.tainted.clear()
  loader.failed.clear()
  loader.pending.clear()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    if (!canvases.includes(this)) canvases.push(this)
    return ctxOf(this) as never
  } as never)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,UE5H')
  toBlob = vi.fn((cb: BlobCallback) => cb(new Blob(['png'], { type: 'image/png' })))
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(toBlob as never)
})
afterEach(() => {
  vi.restoreAllMocks()
})

const drewImg = (ctx: FakeCtx) => ctx.calls.some(c => c.name === 'drawImage' && c.args[0] === loader.img)
const drewPlaceholder = (ctx: FakeCtx) => ctx.calls.some(c => c.name === 'strokeRect')

describe('makePreview with images', () => {
  it('preview with image uses canvas path', async () => {
    const rasterize = vi.fn()
    const p = await makePreview([rect({ w: 3000 }), image()], { rasterize })
    expect(rasterize).not.toHaveBeenCalled()
    // encoded once (toBlob); the data URL is read from the blob
    expect(p!.blob.type).toBe('image/png')
    expect(p!.dataUrl).toBe(`data:image/png;base64,${btoa('png')}`)
    expect(toBlob).toHaveBeenCalledTimes(1)
    expect(HTMLCanvasElement.prototype.toDataURL).not.toHaveBeenCalled()
    expect(canvases).toHaveLength(1)
    // a white card: the background is filled before anything else is drawn
    const calls = ctxOf(canvases[0]!).calls
    const firstDraw = calls.findIndex(c => ['fillRect', 'stroke', 'fill', 'drawImage', 'strokeRect'].includes(c.name))
    expect(calls[firstDraw]!.name).toBe('fillRect')
    expect(calls.slice(0, firstDraw).filter(c => c.name === 'set:fillStyle').at(-1)!.args[0]).toBe('#ffffff')
    expect(calls[firstDraw]!.args).toEqual([expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number)])
    // at most 1200 px wide, drawn from the image cache
    expect(canvases[0]!.width).toBeLessThanOrEqual(1200)
    expect(canvases[0]!.width).toBeGreaterThan(1100)
    expect(drewImg(ctxOf(canvases[0]!))).toBe(true)
    expect(drewPlaceholder(ctxOf(canvases[0]!))).toBe(false)

    // a small board is not upscaled
    canvases = []
    await makePreview([rect(), image()])
    // bounds -6..302 (visual pads 6 and 2) plus 16 px padding each side, at scale 1
    expect(canvases[0]!.width).toBe(340)
  })

  it('the canvas path is injectable', async () => {
    const png = { dataUrl: 'data:image/png;base64,AA', blob: new Blob(['x'], { type: 'image/png' }) }
    const rasterizeScene = vi.fn(async () => png)
    expect(await makePreview([rect(), image()], { rasterizeScene })).toBe(png)
    expect(rasterizeScene).toHaveBeenCalledWith(expect.any(Array), { maxWidth: 1200, images: true })
    // boards without images keep the svg path
    rasterizeScene.mockClear()
    const p = await makePreview([rect()], { rasterizeScene })
    expect(rasterizeScene).not.toHaveBeenCalled()
    expect(p!.dataUrl.startsWith('data:image/svg+xml;base64,')).toBe(true)
  })

  it('tainted canvas falls back without images and does not throw', async () => {
    toBlob.mockImplementationOnce(() => {
      throw new DOMException('Tainted canvases may not be exported.', 'SecurityError')
    })
    const p = await makePreview([rect(), image()])
    expect(p!.dataUrl.startsWith('data:image/png;base64,')).toBe(true)
    expect(canvases).toHaveLength(2)
    expect(drewImg(ctxOf(canvases[0]!))).toBe(true)
    // the re-render draws placeholders instead of images
    expect(drewImg(ctxOf(canvases[1]!))).toBe(false)
    expect(drewPlaceholder(ctxOf(canvases[1]!))).toBe(true)

    // injected: the second call asks for no images
    const png = { dataUrl: 'data:image/png;base64,AA', blob: new Blob(['x'], { type: 'image/png' }) }
    const rasterizeScene = vi.fn(async (_els: readonly SketchElement[], o: { images: boolean }) => {
      if (o.images) throw new DOMException('tainted', 'SecurityError')
      return png
    })
    expect(await makePreview([image()], { rasterizeScene })).toBe(png)
    expect(rasterizeScene.mock.calls.map(c => c[1].images)).toEqual([true, false])

    // other errors are not swallowed
    await expect(makePreview([image()], { rasterizeScene: async () => { throw new Error('boom') } }))
      .rejects.toThrow('boom')
  })

  it('known-tainted and failed images are drawn as placeholders', async () => {
    loader.tainted.add('https://example.com/t.png')
    loader.failed.add('https://example.com/f.png')
    await makePreview([image({ src: 'https://example.com/t.png' }), image({ id: 'j', src: 'https://example.com/f.png' })])
    expect(canvases).toHaveLength(1)
    const ctx = ctxOf(canvases[0]!)
    expect(drewImg(ctx)).toBe(false)
    expect(ctx.calls.filter(c => c.name === 'strokeRect')).toHaveLength(2)
  })

  it('image loads are awaited with a cap', async () => {
    loader.pending.add('https://example.com/slow.png')
    const start = Date.now()
    const p = await makePreview([image({ src: 'https://example.com/slow.png' })], { imageWaitMs: 20 })
    expect(Date.now() - start).toBeLessThan(1000)
    expect(p!.dataUrl.startsWith('data:image/png;base64,')).toBe(true)
    expect(drewPlaceholder(ctxOf(canvases[0]!))).toBe(true)
  })
})
