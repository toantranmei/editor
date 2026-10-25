<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, toRaw, watch } from 'vue'
import type * as Y from 'yjs'
import '../styles/sketch.css'
import type { BoardSession } from '../engine'
import { shapeKeyOf } from '../elements/kind'
import type { Point } from '../geometry/math'
import { clipboardImageFiles, parseClipboard, pastedImageFiles, serializeClipboard } from '../io/clipboard'
import { ImageInsertError, type ImageInsertErrorCode, type ImageUploader, prepareImage } from '../io/image-insert'
import { onImageLoaded, retryFailedImages } from '../io/image-loader'
import { messages as allMessages } from '../messages'
import { History } from '../model/history'
import { Scene } from '../model/scene'
import { BoardStore } from '../model/store'
import { isFrame, isImage, isLinear, isShape, isSticky, type SketchElement } from '../model/types'
import type { BoardConnection } from '../providers/types'
import { BitmapCache, bindCacheInvalidation } from '../render/bitmap-cache'
import { renderInteractive, resetAccentCache } from '../render/interactive'
import { RenderScheduler, ZoomSettler } from '../render/scheduler'
import { type RenderState, renderStatic } from '../render/static'
import { loadFonts } from '../text/fonts'
import { clearTextCache } from '../text/measure'
import { type CurrentStyle, type PointerInput, ToolController, type ToolName } from '../tools/controller'
import { Viewport } from '../viewport'
import StylePanel from './StylePanel.vue'
import TextEditor from './TextEditor.vue'
import Toolbar from './Toolbar.vue'
import ZoomControls from './ZoomControls.vue'

const props = withDefaults(defineProps<{
  connection: BoardConnection
  readonly?: boolean
  locale?: 'vi' | 'en'
  theme?: 'light' | 'dark'
  /** Store + history shared across mounts (inline ↔ fullscreen). Owned by the caller: never destroyed here. */
  session?: BoardSession
  /** Uploads an inserted image and resolves to its URL; without one, images are stored as data URLs. */
  uploadImage?: ImageUploader | null
}>(), { readonly: false, locale: 'vi', theme: 'light', session: undefined, uploadImage: null })

const emit = defineEmits<{
  /** Any local edit (including undo/redo); the caller debounces preview generation. */
  change: []
  /** Escape with an empty selection and no gesture in progress. */
  exit: []
}>()

const ZOOM_STEP = 1.25
/** How long an image error stays on screen, ms. */
const IMAGE_ERROR_MS = 4000

const root = shallowRef<HTMLDivElement | null>(null)
const staticCanvas = shallowRef<HTMLCanvasElement | null>(null)
const interactiveCanvas = shallowRef<HTMLCanvasElement | null>(null)

const t = computed(() => allMessages[props.locale] ?? allMessages.vi)

// ---------- model ----------
// The connection (and session) are owned by the caller and assumed fixed for the board's lifetime.
// toRaw: a connection passed through reactive state would hand out Proxy-wrapped Yjs types,
// which breaks identity checks inside Yjs (UndoManager scope, transaction origins).
const session = props.session ? toRaw(props.session) : null
const store = session ? toRaw(session.store) : new BoardStore(toRaw(toRaw(props.connection).doc))
const doc = store.doc
const scene = new Scene(store)
const history = session ? toRaw(session.history) : new History(store)
// a shared history may hold an open capture from the previous mount: start a fresh undo step
history.stopCapturing()
const viewport = new Viewport()
const cache = new BitmapCache()

let widthCss = 0
let heightCss = 0
let dpr = currentDpr()
let placed = false
const zoom = ref(viewport.zoom)
const last = { x: viewport.x, y: viewport.y, zoom: viewport.zoom }
/** Viewport snapshot for DOM overlays (the text editor) that follow pans and zooms. */
const view = shallowRef({ x: viewport.x, y: viewport.y, zoom: viewport.zoom })

function currentDpr(): number {
  return (typeof window !== 'undefined' && window.devicePixelRatio) || 1
}

