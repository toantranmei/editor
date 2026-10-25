import { getLoadedImage } from '../io/image-loader'
import { escXml } from '../io/xml'
import { type ImageCrop, type ImageElement, isImageSrc } from '../model/types'
import type { Theme } from '../render/shapes'
import { type ElementKind, hashString } from './kind'

const PLACEHOLDER_DASH = [6, 4]
const PLACEHOLDER_COLOR: Record<Theme, string> = { light: '#adb5bd', dark: '#5c636a' }
/** Largest side of the placeholder's "image" glyph, scene units. */
const GLYPH_MAX = 24

const num = (n: number): string => String(Math.round(n * 100) / 100)

/**
 * The region of the natural image the element shows, in natural px: its `crop` when it is a non-empty rect,
 * else the whole image (natural size from the element, or from the decoded image when the element lacks it).
 */
export function effectiveCrop(el: ImageElement, img?: { naturalWidth: number; naturalHeight: number }): ImageCrop {
  const c = el.crop
  if (c && c.w > 0 && c.h > 0) return c
  return { x: 0, y: 0, w: el.naturalW || img?.naturalWidth || 0, h: el.naturalH || img?.naturalHeight || 0 }
}

/** Dashed box with a small mountain-and-sun "image" glyph drawn with lines, centered; box (0,0)–(w,h). */
export function drawImagePlaceholder(ctx: CanvasRenderingContext2D, w: number, h: number, theme: Theme): void {
  ctx.save()
  ctx.strokeStyle = PLACEHOLDER_COLOR[theme]
  ctx.lineWidth = 1
  ctx.setLineDash(PLACEHOLDER_DASH)
  ctx.strokeRect(0, 0, w, h)
  ctx.setLineDash([])
  const s = Math.min(GLYPH_MAX, w / 3, h / 3)
  if (s > 4) {
    const x = (w - s) / 2
    const y = (h - s * 0.8) / 2
    const gh = s * 0.8
    ctx.beginPath()
    // frame
    ctx.moveTo(x, y)
    ctx.lineTo(x + s, y)
    ctx.lineTo(x + s, y + gh)
    ctx.lineTo(x, y + gh)
    ctx.closePath()
    // mountains
    ctx.moveTo(x, y + gh)
    ctx.lineTo(x + s * 0.35, y + gh * 0.45)
    ctx.lineTo(x + s * 0.6, y + gh * 0.75)
    ctx.lineTo(x + s * 0.75, y + gh * 0.6)
    ctx.lineTo(x + s, y + gh)
    // sun (a small square of lines)
    const r = s * 0.08
    ctx.moveTo(x + s * 0.72 - r, y + gh * 0.28 - r)
    ctx.lineTo(x + s * 0.72 + r, y + gh * 0.28 - r)
    ctx.lineTo(x + s * 0.72 + r, y + gh * 0.28 + r)
    ctx.lineTo(x + s * 0.72 - r, y + gh * 0.28 + r)
    ctx.closePath()
    ctx.stroke()
  }
  ctx.restore()
}

/** The decoded image for `el`, or null (loading, failed or not allowed). Starts the load on first use. */
function loadedImage(el: ImageElement): HTMLImageElement | null {
  const img = getLoadedImage(el.src)
  return img && img !== 'error' ? img : null
}

/** Draws the cropped region of `el`'s image into (0,0)–(w,h), or the placeholder; never throws. */
function drawImageEl(ctx: CanvasRenderingContext2D, el: ImageElement, theme: Theme): void {
  const img = loadedImage(el)
  if (img) {
    const c = effectiveCrop(el, img)
    if (c.w > 0 && c.h > 0) {
      try {
        ctx.drawImage(img, c.x, c.y, c.w, c.h, 0, 0, el.w, el.h)
        return
      } catch {
        // a broken / undecodable image: fall through to the placeholder
      }
    }
  }
  drawImagePlaceholder(ctx, el.w, el.h, theme)
}

/** Static (per-element) part of the shape key, memoized per element snapshot: hashing a data URL is O(size). */
const staticKeys = new WeakMap<ImageElement, string>()

function staticKey(el: ImageElement): string {
  let k = staticKeys.get(el)
  if (k === undefined) staticKeys.set(el, (k = hashString(JSON.stringify(['image', el.src, el.crop, el.w, el.h]))))
  return k
}

/** clipPath ids must be valid XML names and unique per element. */
const clipId = (el: ImageElement): string => `me-clip-${el.id.replace(/[^\w-]/g, '_')}`

/**
 * Image: the cropped region of the natural image stretched over the box. A dashed placeholder is drawn while
 * the image loads or when it failed. The shape key includes the load state (it is volatile, so `shapeKeyOf`
 * re-reads it) so the bitmap is rebuilt once the image arrives.
 */
export const imageKind: ElementKind<ImageElement> = {
  visualPad: () => 2,

  volatileKey: true,

  // loading and error draw the same placeholder: only "loaded" changes the bitmap
  shapeKey: el => `${staticKey(el)}_${loadedImage(el) ? 'l' : 'p'}`,

  draw: (ctx, el, theme) => drawImageEl(ctx, el, theme),

  drawLod(ctx, el, theme) {
    ctx.save()
    ctx.translate(-el.w / 2, -el.h / 2)
    drawImageEl(ctx, el, theme)
    ctx.restore()
  },

  svg(el, theme) {
    const w = num(el.w)
    const h = num(el.h)
    if (!isImageSrc(el.src)) {
      return `<rect x="0" y="0" width="${w}" height="${h}" fill="none" stroke="${PLACEHOLDER_COLOR[theme]}" stroke-dasharray="6 4"/>`
    }
    const href = escXml(el.src)
    const c = el.crop
    const nw = el.naturalW
    const nh = el.naturalH
    if (!c || !(c.w > 0 && c.h > 0) || !(nw > 0 && nh > 0)) {
      return `<image href="${href}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none"/>`
    }
    // scale the whole image so the crop region lands on the box, and clip to the box
    const sx = el.w / c.w
    const sy = el.h / c.h
    const id = clipId(el)
    return `<clipPath id="${id}"><rect x="0" y="0" width="${w}" height="${h}"/></clipPath>`
      + `<image href="${href}" x="${num(-c.x * sx)}" y="${num(-c.y * sy)}" width="${num(nw * sx)}" height="${num(nh * sy)}" `
      + `preserveAspectRatio="none" clip-path="url(#${id})"/>`
  },

  hit: (el, local, tol) =>
    local.x >= -tol && local.x <= el.w + tol && local.y >= -tol && local.y <= el.h + tol,

  // the aspect ratio is kept by the select tool (it knows about Shift); here the box is taken as given
  resize: (_el, next) => ({ x: next.x, y: next.y, w: next.w, h: next.h }),
}
