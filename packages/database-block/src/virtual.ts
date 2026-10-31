import { observeElementRect, type Virtualizer } from '@tanstack/vue-virtual'

/**
 * `observeElementRect` that falls back to a fixed size while the element reports 0×0 (hidden container, test DOM),
 * so the virtualizer still renders a first window.
 */
export function rectWithFallback(width: number, height: number) {
  return (instance: Virtualizer<HTMLElement, Element>, cb: (rect: { width: number, height: number }) => void) =>
    observeElementRect(instance, rect => cb(rect.height || rect.width ? rect : { width, height }))
}
