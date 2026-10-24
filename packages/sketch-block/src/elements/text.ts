import type { TextAlign, TextElement, TextStyle } from '../model/types'
import { displayColor, type Theme } from '../render/shapes'
import { FONT_FAMILIES, LINE_HEIGHT } from '../text/fonts'
import { fontString, measureText, wrapText } from '../text/measure'
import { type ElementKind, hashString } from './kind'
import { escXml } from '../io/xml'

/** Below this on-screen font size (CSS px) LOD drawing skips text: it would be an unreadable smudge. */
export const MIN_LOD_TEXT_PX = 4

/** Where lines go: a box (x, y, w) in the local frame; lines start at `y`, one line height apart. */
export interface TextBlock {
  lines: string[]
  style: TextStyle
  color: string
  x: number
  y: number
  w: number
}

const num = (n: number): string => String(Math.round(n * 100) / 100)

function anchorX(align: TextAlign, x: number, w: number): number {
  return align === 'left' ? x : align === 'right' ? x + w : x + w / 2
}

const SVG_ANCHOR: Record<TextAlign, string> = { left: 'start', center: 'middle', right: 'end' }

/** fillText each line, vertically centered in its line box. */
export function drawTextBlock(ctx: CanvasRenderingContext2D, b: TextBlock): void {
  const lh = b.style.fontSize * LINE_HEIGHT
  ctx.font = fontString(b.style)
  ctx.fillStyle = b.color
  ctx.textAlign = b.style.textAlign
  ctx.textBaseline = 'middle'
  const x = anchorX(b.style.textAlign, b.x, b.w)
  b.lines.forEach((line, i) => ctx.fillText(line, x, b.y + i * lh + lh / 2))
}

/** One <text> with a <tspan> per line (same layout as drawTextBlock). */
export function svgTextBlock(b: TextBlock): string {
  const lh = b.style.fontSize * LINE_HEIGHT
  const x = num(anchorX(b.style.textAlign, b.x, b.w))
  const spans = b.lines
    .map((line, i) => `<tspan x="${x}" y="${num(b.y + i * lh + lh / 2)}">${escXml(line)}</tspan>`)
    .join('')
  return `<text font-family="${escXml(FONT_FAMILIES[b.style.fontFamily])}" font-size="${b.style.fontSize}"`
    + ` fill="${escXml(b.color)}" text-anchor="${SVG_ANCHOR[b.style.textAlign]}" dominant-baseline="middle"`
    + ` xml:space="preserve">${spans}</text>`
}

/** Share of a width change taken on the left, so the aligned edge (or center) stays put. */
const ALIGN_SHIFT: Record<TextAlign, number> = { left: 0, center: 0.5, right: 1 }

/**
 * Box of `el` holding `text` instead of its current text. autoSize: sized to the text, keeping the aligned
 * edge (or center) in place; otherwise the width is kept and the height fits the wrapped lines.
 */
export function editedTextBox(el: TextElement, text: string): { x: number; w: number; h: number } {
  if (!el.autoSize) return { x: el.x, w: el.w, h: measureText(text, el, el.w).h }
  const { w, h } = measureText(text, el, null)
  return { x: el.x + (el.w - w) * ALIGN_SHIFT[el.textAlign], w, h }
}

function textBlock(el: TextElement, theme: Theme): TextBlock {
  return {
    lines: wrapText(el.text, el, el.autoSize ? null : el.w),
    style: el,
    color: displayColor(el.stroke, theme),
    x: 0,
    y: 0,
    w: el.w,
  }
}

/** Free-standing text. autoSize: one line per newline; otherwise wrapped to `w`. */
export const textKind: ElementKind<TextElement> = {
  visualPad: () => 2,

  shapeKey: el => hashString(JSON.stringify([
    'text', el.text, el.fontFamily, el.fontSize, el.textAlign, el.stroke, el.autoSize ? null : el.w,
  ])),

  draw(ctx, el, theme) {
    drawTextBlock(ctx, textBlock(el, theme))
  },

  drawLod(ctx, el, theme) {
    ctx.save()
    ctx.translate(-el.w / 2, -el.h / 2)
    drawTextBlock(ctx, textBlock(el, theme))
    ctx.restore()
  },

  svg: (el, theme) => svgTextBlock(textBlock(el, theme)),

  hit: (el, local, tol) =>
    local.x >= -tol && local.x <= el.w + tol && local.y >= -tol && local.y <= el.h + tol,

  resize: (el, next) => ({
    x: next.x, y: next.y, w: next.w, h: measureText(el.text, el, next.w).h, autoSize: false,
  }),
}
