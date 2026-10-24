import rough from 'roughjs'
import type { Drawable, Options } from 'roughjs/bin/core'
import type { SketchElement } from '../model/types'

export type Theme = 'light' | 'dark'

const DEFAULT_STROKE = '#1e1e1e'
const DARK_STROKE = '#e3e3e3'

/** Theme-aware display color: the default stroke flips to a light ink in dark theme. */
export function displayColor(color: string, theme: Theme): string {
  return theme === 'dark' && color.toLowerCase() === DEFAULT_STROKE ? DARK_STROKE : color
}

export function hasFill(el: SketchElement): boolean {
  return el.fillStyle !== 'none' && el.fill !== 'transparent'
}

/** roughjs options for an element (shared by the canvas renderer and SVG export). */
export function roughOptions(el: SketchElement, theme: Theme = 'light'): Options {
  const o: Options = {
    roughness: el.roughness,
    seed: el.seed,
    stroke: displayColor(el.stroke, theme),
    strokeWidth: el.strokeWidth,
    // keep low-roughness shapes clean
    preserveVertices: el.roughness < 2,
  }
  if (el.strokeStyle === 'dashed') o.strokeLineDash = [8, 8]
  else if (el.strokeStyle === 'dotted') o.strokeLineDash = [1.5, 6]
  if (hasFill(el)) {
    o.fill = displayColor(el.fill, theme)
    o.fillStyle = el.fillStyle
    o.fillWeight = el.strokeWidth / 2
    o.hachureGap = el.strokeWidth * 4
  }
  return o
}

export function cornerRadius(el: Pick<SketchElement, 'w' | 'h'>): number {
  return Math.min(Math.min(Math.abs(el.w), Math.abs(el.h)) * 0.25, 32)
}

function roundedRectPath(w: number, h: number, r: number): string {
  return `M ${r} 0 L ${w - r} 0 Q ${w} 0, ${w} ${r} L ${w} ${h - r} Q ${w} ${h}, ${w - r} ${h}`
    + ` L ${r} ${h} Q 0 ${h}, 0 ${h - r} L 0 ${r} Q 0 0, ${r} 0 Z`
}

const generator = rough.generator()
const caches: Record<Theme, WeakMap<SketchElement, Drawable>> = { light: new WeakMap(), dark: new WeakMap() }

/**
 * roughjs drawable for the element in its local, unrotated frame: box (0,0)–(w,h).
 * Cached by element object identity (a new object is produced on every change).
 */
export function shapeFor(el: SketchElement, theme: Theme = 'light'): Drawable {
  const cache = caches[theme]
  let d = cache.get(el)
  if (d) return d
  const o = roughOptions(el, theme)
  const { w, h } = el
  switch (el.type) {
    case 'ellipse':
      d = generator.ellipse(w / 2, h / 2, w, h, o)
      break
    case 'diamond':
      d = generator.polygon([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]], o)
      break
    default:
      d = el.roundness === 'round' && cornerRadius(el) > 0
        ? generator.path(roundedRectPath(w, h, cornerRadius(el)), o)
        : generator.rectangle(0, 0, w, h, o)
  }
  cache.set(el, d)
  return d
}
