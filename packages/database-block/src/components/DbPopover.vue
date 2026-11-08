<script setup lang="ts">
/**
 * Popover teleported to <body> (so table overflow never clips it), positioned under / over an anchor element.
 * Closes on outside pointerdown and Escape; popovers opened from inside it (nested) don't close it.
 * While it is open the page doesn't scroll under it (Notion): the wheel scrolls only a popover that can scroll that
 * way. If the page scrolls anyway (its scrollbar dragged), the popover follows its anchor.
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

/** Least room below an `over` / `right` popover's anchor for it to stay there (shrunk) instead of moving up. */
const ROOM = 240

function place() {
  const r = rectOf(props.anchor)
  const el = root.value
  if (!r || !el) return
  const vw = window.innerWidth
  const vh = window.innerHeight
  // scroll sizes: the box may still be clamped by the previous max-height / position.
  const w = Math.max(el.offsetWidth, el.scrollWidth) || r.width
  const h = Math.max(el.offsetHeight, el.scrollHeight)
  let left = props.placement === 'right' ? r.right : r.left
  let top = props.placement === 'over' ? r.top : props.placement === 'right' ? r.top : r.bottom
  if (left + w > vw - 8) left = Math.max(8, vw - w - 8)
  // An anchor scrolled out to the left (a column header) still opens the popover on screen.
  left = Math.max(8, left)
  let maxHeight = vh - top - 8
  if (h && top + h > vh - 8) {
    if (props.placement === 'below') {
      // Below the anchor when it fits, else above; neither: the roomier side, shrunk to it (it scrolls), as Notion.
      const below = vh - 8 - r.bottom
      const above = r.top - 8
      if (h <= above) top = r.top - h
      else if (above > below) {
        top = 8
        maxHeight = above
      }
      else maxHeight = below
    }
    // Over / beside its anchor: stays there, shrunk to the room below (it scrolls), when that room is enough for a
    // few items; else moved up until it fits.
    else if (vh - 8 - top < ROOM) {
      top = Math.max(8, vh - h - 8)
      maxHeight = vh - top - 8
    }
  }
  pos.value = { left, top, width: props.matchWidth ? r.width : 0, maxHeight }
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
/** Can `el` or a scrolling parent of it inside the popover scroll `dy` further? */
function canScroll(el: Element | null, dy: number, dx: number): boolean {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    const s = getComputedStyle(n)
    if (dy && /(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight) {
      if (dy < 0 ? n.scrollTop > 0 : n.scrollTop + n.clientHeight < n.scrollHeight - 1) return true
    }
    if (dx && /(auto|scroll)/.test(s.overflowX) && n.scrollWidth > n.clientWidth) {
      if (dx < 0 ? n.scrollLeft > 0 : n.scrollLeft + n.clientWidth < n.scrollWidth - 1) return true
    }
    if (n.hasAttribute('data-db-popover')) break
  }
  return false
}
function onWheel(e: WheelEvent) {
  // Only the first popover of the stack handles it (nested ones add nothing).
  if (stack[0] !== id) return
  const target = e.target as Element | null
  const inside = target?.closest?.('[data-db-popover]')
  if (!inside || !canScroll(target, e.deltaY, e.deltaX)) e.preventDefault()
}
function onTouchMove(e: TouchEvent) {
  if (stack[0] !== id) return
  if (!(e.target as Element | null)?.closest?.('[data-db-popover]')) e.preventDefault()
}
function onScroll(e: Event) {
  const t = e.target
  if (t instanceof Element && t.closest('[data-db-popover]')) return
  place()
}
let resizer: ResizeObserver | undefined

onMounted(async () => {
  stack.push(id)
  document.addEventListener('pointerdown', onPointerDown, true)
  document.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('resize', onWindow)
  document.addEventListener('wheel', onWheel, { capture: true, passive: false })
  document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false })
  document.addEventListener('scroll', onScroll, true)
  // Content that grows after opening (a submenu panel, a loaded list) is placed again.
  if (typeof ResizeObserver !== 'undefined' && root.value?.firstElementChild) {
    resizer = new ResizeObserver(() => place())
    resizer.observe(root.value.firstElementChild)
  }
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
  document.removeEventListener('wheel', onWheel, { capture: true })
  document.removeEventListener('touchmove', onTouchMove, { capture: true })
  document.removeEventListener('scroll', onScroll, true)
  resizer?.disconnect()
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
