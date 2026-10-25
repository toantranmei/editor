import { clipFrame } from '../elements/frame'
import { drawImagePlaceholder } from '../elements/image'
import { kindOf } from '../elements/kind'
import { boxCenter, elementBounds } from '../geometry/bounds'
import { isFrame, isImage, type SketchElement } from '../model/types'
import { bitmapPad, bitmapScale, buildBitmap } from '../render/bitmap-cache'
import { getLoadedImage, isImageTainted, loadImage } from './image-loader'
import { escXml } from './xml'

const SVG_PREVIEW_LIMIT = 150_000
const PNG_MAX_WIDTH = 1200
/** Tallest canvas the image preview path draws (a very tall board is scaled down further). */
const PNG_MAX_HEIGHT = 4096
/** How long the image preview waits for images to load, ms (then draws placeholders for the rest). */
const IMAGE_WAIT_MS = 3000
const PADDING = 16

export interface ExportSvgOptions { padding?: number; background?: string | null }
export interface PreviewResult { dataUrl: string; blob: Blob }
export interface SceneRasterOptions {
  maxWidth: number
  /** false: images are drawn as placeholders (the re-render after a tainted canvas). */
  images: boolean
}
export interface PreviewOptions {
  /** SVG → PNG for large boards without images (default: draws the SVG onto a canvas). */
  rasterize?: (svg: string, maxWidth: number) => Promise<PreviewResult>
  /** Elements → PNG for boards with images (default: draws each kind onto a canvas, images from the cache). */
  rasterizeScene?: (elements: readonly SketchElement[], opts: SceneRasterOptions) => Promise<PreviewResult>
  /** Cap on waiting for images to load, ms (default 3000). */
  imageWaitMs?: number
}

const num = (n: number): string => String(Math.round(n * 100) / 100)

function elementSvg(el: SketchElement): string {
  const body = kindOf(el).svg(el, 'light')
  const attrs: string[] = []
  if (el.angle) {
    const c = boxCenter(el)
    attrs.push(`transform="rotate(${num((el.angle * 180) / Math.PI)} ${num(c.x)} ${num(c.y)})"`)
  }
  if (el.opacity < 1) attrs.push(`opacity="${num(el.opacity)}"`)
  return `<g${attrs.length ? ` ${attrs.join(' ')}` : ''}><g transform="translate(${num(el.x)} ${num(el.y)})">${body}</g></g>`
}

/** Bounds of the elements (visual pads included) grown by `padding`. */
function paddedBounds(elements: readonly SketchElement[], padding: number): { x: number; y: number; w: number; h: number } {
  let minX = 0, minY = 0, maxX = 0, maxY = 0
  elements.forEach((el, i) => {
    const b = elementBounds(el)
    if (i === 0) ({ minX, minY, maxX, maxY } = b)
    else {
      minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY)
      maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY)
    }
  })
  return { x: minX - padding, y: minY - padding, w: maxX - minX + padding * 2, h: maxY - minY + padding * 2 }
}

/** Standalone SVG of the elements, in the given (z-)order. */
export function exportSvg(elements: readonly SketchElement[], opts: ExportSvgOptions = {}): string {
  const { x, y, w, h } = paddedBounds(elements, opts.padding ?? PADDING)
  const bg = opts.background
    ? `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" fill="${escXml(opts.background)}"/>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${num(x)} ${num(y)} ${num(w)} ${num(h)}" width="${num(w)}" height="${num(h)}">${bg}${elements.map(elementSvg).join('')}</svg>`
}

function toBase64(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

/** Browser-only: draw the SVG onto a canvas (max `maxWidth` px wide) and return a PNG. */
async function rasterizeInBrowser(svg: string, maxWidth: number): Promise<PreviewResult> {
  const url = `data:image/svg+xml;base64,${toBase64(svg)}`
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('svg rasterize failed'))
    img.src = url
  })
  const scale = Math.min(1, maxWidth / (img.width || maxWidth))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.width * scale))
  canvas.height = Math.max(1, Math.round(img.height * scale))
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'))
  return { dataUrl: canvas.toDataURL('image/png'), blob }
}

/** A blob as a data URL. */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'))
    reader.readAsDataURL(blob)
  })
}

/** PNG of a canvas, encoded once (the data URL is read from the blob); throws a SecurityError when tainted. */
async function encodePng(canvas: HTMLCanvasElement): Promise<PreviewResult> {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'))
  return { dataUrl: await blobToDataUrl(blob), blob }
}

