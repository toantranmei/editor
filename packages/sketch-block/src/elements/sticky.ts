import { escXml } from '../io/xml'
import type { FontSize, StickyElement, TextStyle } from '../model/types'
import type { Theme } from '../render/shapes'
import { LINE_HEIGHT } from '../text/fonts'
import { measureText } from '../text/measure'
import { type ElementKind, hashString } from './kind'
import { drawTextBlock, svgTextBlock, type TextBlock } from './text'

/** Auto-fit candidates, largest first: the first one whose wrapped text fits the padded box wins. */
export const STICKY_FONT_SIZES = [36, 28, 20, 16, 12] as const
const STICKY_MIN_FONT = 12
/** Padding between the sticky's edge and its text, scene units (the text box is w-24 × h-24). */
export const STICKY_PAD = 12
/** Sticky text is always dark: the pastel fill stays the same in the dark theme. */
export const STICKY_TEXT_COLOR = '#1e1e1e'
const RADIUS = 4
const SHADOW = { color: 'rgba(0,0,0,.15)', blur: 6, offsetY: 2 } as const

type StickyFit = Pick<StickyElement, 'w' | 'h' | 'text' | 'fontFamily' | 'textAlign'>

const styleAt = (el: StickyFit, fontSize: number): TextStyle =>
  // 12 is below the free-text sizes; the measurer only needs the number
  ({ fontFamily: el.fontFamily, fontSize: fontSize as FontSize, textAlign: el.textAlign })

/** The largest of STICKY_FONT_SIZES at which `text` (default: the sticky's) fits within (w-24) × (h-24); else 12. */
export function stickyFontSize(el: StickyFit, text: string = el.text): number {
  const maxW = Math.max(0, el.w - 2 * STICKY_PAD)
  const maxH = Math.max(0, el.h - 2 * STICKY_PAD)
  for (const size of STICKY_FONT_SIZES) {
    const m = measureText(text, styleAt(el, size), maxW)
    if (m.w <= maxW && m.h <= maxH) return size
  }
  return STICKY_MIN_FONT
}

/**
 * Text layout in the sticky's local frame at the auto-fit size: the padded box width, every wrapped line, and
 * the visible block (`h`, at most the padded height but one line at least) centered vertically at `y`.
 */
export function stickyLayout(el: StickyFit, text: string = el.text) {
  const fontSize = stickyFontSize(el, text)
  const style = styleAt(el, fontSize)
  const w = Math.max(0, el.w - 2 * STICKY_PAD)
  const lh = fontSize * LINE_HEIGHT
  const { lines } = measureText(text, style, w)
  const maxLines = Math.max(1, Math.floor(Math.max(0, el.h - 2 * STICKY_PAD) / lh))
  const h = Math.min(lines.length, maxLines) * lh
  return { style, lines, maxLines, x: STICKY_PAD, y: (el.h - h) / 2, w, h, fontSize }
}

/** Lines that overflow even at the smallest size are dropped (the editor still shows them). */
function stickyBlock(el: StickyElement): TextBlock {
  const l = stickyLayout(el)
  return { lines: l.lines.slice(0, l.maxLines), style: l.style, color: STICKY_TEXT_COLOR, x: l.x, y: l.y, w: l.w }
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const r = Math.min(RADIUS, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Device px per scene unit of the current transform (canvas shadows ignore the transform). */
function deviceScale(ctx: CanvasRenderingContext2D): number {
  const t = typeof ctx.getTransform === 'function' ? ctx.getTransform() : undefined
  return t && Number.isFinite(t.a) ? Math.hypot(t.a, t.b) || 1 : 1
}

const num = (n: number): string => String(Math.round(n * 100) / 100)

/** Sticky note: a solid pastel rounded rect with a soft shadow and auto-fit, centered text. */
export const stickyKind: ElementKind<StickyElement> = {
  visualPad: () => 8,

  shapeKey: el => hashString(JSON.stringify(['sticky', el.w, el.h, el.color, el.text, el.fontFamily, el.textAlign])),

  draw(ctx, el) {
    const s = deviceScale(ctx)
    ctx.save()
    ctx.shadowColor = SHADOW.color
    ctx.shadowBlur = SHADOW.blur * s
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = SHADOW.offsetY * s
    roundRectPath(ctx, 0, 0, el.w, el.h)
    ctx.fillStyle = el.color
    ctx.fill()
    ctx.restore()
    drawTextBlock(ctx, stickyBlock(el))
  },

  drawLod(ctx, el) {
    ctx.save()
    ctx.translate(-el.w / 2, -el.h / 2)
    ctx.beginPath()
    ctx.rect(0, 0, el.w, el.h)
    ctx.fillStyle = el.color
    ctx.fill()
    drawTextBlock(ctx, stickyBlock(el))
    ctx.restore()
  },

  svg: (el, _theme: Theme) =>
    `<rect x="0" y="0" width="${num(el.w)}" height="${num(el.h)}" rx="${RADIUS}" fill="${escXml(el.color)}"/>`
    + svgTextBlock(stickyBlock(el)),

  hit: (el, local, tol) =>
    local.x >= -tol && local.x <= el.w + tol && local.y >= -tol && local.y <= el.h + tol,

  resize: (_el, next) => ({ x: next.x, y: next.y, w: next.w, h: next.h }),
}
