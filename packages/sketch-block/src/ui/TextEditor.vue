<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { labelBox } from '../elements/shape'
import { editedTextBox } from '../elements/text'
import { isShape, isText, type SketchElement } from '../model/types'
import { displayColor, type Theme } from '../render/shapes'
import { FONT_FAMILIES, LINE_HEIGHT } from '../text/fonts'
import { Viewport } from '../viewport'

const props = defineProps<{
  /** The element being edited (its current state). */
  element: SketchElement
  kind: 'text' | 'label'
  /** Viewport state; the overlay follows pans and zooms. */
  view: { x: number; y: number; zoom: number }
  theme: Theme
  label?: string
}>()

const emit = defineEmits<{
  /** The final value (blur, Escape, Ctrl/Cmd+Enter); emitted once. */
  commit: [value: string]
}>()

/** Extra width (CSS px) so the caret at the end of the longest line is not clipped. */
const CARET_PX = 2

const textarea = shallowRef<HTMLTextAreaElement | null>(null)
const initial = (): string => {
  const el = props.element
  return isText(el) ? el.text : isShape(el) ? el.label : ''
}
const value = ref(initial())
/** Between compositionstart and compositionend (IME: Telex / VNI, CJK…). */
let composing = false
let done = false

const viewport = computed(() => Object.assign(new Viewport(), props.view))

/**
 * Textarea box in CSS px within the board root (the canvas' positioned parent), plus the rotation origin.
 * Text: the element box refitted to the value as typed. Label: the padded label box, centered in the shape.
 */
const layout = computed(() => {
  const el = props.element
  const zoom = props.view.zoom
  let x = el.x
  let y = el.y
  let w = el.w
  let h = el.h
  if (props.kind === 'label' && isShape(el)) {
    const b = labelBox(el, value.value)
    x = el.x + b.x
    y = el.y + b.y
    w = b.w
    h = b.h
  } else if (isText(el)) {
    const b = editedTextBox(el, value.value)
    x = b.x
    w = b.w
    h = b.h
  }
  const at = viewport.value.toScreen({ x, y })
  // rotate about the element's center, like the canvas
  const origin = { x: (el.x + el.w / 2 - x) * zoom, y: (el.y + el.h / 2 - y) * zoom }
  return { at, w: w * zoom, h: h * zoom, origin }
})

const style = computed(() => {
  const el = props.element
  const { at, w, h, origin } = layout.value
  const font = 'fontFamily' in el ? el : null
  const wraps = props.kind === 'label' || (isText(el) && !el.autoSize)
  return {
    left: `${at.x}px`,
    top: `${at.y}px`,
    width: `${wraps ? w : w + CARET_PX}px`,
    height: `${h}px`,
    transform: el.angle ? `rotate(${el.angle}rad)` : undefined,
    transformOrigin: `${origin.x}px ${origin.y}px`,
    fontFamily: font ? FONT_FAMILIES[font.fontFamily] : undefined,
    fontSize: font && 'fontSize' in font ? `${font.fontSize * props.view.zoom}px` : undefined,
    lineHeight: String(LINE_HEIGHT),
    textAlign: font ? font.textAlign : undefined,
    whiteSpace: wraps ? 'pre-wrap' : 'pre',
    color: displayColor(el.stroke, props.theme),
    opacity: String(el.opacity),
  }
})

function commit(): void {
  if (done) return
  done = true
  emit('commit', textarea.value?.value ?? value.value)
}

function onInput(e: Event): void {
  // read the DOM value, also mid-composition, so the box grows as the IME types (never written back)
  value.value = (e.target as HTMLTextAreaElement).value
}

function onCompositionStart(): void {
  composing = true
}

function onCompositionEnd(): void {
  composing = false
}

function onKeyDown(e: KeyboardEvent): void {
  // the board and controller never see editor keys (Delete, tool letters, undo…)
  e.stopPropagation()
  // IME: Enter / Escape confirm or cancel the composition, not the edit. keyCode 229: Safari sends the
  // confirming keydown after compositionend.
  if (composing || e.isComposing || e.keyCode === 229) return
  if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
    e.preventDefault()
    commit()
  }
}

onMounted(() => {
  const ta = textarea.value
  if (!ta) return
  ta.value = value.value
  ta.focus({ preventScroll: true })
  ta.select()
})

// unmounted while open (board closed, remote delete): keep what was typed
onBeforeUnmount(commit)

defineExpose({ commit })
</script>

<template>
  <textarea
    ref="textarea"
    class="me-sketch-text-editor"
    :style="style"
    :aria-label="label"
    rows="1"
    wrap="soft"
    spellcheck="false"
    autocomplete="off"
    autocapitalize="off"
    @input="onInput"
    @keydown="onKeyDown"
    @keyup.stop
    @compositionstart="onCompositionStart"
    @compositionend="onCompositionEnd"
    @blur="commit"
  />
</template>
