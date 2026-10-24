import type { Options } from 'roughjs/bin/core'
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
