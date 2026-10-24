<script setup lang="ts">
/**
 * Notion-style HTML block. The page runs in a sandboxed iframe of fixed height; it only
 * takes clicks/scrolls after "Interact" (so scrolling the document isn't hijacked).
 * Editors can switch to Code to edit in place, upload an .html file, or drag the height.
 */
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { Code, CodeXml, Eye, Maximize2, Pointer, Upload, X } from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useClickOutside } from '../composables/useClickOutside'
import { useEditable } from '../composables/useEditable'
import { useScope } from '../composables/useScope'
import { loadLanguage, lowlight } from '../extensions/code-block'
import { HTML_MAX_HEIGHT, HTML_MIN_HEIGHT, type HtmlBlockOptions, htmlBlockDocument } from '../extensions/html-block'

const props = defineProps(nodeViewProps)

const scope = useScope(() => props.editor)
const editable = useEditable(props.editor)
const m = computed(() => props.editor.storage.meiConfig.messages.html)
const options = computed(() => props.extension.options as HtmlBlockOptions)
const code = computed(() => (props.node.attrs.code as string) ?? '')
const height = computed(() => (props.node.attrs.height as number | null) ?? options.value.defaultHeight)
const name = computed(() => (props.node.attrs.fileName as string | null) || m.value.title)
const srcdoc = computed(() => htmlBlockDocument(code.value, options.value.network))

// --- Modes ----------------------------------------------------------------------
const mode = ref<'preview' | 'code'>('preview')
const interacting = ref(false)
const fullscreen = ref(false)
const root = ref<HTMLElement | null>(null)
useClickOutside(root, interacting, () => (interacting.value = false))

function showCode() {
  error.value = ''
  mode.value = 'code'
  interacting.value = false
  nextTick(() => textarea.value?.focus())
}
function showPreview() {
  error.value = ''
  commit()
  mode.value = 'preview'
}

// Read-only: back to the preview.
watch(editable, (value) => {
  if (!value && mode.value === 'code') showPreview()
})

// --- Code editor ----------------------------------------------------------------
const draft = ref(code.value)
watch(code, (value) => {
  if (value !== draft.value) draft.value = value
})
const textarea = ref<HTMLTextAreaElement | null>(null)
const highlightEl = ref<HTMLElement | null>(null)

let timer: ReturnType<typeof setTimeout> | undefined
function commit() {
  clearTimeout(timer)
  if (draft.value !== code.value) props.updateAttributes({ code: draft.value })
}
function onInput() {
  clearTimeout(timer)
  timer = setTimeout(commit, 400)
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Tab') {
    // Indent instead of leaving the editor.
    e.preventDefault()
    const el = e.target as HTMLTextAreaElement
    el.setRangeText('  ', el.selectionStart, el.selectionEnd, 'end')
    draft.value = el.value
    onInput()
  }
  else if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
    e.preventDefault()
    showPreview()
  }
}
function syncScroll() {
  if (highlightEl.value && textarea.value) {
    highlightEl.value.scrollTop = textarea.value.scrollTop
    highlightEl.value.scrollLeft = textarea.value.scrollLeft
  }
}

// Syntax colors: HTML grammar plus the CSS/JS it embeds, loaded on first use.
const grammarReady = ref(false)
watch(mode, (value) => {
  if (value === 'code' && !grammarReady.value) {
    Promise.all(['xml', 'css', 'javascript'].map(loadLanguage)).then(() => (grammarReady.value = true))
  }
}, { immediate: true })

type HastNode = { type: string, value?: string, tagName?: string, properties?: { className?: string[] }, children?: HastNode[] }
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
function toHtml(node: HastNode): string {
  if (node.type === 'text') return escapeHtml(node.value ?? '')
  const inner = (node.children ?? []).map(toHtml).join('')
  if (node.type === 'element') return `<span class="${(node.properties?.className ?? []).join(' ')}">${inner}</span>`
  return inner
}
const highlighted = computed(() => {
  // Trailing newline keeps the last line's height in sync with the textarea.
  const text = `${draft.value}\n`
  if (!grammarReady.value || !lowlight.registered('xml')) return escapeHtml(text)
  return toHtml(lowlight.highlight('xml', text) as HastNode)
})

// --- Upload ---------------------------------------------------------------------
const fileInput = ref<HTMLInputElement | null>(null)
const error = ref('')
async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!/\.html?$/i.test(file.name) && file.type !== 'text/html') {
    error.value = m.value.wrongType
    return
  }
  if (file.size > options.value.maxSize * 1024) {
    error.value = m.value.tooLarge(options.value.maxSize)
    return
  }
  error.value = ''
  const text = await file.text()
  draft.value = text
  props.updateAttributes({ code: text, fileName: file.name })
  mode.value = 'preview'
}