/** Waits (at most `ms`) for the images' loads; failures are fine (they draw as placeholders). */
async function awaitImages(srcs: readonly string[], ms: number): Promise<void> {
  if (!srcs.length) return
  let timer: ReturnType<typeof setTimeout> | undefined
  const cap = new Promise<void>(resolve => (timer = setTimeout(resolve, ms)))
  await Promise.race([Promise.allSettled(srcs.map(src => loadImage(src))), cap])
  clearTimeout(timer)
}

/** Draws one element in its frame: its kind's `draw` (or a placeholder for an image left out). */
function drawPreviewElement(ctx: CanvasRenderingContext2D, el: SketchElement, scale: number, images: boolean): void {
  ctx.translate(el.x + el.w / 2, el.y + el.h / 2)
  if (el.angle) ctx.rotate(el.angle)
  const kind = kindOf(el)
  if (isImage(el) && (!images || isImageTainted(el.src))) {
    ctx.translate(-el.w / 2, -el.h / 2)
    drawImagePlaceholder(ctx, el.w, el.h, 'light')
  } else if (kind.knockout?.(el)) {
    // it cuts pixels out of its target: draw it onto its own bitmap first
    const bmp = buildBitmap(el, scale, 1, 'light')
    const pad = bitmapPad(el)
    const s = bitmapScale(el, scale, 1)
    ctx.drawImage(bmp, -el.w / 2 - pad, -el.h / 2 - pad, bmp.width / s, bmp.height / s)
  } else {
    ctx.translate(-el.w / 2, -el.h / 2)
    kind.draw(ctx, el, 'light', { dpr: scale })
  }
}

/**
 * Browser-only: draws the elements (light theme, on white) onto a canvas at most `maxWidth` px
 * wide and returns a PNG. Images come from the image cache (loads awaited up to `waitMs`); with `images` false,
 * or for an image known to taint the canvas, a placeholder is drawn instead.
 */
async function rasterizeSceneInBrowser(
  elements: readonly SketchElement[], opts: SceneRasterOptions, waitMs = IMAGE_WAIT_MS,
): Promise<PreviewResult> {
  if (opts.images) {
    const srcs = [...new Set(elements.filter(isImage).map(el => el.src))]
    await awaitImages(srcs.filter(src => !isImageTainted(src)), waitMs)
    // start lookups for the draw (and for later boards)
    for (const src of srcs) getLoadedImage(src)
  }
  const b = paddedBounds(elements, PADDING)
  const scale = Math.min(1, opts.maxWidth / b.w, PNG_MAX_HEIGHT / b.h)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(b.w * scale))
  canvas.height = Math.max(1, Math.round(b.h * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('sketch-block: no 2d canvas context')
  // a white card: readable in both editor themes (PNG previews are not inverted in dark mode)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  const frames = new Map(elements.filter(isFrame).map(f => [f.id, f]))
  const base = (): void => ctx.setTransform(scale, 0, 0, scale, -b.x * scale, -b.y * scale)
  for (const el of elements) {
    base()
    ctx.save()
    // a frame's children are clipped to its box, as on the board
    const frame = el.frameId ? clipFrame(el, frames.get(el.frameId)) : null
    if (frame) {
      ctx.beginPath()
      ctx.rect(frame.x, frame.y, frame.w, frame.h)
      ctx.clip()
    }
    ctx.globalAlpha = el.opacity
    try {
      drawPreviewElement(ctx, el, scale, opts.images)
    } finally {
      ctx.restore()
    }
  }
  return encodePng(canvas)
}

const isSecurityError = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'SecurityError'

/**
 * Preview image for the document node. A board with images is drawn onto a canvas (PNG, max 1200 px wide; a
 * canvas tainted by a cross-origin image is re-drawn with placeholders); otherwise an SVG data URL when small,
 * else a PNG of the SVG (max 1200 px wide).
 */
export async function makePreview(
  elements: readonly SketchElement[],
  opts: PreviewOptions = {},
): Promise<PreviewResult | null> {
  if (elements.length === 0) return null
  if (elements.some(isImage)) {
    const raster = opts.rasterizeScene
      ?? ((els: readonly SketchElement[], o: SceneRasterOptions) => rasterizeSceneInBrowser(els, o, opts.imageWaitMs))
    try {
      return await raster(elements, { maxWidth: PNG_MAX_WIDTH, images: true })
    } catch (err) {
      if (!isSecurityError(err)) throw err
      return raster(elements, { maxWidth: PNG_MAX_WIDTH, images: false })
    }
  }
  const svg = exportSvg(elements)
  const dataUrl = `data:image/svg+xml;base64,${toBase64(svg)}`
  if (dataUrl.length <= SVG_PREVIEW_LIMIT) {
    return { dataUrl, blob: new Blob([svg], { type: 'image/svg+xml' }) }
  }
  return (opts.rasterize ?? rasterizeInBrowser)(svg, PNG_MAX_WIDTH)
}