// ---------- rendering ----------
const scheduler = new RenderScheduler(drawStatic, drawInteractive)
const settler = new ZoomSettler(() => scheduler.invalidateStatic())

function renderState(): RenderState {
  return {
    viewport, widthCss, heightCss, dpr, theme: props.theme, grid: false, cacheZoom: settler.cacheZoom,
  }
}

function drawStatic(): void {
  const ctx = staticCanvas.value?.getContext('2d')
  if (!ctx) return
  // the element being edited is drawn by the editor overlay: a text element is hidden, a shape / line its label,
  // a sticky note its text
  // erase-marked elements are drawn faded by the interactive layer
  const el = editingEl.value
  drawnErasing = controller.erasing
  let skip: Set<string> | undefined = drawnErasing.size ? new Set(drawnErasing) : undefined
  let substitutes: Map<string, SketchElement> | undefined
  if (el && (isShape(el) || isLinear(el))) substitutes = new Map([[el.id, { ...el, label: '' }]])
  else if (el && isSticky(el)) substitutes = new Map([[el.id, { ...el, text: '' }]])
  // a frame being renamed keeps its border (its name label is hidden by the interactive layer)
  else if (el && !isFrame(el)) (skip ??= new Set()).add(el.id)
  // the image being cropped is drawn by the interactive layer's crop UI
  const cropping = controller.cropping.value
  if (cropping) (skip ??= new Set()).add(cropping)
  renderStatic(ctx, scene, renderState(), cache, skip, substitutes)
}

function drawInteractive(): void {
  const ctx = interactiveCanvas.value?.getContext('2d')
  if (ctx) renderInteractive(ctx, scene, renderState(), controller.overlay())
  // the laser trail fades on its own: keep drawing frames until it is gone
  if (controller.laserTrail().length) scheduler.invalidateInteractive()
}

function invalidateAll(): void {
  scheduler.invalidateStatic()
  scheduler.invalidateInteractive()
}

let settlerStarted = false
function updateSettler(): void {
  settlerStarted = true
  settler.update(viewport.zoom)
}

/** Call after anything that may have moved the viewport. */
function syncView(): void {
  const vp = viewport
  if (vp.x === last.x && vp.y === last.y && vp.zoom === last.zoom) return
  if (vp.zoom !== last.zoom) updateSettler()
  last.x = vp.x
  last.y = vp.y
  last.zoom = vp.zoom
  zoom.value = vp.zoom
  view.value = { x: vp.x, y: vp.y, zoom: vp.zoom }
  invalidateAll()
}

// ---------- tools ----------
/** Eraser marks the static layer last skipped (the controller replaces the Set whenever marks change). */
let drawnErasing: Set<string> = new Set()
// ---------- zen / view mode (local UI state, not persisted) ----------
const zen = ref(false)
const viewMode = ref(false)
/** Read-only for editing: the `readonly` prop or view mode. */
const locked = computed(() => props.readonly || viewMode.value)

const controller = new ToolController({
  store, scene, history, viewport,
  readonly: () => locked.value,
  viewCenter: () => viewport.toScene(center()),
  invalidate: () => {
    scheduler.invalidateInteractive()
    if (controller.erasing !== drawnErasing) scheduler.invalidateStatic()
    syncView()
  },
})
const tool = controller.tool
const toolLocked = controller.toolLocked
const cursor = controller.cursor
const editing = controller.editing
const { canUndo, canRedo } = history
const currentStyle = controller.currentStyle

// ---------- style panel ----------
/** Bumped on every scene change so the panel re-reads the selected elements. */
const sceneVersion = ref(0)
const selectedEls = computed<SketchElement[]>(() => {
  void sceneVersion.value
  const out: SketchElement[] = []
  for (const id of controller.selectedIds.value) {
    const el = scene.get(id)
    if (el) out.push(el)
  }
  return out
})

function applyStyle(patch: Partial<CurrentStyle>): void {
  controller.applyStyle(patch)
}

