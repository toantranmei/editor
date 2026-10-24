import { cssVar } from './define'

/**
 * Reads a token's resolved pixel value from an element, for JS-driven layout
 * (e.g. popover offsets). Returns `fallback` when unavailable.
 */
export function readTokenPx(el: Element | null | undefined, path: string, fallback = 0): number {
  if (!el || typeof getComputedStyle === 'undefined') return fallback
  const probe = document.createElement('div')
  probe.style.cssText = `position:absolute;visibility:hidden;width:var(${cssVar(path)})`
  el.appendChild(probe)
  const px = probe.getBoundingClientRect().width
  probe.remove()
  return px || fallback
}
