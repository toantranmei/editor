import { onBeforeUnmount, onMounted, type Ref } from 'vue'

/** Calls `handler` on a pointerdown outside `target` while `active` is true. */
export function useClickOutside(target: Ref<HTMLElement | null | undefined>, active: { readonly value: boolean }, handler: () => void) {
  const listener = (e: PointerEvent) => {
    if (!active.value) return
    const el = target.value
    if (el && !el.contains(e.target as Node)) handler()
  }
  onMounted(() => document.addEventListener('pointerdown', listener, true))
  onBeforeUnmount(() => document.removeEventListener('pointerdown', listener, true))
}