function reorder(to: 'front' | 'back'): void {
  controller.reorderSelection(to)
}

// ---------- text editing ----------
const editor = shallowRef<InstanceType<typeof TextEditor> | null>(null)
/** Current state of the element being edited (null = not editing). */
const editingEl = shallowRef<SketchElement | null>(null)

function refreshEditing(): void {
  const target = editing.value
  const el = target ? scene.get(target.id) ?? null : null
  if (el === editingEl.value) return
  editingEl.value = el
  scheduler.invalidateStatic()
}

watch(editing, refreshEditing, { flush: 'sync' })
watch(controller.cropping, () => scheduler.invalidateStatic(), { flush: 'sync' })

function onEditorCommit(value: string): void {
  // a keyboard commit (Escape, Ctrl/Cmd+Enter) leaves focus on the removed textarea: hand it back to the board
  const keyboard = editor.value?.$el === document.activeElement
  controller.commitEditing(value)
  if (keyboard) root.value?.focus({ preventScroll: true })
}

/** Tab in a sticky's editor: commit it and edit a new sticky beside it (the new editor takes focus on mount). */
function onEditorTab(value: string): void {
  const keyboard = editor.value?.$el === document.activeElement
  controller.commitAndNext(value)
  if (keyboard && !editing.value) root.value?.focus({ preventScroll: true })
}

function onDblClick(e: MouseEvent): void {
  // only the select tool routes double-clicks; the controller also checks the press began with it
  if (tool.value !== 'select') return
  const rect = canvasRect()
  controller.doubleClick({ x: e.clientX - rect.left, y: e.clientY - rect.top })
}

const offs: Array<() => void> = []
offs.push(bindCacheInvalidation(scene, cache))
offs.push(scene.onChange(invalidateAll))
offs.push(scene.onChange(refreshEditing))
offs.push(scene.onChange(() => sceneVersion.value++))
// an image finished loading: its placeholder bitmaps are stale (the shape key includes the load state)
offs.push(onImageLoaded(src => {
  let hit = false
  for (const el of scene.elements) {
    if (!isImage(el) || el.src !== src) continue
    hit = true
    cache.pruneElement(el.id, `${el.id}:${shapeKeyOf(el)}:`)
  }
  if (hit) invalidateAll()
}))

const onAfterTransaction = (tr: Y.Transaction) => {
  if (tr.local && tr.changed.size > 0) emit('change')
}
doc.on('afterTransaction', onAfterTransaction)
offs.push(() => doc.off('afterTransaction', onAfterTransaction))

watch(() => props.theme, () => {
  cache.clear()
  resetAccentCache()
  invalidateAll()
})

watch(() => props.readonly, ro => {
  if (!ro) return
  editor.value?.commit()
  controller.cancelCrop()
  toolLocked.value = false
  if (tool.value !== 'hand' && tool.value !== 'select') controller.setTool(viewMode.value ? 'hand' : 'select')
})

watch(viewMode, on => {
  if (!on) return
  editor.value?.commit()
  controller.cancelGesture()
  toolLocked.value = false
  controller.setTool('hand')
})

function toggleZen(): void {
  zen.value = !zen.value
}

function exitZen(): void {
  zen.value = false
  root.value?.focus({ preventScroll: true })
}

// ---------- view commands ----------
const center = () => ({ x: widthCss / 2, y: heightCss / 2 })

function zoomTo(next: number): void {
  viewport.zoomAt(center(), next)
  syncView()
}

function fit(): void {
  const box = scene.contentBounds()
  if (box) {
    viewport.fit(box, widthCss, heightCss)
  } else {
    // empty board: zoom 1, scene origin in the middle
    viewport.zoom = 1
    viewport.x = -widthCss / 2
    viewport.y = -heightCss / 2
  }
  syncView()
}

function undo(): void {
  history.stopCapturing()
  history.undo()
}

function redo(): void {
  history.stopCapturing()
  history.redo()
}

function selectTool(name: ToolName): void {
  controller.setTool(name)
}

