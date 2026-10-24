<script setup lang="ts">
/**
 * Full-screen image viewer (Notion's zoom): fit to screen, zoom with the buttons,
 * wheel, +/- or double-click, drag to pan when zoomed, Esc to close.
 */
import { Download, Minus, Plus, X } from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { EditorMessages } from '../locale'

defineProps<{ src: string, alt?: string, messages: EditorMessages['image'], scope: Record<string, unknown> }>()
const emit = defineEmits<{ close: [], download: [] }>()

const MIN = 0.25
const MAX = 8
const zoom = ref(1)
const pan = ref({ x: 0, y: 0 })
const percent = computed(() => `${Math.round(zoom.value * 100)}%`)

function setZoom(next: number) {
  zoom.value = Math.min(MAX, Math.max(MIN, Math.round(next * 100) / 100))
  if (zoom.value <= 1) pan.value = { x: 0, y: 0 }
}
const zoomIn = () => setZoom(zoom.value * 1.25)
const zoomOut = () => setZoom(zoom.value / 1.25)
const reset = () => setZoom(1)

function onWheel(e: WheelEvent) {
  e.preventDefault()
  setZoom(zoom.value * (e.deltaY < 0 ? 1.1 : 1 / 1.1))
}

let drag: { x: number, y: number, px: number, py: number } | null = null
const dragging = ref(false)
function onPointerDown(e: PointerEvent) {
  if (zoom.value <= 1) return
  e.preventDefault()
  drag = { x: e.clientX, y: e.clientY, px: pan.value.x, py: pan.value.y }
  dragging.value = true
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
}
function onPointerMove(e: PointerEvent) {
  if (!drag) return
  pan.value = { x: drag.px + e.clientX - drag.x, y: drag.py + e.clientY - drag.y }
}
function onPointerUp() {
  drag = null
  dragging.value = false
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
  else if (e.key === '+' || e.key === '=') zoomIn()
  else if (e.key === '-') zoomOut()
  else if (e.key === '0') reset()
  else return
  e.preventDefault()
  e.stopPropagation()
}
onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <Teleport to="body">
    <div v-bind="scope" class="me-lightbox" role="dialog" aria-modal="true" @mousedown.self="emit('close')" @wheel="onWheel">
      <img
        class="me-lightbox-img"
        :class="{ 'is-zoomed': zoom > 1, 'is-dragging': dragging }"
        :src="src"
        :alt="alt || ''"
        draggable="false"
        :style="{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }"
        @dblclick="zoom > 1 ? reset() : setZoom(2)"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      >
      <div class="me-popover me-toolbar me-lightbox-toolbar" @mousedown.stop>
        <button type="button" class="me-tool-btn" :title="messages.zoomOut" :disabled="zoom <= MIN" @click="zoomOut">
          <Minus />
        </button>
        <button type="button" class="me-tool-btn me-lightbox-percent" :title="messages.zoomReset" @click="reset">
          {{ percent }}
        </button>
        <button type="button" class="me-tool-btn" :title="messages.zoomIn" :disabled="zoom >= MAX" @click="zoomIn">
          <Plus />
        </button>
        <span class="me-toolbar-divider" />
        <button type="button" class="me-tool-btn" :title="messages.download" @click="emit('download')">
          <Download />
        </button>
        <button type="button" class="me-tool-btn" :title="messages.close" @click="emit('close')">
          <X />
        </button>
      </div>
    </div>
  </Teleport>
</template>
