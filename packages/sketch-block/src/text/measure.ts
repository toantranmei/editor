import type { TextStyle } from '../model/types'
import { FONT_FAMILIES, LINE_HEIGHT, onFontsLoaded } from './fonts'

/** Width in px of `text` drawn with the CSS `font`. */
export type Measurer = (text: string, font: string) => number

let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null | undefined

function measureCtx() {
  if (ctx !== undefined) return ctx
  try {
    ctx = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(1, 1).getContext('2d')
      : typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null
  } catch {
    ctx = null
  }
  return ctx
}

/** Shared offscreen canvas `measureText`; a rough estimate where no canvas is available (SSR, tests). */
const defaultMeasurer: Measurer = (text, font) => {
  const c = measureCtx()
  if (c) {
    c.font = font
    const width = c.measureText(text)?.width
    if (typeof width === 'number' && Number.isFinite(width)) return width
  }
  return text.length * (Number.parseFloat(font) || 16) * 0.55
}

let measurer: Measurer = defaultMeasurer

/** Replaces the measurer (tests); `null` restores the canvas-based default. Clears the layout cache. */
export function setMeasurer(m: Measurer | null): void {
  measurer = m ?? defaultMeasurer
  clearTextCache()
}

/** Cached text layouts (wrapped lines and their measured width) kept at most. */
const CACHE_CAP = 2000
type Layout = { w: number; lines: string[] }
/** LRU of layouts by (text, font, maxWidth); Map iteration order = recency. */
const layouts = new Map<string, Layout>()

/** Drops every cached layout (the font metrics changed: the hand font loaded, or the measurer was swapped). */
export function clearTextCache(): void {
  layouts.clear()
}

// the hand font changes every width measured with the fallback
onFontsLoaded(clearTextCache)

function layoutOf(text: string, style: TextStyle, maxWidth: number | null): Layout {
  const font = fontString(style)
  const key = `${font}\u0000${maxWidth ?? ''}\u0000${text}`
  let hit = layouts.get(key)
  if (hit) {
    layouts.delete(key)
    layouts.set(key, hit)
    return hit
  }
  const lines = wrapUncached(text, font, maxWidth)
  let w = 0
  for (const l of lines) w = Math.max(w, measurer(l, font))
  hit = { w, lines }
  layouts.set(key, hit)
  if (layouts.size > CACHE_CAP) layouts.delete(layouts.keys().next().value!)
  return hit
}

export function fontString(style: Pick<TextStyle, 'fontFamily' | 'fontSize'>): string {
  return `${style.fontSize}px ${FONT_FAMILIES[style.fontFamily]}`
}

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter() : null

/** User-perceived characters, so a break never splits a base letter from its combining marks. */
function graphemes(s: string): string[] {
  return segmenter ? Array.from(segmenter.segment(s), g => g.segment) : Array.from(s)
}

/**
 * Splits on newlines; with `maxWidth`, greedy word wrap, breaking over-long words by character. Cached (LRU);
 * the returned array is shared and must not be mutated.
 */
export function wrapText(text: string, style: TextStyle, maxWidth: number | null): string[] {
  return layoutOf(text, style, maxWidth).lines
}

function wrapUncached(text: string, font: string, maxWidth: number | null): string[] {
  const paragraphs = text.replace(/\r\n?/g, '\n').split('\n')
  if (maxWidth === null) return paragraphs
  const fits = (s: string) => measurer(s, font) <= maxWidth
  const out: string[] = []
  for (const para of paragraphs) {
    let line = ''
    for (const word of para.split(' ')) {
      const candidate = line === '' ? word : `${line} ${word}`
      if (fits(candidate)) {
        line = candidate
        continue
      }
      if (line !== '') out.push(line)
      if (fits(word)) {
        line = word
        continue
      }
      // over-long word: as many characters per line as fit (at least one)
      line = ''
      for (const ch of graphemes(word)) {
        if (line !== '' && !fits(line + ch)) {
          out.push(line)
          line = ''
        }
        line += ch
      }
    }
    out.push(line)
  }
  return out
}

export function measureText(
  text: string,
  style: TextStyle,
  maxWidth: number | null,
): { w: number; h: number; lines: string[] } {
  const { w, lines } = layoutOf(text, style, maxWidth)
  return { w, h: lines.length * style.fontSize * LINE_HEIGHT, lines }
}