function toggleLock(): void {
  toolLocked.value = !toolLocked.value
}

// ---------- sizing ----------
function measure(): void {
  const el = root.value
  if (!el) return
  widthCss = el.clientWidth
  heightCss = el.clientHeight
  for (const c of [staticCanvas.value, interactiveCanvas.value]) {
    if (!c) continue
    c.width = Math.max(1, Math.round(widthCss * dpr))
    c.height = Math.max(1, Math.round(heightCss * dpr))
  }
  if (!placed && widthCss > 0 && heightCss > 0) {
    placed = true
    fit()
  }
  invalidateAll()
}

let resizeObserver: ResizeObserver | null = null
let dprQuery: MediaQueryList | null = null

function watchDpr(): void {
  dprQuery?.removeEventListener('change', onDprChange)
  dprQuery = null
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
  dprQuery = window.matchMedia(`(resolution: ${dpr}dppx)`)
  dprQuery.addEventListener('change', onDprChange)
}

function onDprChange(): void {
  dpr = currentDpr()
  cache.clear()
  measure()
  watchDpr()
}

// ---------- input ----------
let activePointer: number | null = null
/** Last input of the active pointer (down / move), for ending a gesture the browser cancelled. */
let lastInput: PointerInput | null = null
/** Last pointer position over the board (screen px; null = never entered), for paste-at-pointer. */
let lastPointer: { x: number; y: number } | null = null

function toInput(e: PointerEvent, rect: DOMRect): PointerInput {
  return {
    screen: { x: e.clientX - rect.left, y: e.clientY - rect.top },
    button: e.button,
    shift: e.shiftKey,
    alt: e.altKey,
    mod: e.ctrlKey || e.metaKey,
    pressure: e.pressure,
  }
}

const canvasRect = (): DOMRect => interactiveCanvas.value!.getBoundingClientRect()

function onPointerDown(e: PointerEvent): void {
  root.value?.focus({ preventScroll: true })
  if (activePointer !== null) return
  activePointer = e.pointerId
  try {
    interactiveCanvas.value?.setPointerCapture(e.pointerId)
  } catch {
    // pointer already released / not active (synthetic events)
  }
  lastInput = toInput(e, canvasRect())
  controller.pointerDown(lastInput)
}

function onPointerMove(e: PointerEvent): void {
  if (activePointer !== null && e.pointerId !== activePointer) return
  const rect = canvasRect()
  const input = toInput(e, rect)
  lastPointer = input.screen
  if (activePointer !== null) lastInput = input
  // Pen/touch deliver several samples per frame: one move carries them all (drawing tools consume each).
  const samples = e.pointerType !== 'mouse' ? e.getCoalescedEvents?.() : undefined
  if (samples && samples.length > 1) {
    input.coalesced = samples.map(s => ({ ...toInput(s, rect).screen, pressure: s.pressure }))
  }
  controller.pointerMove(input)
}

function onPointerUp(e: PointerEvent): void {
  if (e.pointerId !== activePointer) return
  activePointer = null
  try {
    interactiveCanvas.value?.releasePointerCapture(e.pointerId)
  } catch {
    // not captured
  }
  lastInput = null
  controller.pointerUp(toInput(e, canvasRect()))
}

/** pointercancel / lostpointercapture: the event's coordinates are bogus (often 0,0), so use the last input. */
function onPointerCancel(e: PointerEvent): void {
  if (e.pointerId !== activePointer) return
  activePointer = null
  try {
    interactiveCanvas.value?.releasePointerCapture(e.pointerId)
  } catch {
    // not captured
  }
  const last = lastInput ?? toInput(e, canvasRect())
  lastInput = null
  controller.pointerCancel(last)
}

/** CSS px per wheel delta unit: pixels, lines (16 px) or pages (the canvas height). */
function wheelScale(e: WheelEvent): number {
  if (e.deltaMode === 1) return 16
  if (e.deltaMode === 2) return heightCss
  return 1
}

