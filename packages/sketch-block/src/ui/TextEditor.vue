<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { FRAME_COLOR, FRAME_LABEL_PX, FRAME_NAME_MAX } from '../elements/frame'
import { linearLabelBox } from '../elements/linear'
import { labelBox } from '../elements/shape'
import { STICKY_PAD, STICKY_TEXT_COLOR, stickyLayout } from '../elements/sticky'
import { editedTextBox } from '../elements/text'
import { isFrame, isLinear, isShape, isSticky, isText, type SketchElement } from '../model/types'
import { FRAME_LABEL_H_PX, frameLabelBox } from '../render/frame-labels'
import { displayColor, type Theme } from '../render/shapes'
import { FONT_FAMILIES, LINE_HEIGHT } from '../text/fonts'
import { Viewport } from '../viewport'

const props = defineProps<{
  /** The element being edited (its current state). */
  element: SketchElement
  kind: 'text' | 'label' | 'sticky' | 'frame'
  /** Viewport state; the overlay follows pans and zooms. */
  view: { x: number; y: number; zoom: number }
  theme: Theme
  label?: string
}>()

const emit = defineEmits<{
  /** The final value (blur, Escape, Ctrl/Cmd+Enter); emitted once. */
  commit: [value: string]
  /** Tab while editing a sticky: commit and continue with the next sticky (instead of a tab character). */
  tab: [value: string]
}>()

/** Extra width (CSS px) so the caret at the end of the longest line is not clipped. */
const CARET_PX = 2

const textarea = shallowRef<HTMLTextAreaElement | null>(null)
const initial = (): string => {
  const el = props.element
  return isText(el) || isSticky(el) ? el.text : isShape(el) || isLinear(el) ? el.label : isFrame(el) ? el.name : ''
}
const value = ref(initial())
/** Between compositionstart and compositionend (IME: Telex / VNI, CJK…). */
let composing = false
let done = false

const viewport = computed(() => Object.assign(new Viewport(), props.view))

/**
 * Textarea box in CSS px within the board root (the canvas' positioned parent), plus the rotation origin.
 * Text: the element box refitted to the value as typed. Label: the padded label box, centered in the shape; on a
 * line / arrow the auto-width label box, centered on the shaft midpoint.
 */
const layout = computed(() => {
  const el = props.element
  const zoom = props.view.zoom
  let x = el.x
  let y = el.y
  let w = el.w
  let h = el.h
  let fontSize: number | null = 'fontSize' in el ? el.fontSize : null
  if (props.kind === 'sticky' && isSticky(el)) {
    // the padded text box at the auto-fit size, centered in the sticky (scrolls when even 12 overflows)
    const l = stickyLayout(el, value.value)
    const maxH = Math.max(l.fontSize * LINE_HEIGHT, el.h - 2 * STICKY_PAD)
    fontSize = l.fontSize
    h = Math.min(l.lines.length * l.fontSize * LINE_HEIGHT, maxH)
    x = el.x + l.x
    y = el.y + (el.h - h) / 2
    w = l.w
  } else if (props.kind === 'label' && isShape(el)) {
    const b = labelBox(el, value.value)
    x = el.x + b.x
    y = el.y + b.y
    w = b.w
    h = b.h
  } else if (props.kind === 'label' && isLinear(el)) {
    const b = linearLabelBox(el, value.value)
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
  return { at, w: w * zoom, h: h * zoom, origin, fontSize }
})

/** Frame name: one line of 12 px (screen) text over the name label, at least the frame's width. */
const frameStyle = computed(() => {
  const el = props.element
  if (!isFrame(el)) return null
  const zoom = props.view.zoom
  const b = frameLabelBox(el, zoom)
  const at = viewport.value.toScreen({ x: b.x, y: b.y })
  return {
    left: `${at.x}px`,
    top: `${at.y}px`,
    width: `${Math.max(el.w * zoom, 80)}px`,
    height: `${FRAME_LABEL_H_PX}px`,
    fontFamily: FONT_FAMILIES.normal,
    fontSize: `${FRAME_LABEL_PX}px`,
    lineHeight: String(LINE_HEIGHT),
    textAlign: 'left' as const,
    whiteSpace: 'pre',
    color: FRAME_COLOR[props.theme],
  }
})

const style = computed(() => {
  if (props.kind === 'frame' && frameStyle.value) return frameStyle.value
  const el = props.element
  const { at, w, h, origin, fontSize } = layout.value
  const font = 'fontFamily' in el ? el : null
  // a line / arrow label is auto-width (like an auto-sized text): one line per newline, never wrapped
  const wraps = props.kind === 'text' ? isText(el) && !el.autoSize : !isLinear(el)
  return {
    left: `${at.x}px`,
    top: `${at.y}px`,
    width: `${wraps ? w : w + CARET_PX}px`,
    height: `${h}px`,
    transform: el.angle ? `rotate(${el.angle}rad)` : undefined,
    transformOrigin: `${origin.x}px ${origin.y}px`,
    fontFamily: font ? FONT_FAMILIES[font.fontFamily] : undefined,
    fontSize: fontSize !== null ? `${fontSize * props.view.zoom}px` : undefined,
    lineHeight: String(LINE_HEIGHT),
    textAlign: font ? font.textAlign : undefined,
    whiteSpace: wraps ? 'pre-wrap' : 'pre',
    // sticky text stays dark on its pastel fill in both themes
    color: isSticky(el) ? STICKY_TEXT_COLOR : displayColor(el.stroke, props.theme),
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
  if (e.key === 'Tab' && props.kind === 'sticky' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
    e.preventDefault()
    if (done) return
    done = true
    emit('tab', textarea.value?.value ?? value.value)
    return
  }
  // a frame name is one line: Enter commits
  if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey || props.kind === 'frame'))) {
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
    :maxlength="kind === 'frame' ? FRAME_NAME_MAX : undefined"
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
