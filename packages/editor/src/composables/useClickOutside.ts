import { onBeforeUnmount, onMounted, type Ref } from 'vue'

/** An element, or a component whose root element counts (e.g. a NodeViewWrapper ref). */
type Target = HTMLElement | { $el?: unknown } | null | undefined

/** Calls `handler` on a pointerdown outside `target` while `active` is true. */
export function useClickOutside(target: Ref<Target>, active: { readonly value: boolean }, handler: () => void) {
  const listener = (e: PointerEvent) => {
    if (!active.value) return
    const value = target.value
    const el = value instanceof Element ? value : value?.$el
    if (el instanceof Element && !el.contains(e.target as Node)) handler()
  }
  onMounted(() => document.addEventListener('pointerdown', listener, true))
  onBeforeUnmount(() => document.removeEventListener('pointerdown', listener, true))
}