function onWheel(e: WheelEvent): void {
  // the style panel scrolls natively
  if (e.target instanceof Element && e.target.closest('.me-sketch-style')) return
  e.preventDefault()
  const scale = wheelScale(e)
  const dx = e.deltaX * scale
  const dy = e.deltaY * scale
  if (e.ctrlKey || e.metaKey) {
    const rect = canvasRect()
    viewport.zoomAt({ x: e.clientX - rect.left, y: e.clientY - rect.top }, viewport.zoom * Math.exp(-dy * 0.01))
  } else {
    viewport.panBy(-dx, -dy)
  }
  syncView()
}

function isTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'
}

function onKeyDown(e: KeyboardEvent): void {
  if (isTextTarget(e.target)) return
  // let focused toolbar buttons keep their native Space/Enter activation
  if (e.target instanceof HTMLButtonElement && (e.key === ' ' || e.key === 'Enter')) return
  // Alt composes `key` on macOS (Alt+Z → Ω): match the physical key
  if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.code === 'KeyZ' || e.code === 'KeyR')) {
    e.preventDefault()
    if (e.code === 'KeyZ') toggleZen()
    else viewMode.value = !viewMode.value
    return
  }
  const input = { key: e.key, code: e.code, mod: e.ctrlKey || e.metaKey, shift: e.shiftKey, alt: e.altKey }
  if (e.key === 'Escape') {
    onEscape(input)
    // always consumed by the board (the block view leaves only on an unprevented Escape it did not handle)
    e.preventDefault()
    return
  }
  if (controller.keyDown(input)) e.preventDefault()
}

/**
 * Escape, most specific first: a gesture (incl. an open multi-point line and text editing) → the controller
 * finishes / cancels it; a non-select tool → select; a selection → clear it; zen → leave zen; else exit.
 */
function onEscape(input: Parameters<ToolController['keyDown']>[0]): void {
  if (activePointer !== null || controller.isGestureActive()) {
    controller.keyDown(input)
  } else if (tool.value !== 'select' && !viewMode.value) {
    controller.setTool('select')
  } else if (controller.selectedIds.value.size > 0) {
    controller.setSelection([])
  } else if (zen.value) {
    zen.value = false
  } else {
    emit('exit')
  }
}

// ---------- clipboard ----------
// Listened for on `document`: WebKit / Gecko may target clipboard events at <body> rather than a focused
// non-editable element. They act only while focus is inside the board and not in a text field.
function boardClipboardTarget(e: ClipboardEvent): boolean {
  const el = root.value
  const active = document.activeElement
  if (!el || !active || !el.contains(active)) return false
  return !isTextTarget(e.target) && !isTextTarget(active)
}

/** Copies (and for cut, deletes) the selection; text fields inside the board keep native copy/cut. */
function onCopy(e: ClipboardEvent, cut = false): void {
  if (!boardClipboardTarget(e) || editing.value || !e.clipboardData) return
  if (cut && (locked.value || controller.isGestureActive())) return
  const els = controller.selectedElements()
  if (!els.length) return
  e.clipboardData.setData('text/plain', serializeClipboard(els))
  e.preventDefault()
  if (cut) controller.deleteSelection()
}

function onCut(e: ClipboardEvent): void {
  onCopy(e, true)
}

/** Pastes image files, sketch elements, or plain text as a text element, at the last pointer position. */
function onPaste(e: ClipboardEvent): void {
  if (!boardClipboardTarget(e) || editing.value || locked.value || controller.isGestureActive()) return
  const files = pastedImageFiles(e.clipboardData)
  if (files.length) {
    e.preventDefault()
    void insertFiles(files, lastPointer ? viewport.toScene(lastPointer) : null)
    return
  }
  const parsed = parseClipboard(e.clipboardData?.getData('text/plain') ?? '')
  if (!parsed) return
  e.preventDefault()
  const at = lastPointer ? viewport.toScene(lastPointer) : null
  if ('elements' in parsed) controller.pasteElements(parsed.elements, at)
  else controller.pasteText(parsed.text, at ?? viewport.toScene(center()))
}

