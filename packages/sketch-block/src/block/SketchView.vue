<script setup lang="ts">
/**
 * Whiteboard block. Shows the stored preview image until "Interact" (like the HTML block);
 * only then is the board engine loaded and the board opened from its provider. The inline
 * board and the fullscreen modal share one connection.
 */
import { Maximize2, PenTool, Pointer, X } from '@lucide/vue'
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { useClickOutside, useEditable, useScope } from '@toantranmei/editor'
import { computed, getCurrentInstance, markRaw, nextTick, onBeforeUnmount, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { messages } from '../messages'
import type { SketchElement } from '../model/types'
import type { BoardConnection, SketchProvider } from '../providers/types'
import { liveViews } from './live'
import { newBoardId, SKETCH_MAX_HEIGHT, SKETCH_MIN_HEIGHT, type SketchOptions } from './node'

type Engine = typeof import('../engine')
interface BoardHandle { getElements(): readonly SketchElement[], fit(): void }

declare global {
  interface Window { __sketchDebug?: { getElements(): readonly SketchElement[] } }
}

const SAVE_DELAY = 2000

const props = defineProps(nodeViewProps)

const scope = useScope(() => props.editor)
const editable = useEditable(props.editor)
const locale = computed(() => (props.editor.storage.meiConfig?.locale === 'en' ? 'en' : 'vi'))
const m = computed(() => messages[locale.value])
const options = computed(() => props.extension.options as SketchOptions)
const boardId = computed(() => (props.node.attrs.boardId as string | null) ?? null)
const preview = computed(() => (props.node.attrs.preview as string | null) ?? null)
const height = computed(() => (props.node.attrs.height as number | null) ?? options.value.defaultHeight)

// --- Theme ----------------------------------------------------------------------
// The app's own dark class isn't reactive; watch it so an open board follows it.
const htmlDark = ref(false)
let themeObserver: MutationObserver | null = null
onMounted(() => {
  const html = document.documentElement
  htmlDark.value = html.classList.contains('dark')
  if (typeof MutationObserver !== 'undefined') {
    themeObserver = new MutationObserver(() => (htmlDark.value = html.classList.contains('dark')))
    themeObserver.observe(html, { attributes: true, attributeFilter: ['class'] })
  }
})
const theme = computed<'light' | 'dark'>(() => {
  const cls = scope.value.class ?? []
  if (cls.includes('me-dark')) return 'dark'
  return htmlDark.value && !cls.includes('me-light') ? 'dark' : 'light'
})

// --- Modes ----------------------------------------------------------------------
const interacting = ref(false)
const fullscreen = ref(false)
const live = computed(() => interacting.value || fullscreen.value)
const loading = ref(false)
const error = ref('')
const root = ref<HTMLElement | null>(null)
const board = shallowRef<BoardHandle | null>(null)

// --- Connection (opened on first use, shared by inline and fullscreen) -----------
// Held raw: Vue proxies around Yjs types break Yjs identity checks.
const engine = shallowRef<Engine | null>(null)
const connection = shallowRef<BoardConnection | null>(null)
const notOnDevice = ref(false)
let provider: SketchProvider | null = null
let opening: Promise<boolean> | null = null
let disposed = false

function ensureOpen(): Promise<boolean> {
  if (engine.value && connection.value) return Promise.resolve(true)
  return (opening ??= open().finally(() => (opening = null)))
}

async function open(): Promise<boolean> {
  let id = boardId.value
  if (!id) {
    // e.g. pasted HTML without an id: give it one (read-only shows the preview only)
    if (!editable.value) return false
    id = newBoardId()
    const assigned = id
    setAttrs(node => ({ ...node.attrs, boardId: assigned }))
  }
  loading.value = true
  error.value = ''
  try {
    const [mod, prov] = await Promise.all([import('../engine'), props.editor.storage.sketch.provider()])
    const conn = await prov.connect(id)
    if (disposed || boardId.value !== id) {
      conn.destroy()
      return false
    }
    provider = prov
    engine.value = markRaw(mod)
    connection.value = markRaw(conn)
    // The board isn't stored here (another device, cleared storage): say so, keep the preview.
    notOnDevice.value = !conn.existed && !!preview.value
    return true
  }
  catch (err) {
    console.warn('[sketch] could not open board', err)
    error.value = m.value.loadError
    return false
  }
  finally {
    loading.value = false
  }
}

function closeConnection() {
  const conn = connection.value
  connection.value = null
  notOnDevice.value = false
  // Let the board unmount (and drop its listeners) before the doc goes away.
  if (conn) nextTick(() => conn.destroy())
}

async function enter() {
  if (live.value || loading.value) return
  if (await ensureOpen()) interacting.value = true
}

async function openFullscreen() {
  if (fullscreen.value) return
  if (await ensureOpen()) {
    // Only one board is mounted at a time: the inline one gives way to the modal.
    interacting.value = false
    fullscreen.value = true
  }
}

/** Leaves interact and fullscreen, saving the preview if the board was edited. */
function leave() {
  if (!live.value) return
  const elements = snapshot()
  interacting.value = false
  fullscreen.value = false
  void save(elements)
}

useClickOutside(root, interacting, leave)

function onKeydown(e: KeyboardEvent) {
  // The board handles Escape itself first (clearing a selection prevents default).
  if (e.key === 'Escape' && !e.defaultPrevented) leave()
}
// Lock the document while live (see node.ts); keyed by this view.
const liveToken = {}
const liveSet = () => props.editor.storage.sketch?.live
watch(live, (on) => {
  if (on) {
    window.addEventListener('keydown', onKeydown)
    liveSet()?.add(liveToken)
  }
  else {
    window.removeEventListener('keydown', onKeydown)
    liveSet()?.delete(liveToken)
  }
})

// Keys must go to the board, not to the document: move focus into it once mounted
// (entering by double-click or a button click leaves focus in ProseMirror).
watch(board, (b) => {
  if (!b) return
  nextTick(() => {
    const el = (b as unknown as { $el?: HTMLElement }).$el
    el?.focus?.({ preventScroll: true })
  })
})

// --- Preview ---------------------------------------------------------------------
let edited = false
let timer: ReturnType<typeof setTimeout> | undefined
let warned = false
let saveSeq = 0

function snapshot(): readonly SketchElement[] | null {
  return board.value ? [...board.value.getElements()] : null
}

function onChange() {
  edited = true
  if (!editable.value) return
  clearTimeout(timer)
  timer = setTimeout(() => void save(snapshot()), SAVE_DELAY)
}

type SketchNodeT = typeof props.node

/**
 * Changes this node's attrs outside the document's undo history: editor undo only undoes
 * inserting or deleting the block, never a board id, preview or version.
 */
function setAttrs(next: (node: SketchNodeT) => Record<string, unknown>) {
  const { editor } = props
  const pos = props.getPos()
  if (editor.isDestroyed || typeof pos !== 'number') return
  editor.commands.command(({ tr }) => {
    const node = tr.doc.nodeAt(pos)
    if (node?.type.name !== 'sketch') return false
    tr.setNodeMarkup(pos, undefined, next(node)).setMeta('addToHistory', false)
    return true
  })
}

/**
 * Writes preview/version for board `id`: to this node while it still shows that board, else
 * (after unmount, or once the view shows another board) to every node showing it.
 */
function writeAttrs(attrs: { preview: string | null }, id: string) {
  const bump = (node: SketchNodeT) => ({ ...node.attrs, ...attrs, version: ((node.attrs.version as number) ?? 0) + 1 })
  if (!disposed && boardId.value === id) {
    setAttrs(bump)
    return
  }
  const { editor } = props
  if (editor.isDestroyed) return
  editor.commands.command(({ tr }) => {
    let changed = false
    tr.doc.descendants((node, pos) => {
      if (node.type.name === 'sketch' && node.attrs.boardId === id) {
        tr.setNodeMarkup(pos, undefined, bump(node))
        changed = true
      }
    })
    tr.setMeta('addToHistory', false)
    return changed
  })
}

async function save(elements: readonly SketchElement[] | null) {
  clearTimeout(timer)
  timer = undefined
  const id = boardId.value
  if (!edited || !editable.value || !elements || !engine.value || !id) return
  edited = false
  // Saves can overlap (debounce, then leave, with a slow savePreview): only the newest lands.
  const seq = ++saveSeq
  try {
    const result = await engine.value.makePreview(elements)
    let next: string | null = null
    if (result) next = provider?.savePreview ? await provider.savePreview(id, result.blob) : result.dataUrl
    if (seq !== saveSeq) return
    writeAttrs({ preview: next }, id)
  }
  catch (err) {
    if (seq !== saveSeq) return
    // Keep the old preview; try again on the next edit.
    edited = true
    if (!warned) {
      warned = true
      console.warn('[sketch] could not save the board preview', err)
    }
  }
}

// --- Debug hook for e2e tests ----------------------------------------------------
if (import.meta.env.DEV) {
  watch(board, (b) => {
    if (b && typeof window !== 'undefined') window.__sketchDebug = { getElements: () => b.getElements() }
  })
}

// --- Board id changes (undo, collaboration): start over with the new board --------
watch(boardId, () => {
  clearTimeout(timer)
  edited = false
  interacting.value = false
  fullscreen.value = false
  closeConnection()
})

// --- Resize ----------------------------------------------------------------------
const dragHeight = ref<number | null>(null)
const shownHeight = computed(() => dragHeight.value ?? height.value)
const resizing = computed(() => dragHeight.value !== null)
const clampHeight = (h: number) => Math.round(Math.min(SKETCH_MAX_HEIGHT, Math.max(SKETCH_MIN_HEIGHT, h)))

function startResize(e: PointerEvent) {
  e.preventDefault()
  const startY = e.clientY
  const startH = height.value
  dragHeight.value = startH
  const move = (ev: PointerEvent) => (dragHeight.value = clampHeight(startH + ev.clientY - startY))
  const up = (ev: PointerEvent) => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    const next = clampHeight(startH + ev.clientY - startY)
    dragHeight.value = null
    if (next !== props.node.attrs.height) props.updateAttributes({ height: next })
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

// --- Teardown --------------------------------------------------------------------
onBeforeUnmount(() => {
  // The board is still mounted here: take what it shows for a pending save.
  const elements = timer !== undefined || live.value ? snapshot() : null
  window.removeEventListener('keydown', onKeydown)
  liveSet()?.delete(liveToken)
  themeObserver?.disconnect()
  disposed = true
  if (elements) void save(elements)
  clearTimeout(timer)
})
onUnmounted(() => {
  const conn = connection.value
  connection.value = null
  conn?.destroy()
})

// ProseMirror asks the node view whether to swallow events (see node.ts).
const instance = getCurrentInstance()
onMounted(() => {
  const el = instance?.proxy?.$el as Element | undefined
  if (el) liveViews.set(el, () => live.value)
})
</script>

<template>
  <NodeViewWrapper class="me-sketch" :class="{ 'is-selected': selected, 'is-live': interacting }">
    <div ref="root" class="me-sketch-frame" contenteditable="false">
      <div class="me-block-bar me-sketch-bar">
        <PenTool />
        <span class="me-sketch-name">{{ m.title }}</span>
        <span v-if="loading" class="me-sketch-loading" role="status">{{ m.loading }}</span>
        <button type="button" class="me-tool-btn me-sketch-expand" :title="m.expand" :disabled="loading" @click="openFullscreen">
          <Maximize2 />
        </button>
      </div>

      <p v-if="error" class="me-error me-sketch-error">
        {{ error }}
      </p>
      <p v-if="notOnDevice && interacting" class="me-sketch-notice">
        {{ m.notOnDevice }}
      </p>

      <div class="me-sketch-body" :style="{ height: `${shownHeight}px` }">
        <component
          :is="engine.SketchBoard"
          v-if="interacting && engine && connection"
          :key="boardId ?? ''"
          ref="board"
          :connection="connection"
          :readonly="!editable"
          :locale="locale"
          :theme="theme"
          @change="onChange"
          @exit="leave"
        />
        <template v-else>
          <img v-if="preview" class="me-sketch-preview" :src="preview" alt="" draggable="false">
          <p v-else class="me-sketch-empty">
            {{ m.empty }}
          </p>
          <!-- Until "Interact", clicks and wheel go to the page, not the board (like Notion). -->
          <div class="me-sketch-cover" @dblclick="enter">
            <button type="button" class="me-btn me-btn--floating" :disabled="loading" @click="enter">
              <Pointer /> {{ loading ? m.loading : m.interact }}
            </button>
          </div>
        </template>
        <div v-if="resizing" class="me-embed-overlay" />
      </div>
      <span v-if="editable && !fullscreen" class="me-embed-resize" @pointerdown="startResize" />
    </div>

    <Teleport to="body">
      <div v-if="fullscreen && engine && connection" v-bind="scope" class="me-sketch-modal" @mousedown.self="leave">
        <div class="me-sketch-modal-panel">
          <div class="me-block-bar me-sketch-bar">
            <PenTool />
            <span class="me-sketch-name">{{ m.title }}</span>
            <button type="button" class="me-tool-btn" :title="m.close" @click="leave">
              <X />
            </button>
          </div>
          <p v-if="notOnDevice" class="me-sketch-notice">
            {{ m.notOnDevice }}
          </p>
          <div class="me-sketch-modal-body">
            <component
              :is="engine.SketchBoard"
              :key="boardId ?? ''"
              ref="board"
              :connection="connection"
              :readonly="!editable"
              :locale="locale"
              :theme="theme"
              @change="onChange"
              @exit="leave"
            />
          </div>
        </div>
      </div>
    </Teleport>
  </NodeViewWrapper>
</template>