// --- Resize & fullscreen --------------------------------------------------------
const resizing = ref(false)
function startResize(e: PointerEvent) {
  e.preventDefault()
  resizing.value = true
  const startY = e.clientY
  const startH = height.value
  const move = (ev: PointerEvent) => {
    props.updateAttributes({ height: Math.round(Math.min(HTML_MAX_HEIGHT, Math.max(HTML_MIN_HEIGHT, startH + ev.clientY - startY))) })
  }
  const up = () => {
    resizing.value = false
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function onFullscreenKey(e: KeyboardEvent) {
  if (e.key === 'Escape') fullscreen.value = false
}
watch(fullscreen, (open) => {
  if (open) window.addEventListener('keydown', onFullscreenKey)
  else window.removeEventListener('keydown', onFullscreenKey)
})
onBeforeUnmount(() => {
  commit()
  window.removeEventListener('keydown', onFullscreenKey)
})

// Sandbox: scripts, forms and dialogs run, but never with the editor's origin.
const SANDBOX = 'allow-scripts allow-forms allow-modals allow-popups allow-pointer-lock allow-downloads'
</script>

<template>
  <NodeViewWrapper class="me-html" :class="{ 'is-selected': selected, 'is-readonly-empty': !editable && !code }">
    <div ref="root" class="me-html-frame" contenteditable="false">
      <div class="me-block-bar me-html-bar">
        <CodeXml />
        <span class="me-html-name">{{ name }}</span>
        <div v-if="editable" class="me-tabs me-tabs--inline" role="tablist">
          <button type="button" class="me-tab" :class="{ 'is-active': mode === 'code' }" role="tab" :aria-selected="mode === 'code'" @click="showCode">
            <Code /> {{ m.code }}
          </button>
          <button type="button" class="me-tab" :class="{ 'is-active': mode === 'preview' }" role="tab" :aria-selected="mode === 'preview'" @click="showPreview">
            <Eye /> {{ m.preview }}
          </button>
        </div>
        <button v-if="editable" type="button" class="me-tool-btn" :title="m.upload" @click="fileInput?.click()">
          <Upload />
        </button>
        <button v-if="code" type="button" class="me-tool-btn" :title="m.expand" @click="commit(); fullscreen = true">
          <Maximize2 />
        </button>
        <input ref="fileInput" type="file" accept=".html,.htm,text/html" hidden @change="onFile">
      </div>

      <p v-if="error" class="me-error me-html-error">
        {{ error }}
      </p>

      <!-- Empty block: write or upload. -->
      <!-- Same layout and buttons as the image/file upload placeholders. -->
      <div v-if="mode === 'preview' && !code" class="me-media-body me-html-empty">
        <div v-if="editable" class="me-inline-form">
          <button type="button" class="me-btn" @click="showCode">
            <Code /> {{ m.write }}
          </button>
          <button type="button" class="me-btn" @click="fileInput?.click()">
            <Upload /> {{ m.uploadFile }}
          </button>
        </div>
        <p class="me-hint">
          {{ m.emptyHint }}
        </p>
      </div>

      <div v-else-if="mode === 'preview'" class="me-html-body" :style="{ height: `${height}px` }">
        <iframe
          class="me-html-iframe"
          :class="{ 'is-live': interacting }"
          :srcdoc="srcdoc"
          :sandbox="SANDBOX"
          :title="name"
          loading="lazy"
          referrerpolicy="no-referrer"
        />
        <!-- Until "Interact", clicks and wheel go to the page, not the frame (like Notion). -->
        <div v-if="!interacting" class="me-html-cover" @dblclick="interacting = true">
          <button type="button" class="me-btn me-btn--floating" @click="interacting = true">
            <Pointer /> {{ m.interact }}
          </button>
        </div>
      </div>

      <div v-else class="me-html-editor" :style="{ height: `${height}px` }">
        <!-- A div, not <pre>: ProseMirror's unlayered `pre` styles would make it wrap. -->
        <div ref="highlightEl" class="me-html-highlight" aria-hidden="true" v-html="highlighted" />
        <textarea
          ref="textarea"
          v-model="draft"
          class="me-html-textarea"
          spellcheck="false"
          wrap="off"
          autocapitalize="off"
          autocomplete="off"
          :placeholder="m.placeholder"
          @input="onInput"
          @blur="commit"
          @scroll="syncScroll"
          @keydown="onKeydown"
        />
      </div>

      <!-- Iframes swallow pointer events; cover them while resizing. -->
      <div v-if="resizing" class="me-embed-overlay" />
      <span v-if="editable" class="me-embed-resize" @pointerdown="startResize" />
    </div>

    <Teleport to="body">
      <div v-if="fullscreen" v-bind="scope" class="me-html-modal" @mousedown.self="fullscreen = false">
        <div class="me-html-modal-panel">
          <div class="me-block-bar me-html-bar">
            <CodeXml />
            <span class="me-html-name">{{ name }}</span>
            <button type="button" class="me-tool-btn" :title="m.close" @click="fullscreen = false">
              <X />
            </button>
          </div>
          <iframe class="me-html-iframe is-live" :srcdoc="srcdoc" :sandbox="SANDBOX" :title="name" referrerpolicy="no-referrer" />
        </div>
      </div>
    </Teleport>
  </NodeViewWrapper>
</template>