const onDocCopy = (e: ClipboardEvent) => onCopy(e)

// ---------- images ----------
const fileInput = shallowRef<HTMLInputElement | null>(null)
/** Inline image error message (null = none); cleared after IMAGE_ERROR_MS. */
const imageError = ref<string | null>(null)
let imageErrorTimer: ReturnType<typeof setTimeout> | null = null

function showImageError(code: ImageInsertErrorCode): void {
  imageError.value = t.value.imageError[code]
  if (imageErrorTimer) clearTimeout(imageErrorTimer)
  imageErrorTimer = setTimeout(() => {
    imageErrorTimer = null
    imageError.value = null
  }, IMAGE_ERROR_MS)
}

/**
 * Prepares (uploads, or encodes as a data URL) and inserts each file, centered at `at` (else the view center),
 * later ones offset so they do not stack exactly. Failures show the inline error.
 */
async function insertFiles(files: File[], at: Point | null): Promise<void> {
  let offset = 0
  for (const file of files) {
    try {
      const info = await prepareImage(file, props.uploadImage ?? null)
      if (unmounted) return
      const c = at ?? viewport.toScene(center())
      controller.insertImage(info, { x: c.x + offset, y: c.y + offset })
      offset += 20
    } catch (err) {
      if (unmounted) return
      if (err instanceof ImageInsertError) showImageError(err.code)
      else {
        console.warn('sketch-block: image insert failed', err)
        showImageError('upload')
      }
    }
  }
}

/** Opens the image file picker (no-op when read-only). */
function insertImage(): void {
  if (locked.value) return
  fileInput.value?.click()
}

function onFileChosen(): void {
  const input = fileInput.value
  if (!input) return
  const files = Array.from(input.files ?? [])
  // the same file can be picked again
  input.value = ''
  if (files.length && !locked.value) void insertFiles(files, null)
}

const hasFiles = (e: DragEvent): boolean => Array.from(e.dataTransfer?.types ?? []).includes('Files')

function onDragOver(e: DragEvent): void {
  if (locked.value || !hasFiles(e)) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
}

/** Dropped image files are inserted at the drop point; a drop with only other files says so. */
function onDrop(e: DragEvent): void {
  if (locked.value || !hasFiles(e)) return
  e.preventDefault()
  const files = clipboardImageFiles(e.dataTransfer)
  if (!files.length) {
    if (e.dataTransfer?.files.length) showImageError('type')
    return
  }
  const rect = canvasRect()
  void insertFiles(files, viewport.toScene({ x: e.clientX - rect.left, y: e.clientY - rect.top }))
}

function onKeyUp(e: KeyboardEvent): void {
  if (isTextTarget(e.target)) return
  controller.keyUp({ key: e.key })
}

// ---------- lifecycle ----------
let unmounted = false

onMounted(() => {
  // images that failed earlier on this page (offline, a flaky host) get another chance
  retryFailedImages()
  // the hand font changes text metrics and glyphs: drop cached bitmaps and redraw once it is in
  void loadFonts().then(() => {
    if (unmounted) return
    // text layouts measured with the fallback font are stale too (measure.ts also clears on onFontsLoaded)
    clearTextCache()
    cache.clear()
    invalidateAll()
  })
  const el = root.value!
  el.addEventListener('wheel', onWheel, { passive: false })
  document.addEventListener('copy', onDocCopy)
  document.addEventListener('cut', onCut)
  document.addEventListener('paste', onPaste)
  measure()
  // the first update fixes cacheZoom immediately; skip it if the initial fit already did so
  if (!settlerStarted) updateSettler()
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => measure())
    resizeObserver.observe(el)
  }
  watchDpr()
})

