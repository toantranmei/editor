import { cornersBox, type RotBox } from '../geometry/bounds'
import type { SketchElement } from '../model/types'
import type { Viewport } from '../viewport'

/** Free space kept around a focused element that has to be fitted, screen px. */
const FOCUS_PADDING = 40

/**
 * Text normalized for matching, as the editor's `normalize`: NFD, combining marks (U+0300–U+036F) stripped,
 * lower case, đ → d (so "Đường" matches "duong").
 */
export function normalizeSearch(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/đ/g, 'd')
}

/** The searchable text of an element: a text's / sticky's text, a shape's / line's label, a frame's name. */
export function searchableText(el: SketchElement): string {
  const r = el as unknown as Record<string, unknown>
  const v = el.type === 'frame' ? r.name : el.type === 'text' || el.type === 'sticky' ? r.text : r.label
  return typeof v === 'string' ? v : ''
}

/** Ids of the elements whose text contains `query` (diacritics- and case-insensitive), in z-order. */
export function searchElements(elements: readonly SketchElement[], query: string): string[] {
  const q = normalizeSearch(query).trim()
  if (!q) return []
  const out: string[] = []
  for (const el of elements) {
    const text = searchableText(el)
    if (text && normalizeSearch(text).includes(q)) out.push(el.id)
  }
  return out
}

/**
 * Moves the viewport so the element's rotated box is centered in a `width` × `height` canvas. The zoom is kept
 * when the box fits at it (with padding); otherwise the box is fitted.
 */
export function focusElement(viewport: Viewport, el: RotBox, width: number, height: number): void {
  if (width <= 0 || height <= 0) return
  const box = cornersBox(el)
  const z = viewport.zoom
  const fits = (box.maxX - box.minX) * z <= width - 2 * FOCUS_PADDING
    && (box.maxY - box.minY) * z <= height - 2 * FOCUS_PADDING
  if (!fits) {
    viewport.fit(box, width, height, FOCUS_PADDING)
    return
  }
  viewport.x = (box.minX + box.maxX) / 2 - width / 2 / z
  viewport.y = (box.minY + box.maxY) / 2 - height / 2 / z
}
