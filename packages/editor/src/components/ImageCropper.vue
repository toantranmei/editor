<script setup lang="ts">
/**
 * Non-destructive crop: shows the whole image with a draggable crop box (move it or
 * drag its corners/edges). The result is stored as fractions of the original image,
 * so the crop can be changed or reset later.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { EditorMessages } from '../locale'

export interface ImageCrop {
  /** Left / top / width / height as fractions (0–1) of the original image. */
  x: number
  y: number
  w: number
  h: number
  /** Width / height of the cropped area in pixels, for the block's aspect ratio. */
  ratio: number
}

const props = defineProps<{ src: string, alt?: string, crop: ImageCrop | null, messages: EditorMessages['image'] }>()
const emit = defineEmits<{ done: [crop: ImageCrop | null], cancel: [] }>()

const MIN = 0.05
const box = ref({ x: props.crop?.x ?? 0, y: props.crop?.y ?? 0, w: props.crop?.w ?? 1, h: props.crop?.h ?? 1 })
const stage = ref<HTMLElement | null>(null)
const img = ref<HTMLImageElement | null>(null)

type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

function start(e: PointerEvent, handle: Handle) {
  const rect = stage.value?.getBoundingClientRect()
  if (!rect) return
  e.preventDefault()
  e.stopPropagation()
  const from = { ...box.value }
  const sx = e.clientX
  const sy = e.clientY
  const move = (ev: PointerEvent) => {
    const dx = (ev.clientX - sx) / rect.width
    const dy = (ev.clientY - sy) / rect.height
    let { x, y, w, h } = from
    if (handle === 'move') {
      x = clamp(from.x + dx, 0, 1 - from.w)
      y = clamp(from.y + dy, 0, 1 - from.h)
    }
    else {
      if (handle.includes('w')) {
        x = clamp(from.x + dx, 0, from.x + from.w - MIN)
        w = from.x + from.w - x
      }
      if (handle.includes('e')) w = clamp(from.w + dx, MIN, 1 - from.x)
      if (handle.includes('n')) {
        y = clamp(from.y + dy, 0, from.y + from.h - MIN)
        h = from.y + from.h - y
      }
      if (handle.includes('s')) h = clamp(from.h + dy, MIN, 1 - from.y)
    }
    box.value = { x, y, w, h }
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function done() {
  const { x, y, w, h } = box.value
  const full = w > 0.995 && h > 0.995
  const natural = img.value
  const ratio = natural?.naturalWidth && natural.naturalHeight ? (w * natural.naturalWidth) / (h * natural.naturalHeight) : w / h
  emit('done', full ? null : { x, y, w, h, ratio })
}
const reset = () => (box.value = { x: 0, y: 0, w: 1, h: 1 })

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('cancel')
  else if (e.key === 'Enter') done()
  else return
  e.preventDefault()
  e.stopPropagation()
}
onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))

const pct = (v: number) => `${v * 100}%`
</script>

<template>
  <div class="me-cropper">
    <div ref="stage" class="me-cropper-stage">
      <img ref="img" class="me-figure-img" :src="src" :alt="alt || ''" draggable="false">
      <!-- Dimming is clipped to the image; the box and its handles are not, so edge handles stay grabbable. -->
      <div class="me-cropper-shade">
        <div class="me-cropper-hole" :style="{ left: pct(box.x), top: pct(box.y), width: pct(box.w), height: pct(box.h) }" />
      </div>
      <div
        class="me-cropper-box"
        :style="{ left: pct(box.x), top: pct(box.y), width: pct(box.w), height: pct(box.h) }"
        @pointerdown="start($event, 'move')"
      >
        <span v-for="h in HANDLES" :key="h" class="me-cropper-handle" :data-handle="h" @pointerdown="start($event, h)" />
      </div>
    </div>
    <div class="me-cropper-actions">
      <button type="button" class="me-btn" @click="reset">
        {{ messages.cropReset }}
      </button>
      <span class="me-cropper-spacer" />
      <button type="button" class="me-btn" @click="emit('cancel')">
        {{ messages.cropCancel }}
      </button>
      <button type="button" class="me-btn me-btn--primary" @click="done">
        {{ messages.cropDone }}
      </button>
    </div>
  </div>
</template>
