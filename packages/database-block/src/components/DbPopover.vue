<script setup lang="ts">
/**
 * Popover teleported to <body> (so table overflow never clips it), positioned under / over an anchor element.
 * Closes on outside pointerdown and Escape; popovers opened from inside it (nested) don't close it.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  anchor: HTMLElement | DOMRect | null
  scope: Record<string, unknown>
  /** `below` (menus) or `over` (cell editors covering their cell). */
  placement?: 'below' | 'over' | 'right'
  /** Match the anchor's width (cell editors). */
  matchWidth?: boolean
  label?: string
}>(), { placement: 'below', matchWidth: false, label: undefined })
/** `reason`: outside click or Escape (editors commit on the first, cancel on the second). */
const emit = defineEmits<{ close: [reason: 'outside' | 'escape'] }>()

const stack: number[] = (globalThis as { __meDbPopovers?: number[] }).__meDbPopovers ??= []
let counter = (globalThis as { __meDbPopoverId?: number }).__meDbPopoverId ?? 0
const id = ++counter
;(globalThis as { __meDbPopoverId?: number }).__meDbPopoverId = counter

const root = ref<HTMLElement | null>(null)
const pos = ref({ left: 0, top: 0, width: 0, maxHeight: 0 })

function rectOf(a: HTMLElement | DOMRect | null): DOMRect | null {
  if (!a) return null
  return a instanceof DOMRect || !('getBoundingClientRect' in a) ? a as DOMRect : a.getBoundingClientRect()
}

function place() {
  const r = rectOf(props.anchor)
  const el = root.value
  if (!r || !el) return
  const vw = window.innerWidth
  const vh = window.innerHeight
  const w = el.offsetWidth || r.width
  const h = el.offsetHeight
  let left = props.placement === 'right' ? r.right : r.left
  let top = props.placement === 'over' ? r.top : props.placement === 'right' ? r.top : r.bottom
  if (left + w > vw - 8) left = Math.max(8, vw - w - 8)
  if (h && top + h > vh - 8) top = props.placement === 'below' && r.top - h > 8 ? r.top - h : Math.max(8, vh - h - 8)
  pos.value = { left, top, width: props.matchWidth ? r.width : 0, maxHeight: vh - top - 8 }
}

const style = computed(() => ({
  left: `${pos.value.left}px`,
  top: `${pos.value.top}px`,
  minWidth: pos.value.width ? `${pos.value.width}px` : undefined,
  maxHeight: `${pos.value.maxHeight}px`,
}))

function onPointerDown(e: PointerEvent) {
  const target = e.target as Element | null
  if (!target || root.value?.contains(target)) return
  // Inside a popover opened after this one (a nested menu)? Keep this one.
  const other = target.closest?.('[data-db-popover]') as HTMLElement | null
  if (other && Number(other.dataset.dbPopover) > id) return
  emit('close', 'outside')
}
function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || stack[stack.length - 1] !== id) return
  e.preventDefault()
  e.stopPropagation()
  emit('close', 'escape')
}
const onWindow = () => place()

onMounted(async () => {
  stack.push(id)
  document.addEventListener('pointerdown', onPointerDown, true)
  document.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('resize', onWindow)
  await nextTick()
  place()
  // Second pass once the content has its size.
  requestAnimationFrame?.(() => place())
})
onBeforeUnmount(() => {
  const i = stack.indexOf(id)
  if (i >= 0) stack.splice(i, 1)
  document.removeEventListener('pointerdown', onPointerDown, true)
  document.removeEventListener('keydown', onKeyDown, true)
  window.removeEventListener('resize', onWindow)
})
watch(() => props.anchor, () => nextTick(place))

defineExpose({ place, root })
</script>

<template>
  <Teleport to="body">
    <div
      ref="root"
      v-bind="scope"
      class="me-popover me-db-popover"
      :class="{ 'is-over': placement === 'over' }"
      :data-db-popover="id"
      role="dialog"
      :aria-label="label"
      :style="style"
      @keydown.stop
      @mousedown.stop
    >
      <slot />
    </div>
  </Teleport>
</template>