onBeforeUnmount(() => {
  unmounted = true
  if (imageErrorTimer) clearTimeout(imageErrorTimer)
  imageErrorTimer = null
  // keep what is being typed (the editor unmounts after the board's hook)
  editor.value?.commit()
  root.value?.removeEventListener('wheel', onWheel)
  document.removeEventListener('copy', onDocCopy)
  document.removeEventListener('cut', onCut)
  document.removeEventListener('paste', onPaste)
  resizeObserver?.disconnect()
  resizeObserver = null
  dprQuery?.removeEventListener('change', onDprChange)
  dprQuery = null
  for (const off of offs.splice(0)) off()
  settler.destroy()
  scheduler.destroy()
  controller.destroy()
  // a shared session's history outlives this mount
  if (!session) history.destroy()
  scene.destroy()
  cache.clear()
})

defineExpose({
  getElements: (): readonly SketchElement[] => scene.elements,
  fit,
  /** Selects every element (as mod+A). */
  selectAll: (): void => controller.selectAll(),
  /** Scene point → px relative to the board canvas' top-left corner. */
  toScreen: (p: Point): Point => viewport.toScreen(p),
  /** Opens the image file picker; the chosen images are inserted at the view center. */
  insertImage,
})
</script>

<template>
  <div
    ref="root"
    class="me-sketch-board"
    :class="{ 'is-readonly': locked, 'is-zen': zen }"
    :data-theme="theme"
    tabindex="0"
    @keydown="onKeyDown"
    @keyup="onKeyUp"
    @dragover="onDragOver"
    @drop="onDrop"
  >
    <canvas ref="staticCanvas" class="me-sketch-canvas" aria-hidden="true" />
    <canvas
      ref="interactiveCanvas"
      class="me-sketch-canvas me-sketch-canvas--interactive"
      :style="{ cursor }"
      :aria-label="t.title"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
      @lostpointercapture="onPointerCancel"
      @contextmenu.prevent
      @dblclick="onDblClick"
    />
    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      multiple
      hidden
      tabindex="-1"
      aria-hidden="true"
      @change="onFileChosen"
    >
    <p v-if="imageError" class="me-sketch-toast" role="alert">
      {{ imageError }}
    </p>
    <TextEditor
      v-if="editing && editingEl"
      ref="editor"
      :key="editing.id"
      :element="editingEl"
      :kind="editing.kind"
      :view="view"
      :theme="theme"
      :label="editing.kind === 'frame' ? t.tools.frame : t.tools.text"
      @commit="onEditorCommit"
      @tab="onEditorTab"
    />
    <StylePanel
      :elements="selectedEls"
      :tool="tool"
      :current-style="currentStyle"
      :messages="t"
      :theme="theme"
      :readonly="readonly"
      :hidden="zen || viewMode"
      @apply="applyStyle"
      @layer="reorder"
      @align="controller.align($event)"
      @distribute="controller.distribute($event)"
      @group="controller.group()"
      @ungroup="controller.ungroup()"
      @lock="controller.toggleLock()"
    />
    <Toolbar
      v-if="!zen"
      :tool="tool"
      :locked="toolLocked"
      :readonly="readonly"
      :view-mode="viewMode"
      :messages="t"
      @select="selectTool"
      @toggle-lock="toggleLock"
    />
    <button
      v-if="zen"
      type="button"
      class="me-tool-btn me-sketch-exit-zen"
      :title="`${t.zen} (Alt+Z)`"
      @click="exitZen"
    >
      {{ t.exitZen }}
    </button>
    <button
      v-if="viewMode && !zen"
      type="button"
      class="me-tool-btn me-sketch-view-mode"
      :title="`${t.viewMode} (Alt+R)`"
      :aria-pressed="true"
      @click="viewMode = false"
    >
      {{ t.viewMode }}
    </button>
    <ZoomControls
      v-if="!zen"
      :zoom="zoom"
      :can-undo="canUndo"
      :can-redo="canRedo"
      :readonly="locked"
      :messages="t"
      @undo="undo"
      @redo="redo"
      @zoom-in="zoomTo(viewport.zoom * ZOOM_STEP)"
      @zoom-out="zoomTo(viewport.zoom / ZOOM_STEP)"
      @reset="zoomTo(1)"
      @fit="fit"
    />
  </div>
</template>
