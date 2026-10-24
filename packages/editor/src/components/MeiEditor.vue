<script setup lang="ts">
import type { AnyExtension } from '@tiptap/core'
import { type Editor, EditorContent, type JSONContent, useEditor } from '@tiptap/vue-3'
import { DragHandle } from '@tiptap/extension-drag-handle-vue-3'
import type { NestedOptions } from '@tiptap/extension-drag-handle'
import type { Node as PMNode } from '@tiptap/pm/model'
import { GripVertical, Plus } from '@lucide/vue'
import { computed, inject, onBeforeUnmount, onMounted, ref, shallowRef, toRaw, useId, watch, watchEffect } from 'vue'
import type { ImageUploader } from '../config'
import { createExtensions } from '../extensions'
import { type BlockRange, currentRange, isBlockSelection, rangeOfBlock, selectBlocks } from '../block-ops'
import { kbd } from '../keys'
import { type LocaleName, type PartialMessages, resolveMessages } from '../locale'
import { GLOBAL_BLOCKS_KEY, GLOBAL_TOKENS_KEY } from '../plugin-key'
import { defaultBlocks, text } from '../blocks'
import type { BlockDefinition } from '../define-block'
import { ContentError, type ContentIssue, sanitizeContent, unwrapUnknown } from '../content'
import { assignIds } from '../extensions/block-id'
import { injectStyle, installBaseTokens, overridesCss, type ThemeMode, type ThemeTokens } from '../theme'
import BlockMenu from './BlockMenu.vue'
import FormatMenu from './FormatMenu.vue'
import MeiOutline from './MeiOutline.vue'
import TableControls from './TableControls.vue'

const props = withDefaults(defineProps<{
  /** Document as Tiptap JSON. Use with `v-model`. */
  modelValue?: JSONContent | null
  editable?: boolean
  autofocus?: boolean | 'start' | 'end'
  /** Built-in UI language. */
  locale?: LocaleName
  /** Override any UI string, e.g. `{ placeholder: 'Write…' }`. */
  messages?: PartialMessages
  /**
   * Blocks to load (read once, at mount). Defaults to the app-wide list from the
   * Vue plugin / Nuxt module, else `defaultBlocks`.
   */
  blocks?: BlockDefinition[]
  /** Uploads an image and returns its URL. Without it images are stored as base64. */
  uploadImage?: ImageUploader
  /** Max image size in MB. */
  maxImageSize?: number
  /** Extra Tiptap extensions appended to the built-in ones. */
  extensions?: AnyExtension[]
  /** Light / dark mode. `auto` follows `<html class="dark">`. */
  theme?: ThemeMode
  /** Design token overrides for this editor, e.g. `{ color: { accent: '#7c3aed' } }`. */
  tokens?: ThemeTokens
  /** URL for "Copy link to block". Default: current page URL + `#<block id>`. */
  blockLink?: (id: string) => string
  /**
   * Floating outline on the right edge (Notion-style). Shown once the page has
   * `minHeadings` headings (default 2). `false` turns it off.
   */
  outline?: boolean | { minHeadings?: number }
}>(), {
  outline: true,
  theme: 'auto',
  modelValue: null,
  editable: true,
  autofocus: false,
  locale: 'vi',
  maxImageSize: 5,
})

const emit = defineEmits<{
  'update:modelValue': [content: JSONContent]
  'ready': [editor: Editor]
  /**
   * Problems found while loading content. `fatal` means the input isn't a document:
   * the editor turns read-only and stops emitting updates so saved data isn't overwritten.
   */
  'content-error': [info: { fatal: boolean, issues: ContentIssue[], error?: Error }]
}>()

/** Set when content couldn't be read at all; blocks editing and updates until fixed. */
const contentFailed = ref(false)

// Paragraphs (`text`) are always available; other blocks come from props or app config.
const globalBlocks = inject(GLOBAL_BLOCKS_KEY, undefined)
const blocks = [text, ...(props.blocks ?? globalBlocks ?? defaultBlocks)]
  .filter((b, i, all) => all.findIndex(o => o.name === b.name) === i)

const rootEl = ref<HTMLElement | null>(null)
const outlineMin = computed(() => (typeof props.outline === 'object' ? props.outline.minHeadings ?? 2 : 2))
const hasTables = computed(() => !!editor.value?.schema.nodes.table)

const messages = computed(() => resolveMessages(props.locale, ...blocks.map(b => b.messages?.[props.locale]), props.messages))

// --- Theme ----------------------------------------------------------------
// Default tokens are injected once; per-editor overrides go in a <style> scoped by id,
// and the same scope attrs are copied onto popovers rendered in <body>.
installBaseTokens()
const instanceId = `me-${useId()}`
const globalTokens = inject(GLOBAL_TOKENS_KEY, undefined)
const scope = computed(() => ({
  'class': ['me-scope', props.theme === 'light' ? 'me-light' : props.theme === 'dark' ? 'me-dark' : ''].filter(Boolean),
  'data-me-id': instanceId,
}))
watchEffect(() => {
  const css = [
    overridesCss(globalTokens?.value, `.me-scope[data-me-id="${instanceId}"]`),
    overridesCss(props.tokens, `.me-scope[data-me-id="${instanceId}"]`),
  ].filter(Boolean).join('\n')
  injectStyle(`mei-editor-${instanceId}`, css)
})
onBeforeUnmount(() => injectStyle(`mei-editor-${instanceId}`, ''))

/**
 * Validates content (repairing or quarantining broken blocks), wraps unknown block
 * types and assigns missing ids. Never yields a blank doc for bad input: on a fatal
 * error the editor goes read-only and keeps the previous content.
 */
function prepare(doc: JSONContent | null | undefined, ed: { schema: Editor['schema'], extensionManager: Editor['extensionManager'] }): JSONContent | null | undefined {
  const types = ed.extensionManager.extensions.find(e => e.name === 'blockId')?.options.types ?? []
  const issues: ContentIssue[] = []
  try {
    const content = assignIds(sanitizeContent(doc, ed.schema, issues), types)
    contentFailed.value = false
    if (issues.some(i => i.kind !== 'unknown')) {
      console.warn('[MeiEditor] Some blocks were repaired or kept as invalid:', issues)
      emit('content-error', { fatal: false, issues })
    }
    return content
  }
  catch (error) {
    contentFailed.value = true
    console.error('[MeiEditor] Content could not be loaded:', error)
    emit('content-error', { fatal: true, issues, error: error instanceof Error ? error : new ContentError(String(error), doc) })
    return undefined
  }
}

/** Loads content unless it is unreadable (then the current doc stays, read-only). */
function load(ed: Editor, doc: JSONContent | null | undefined) {
  const content = prepare(doc, ed)
  if (content !== undefined) ed.commands.setContent(content ?? '', { emitUpdate: false })
  ed.setEditable(props.editable && !contentFailed.value)
}

// The last value we emitted, so an echoed v-model update doesn't reset the doc.
let lastEmitted: JSONContent | null = null

const editor = useEditor({
  extensions: [
    ...createExtensions({
      blocks,
      messages: messages.value,
      locale: props.locale,
      uploadImage: props.uploadImage ?? null,
      maxImageSize: props.maxImageSize,
      scope: scope.value,
    }),
    ...(props.extensions ?? []),
  ],
  content: null,
  editable: props.editable,
  autofocus: props.autofocus,
  editorProps: {
    attributes: { class: 'me-content', spellcheck: 'false' },
  },
  onCreate: ({ editor }) => {
    // Load content after the schema exists, so unknown block types can be wrapped.
    load(editor as Editor, toRaw(props.modelValue))
    emit('ready', editor as Editor)
  },
  onUpdate: ({ editor }) => {
    if (contentFailed.value) return
    lastEmitted = unwrapUnknown(editor.getJSON())
    emit('update:modelValue', lastEmitted)
  },
})

// Only reload the document for real external changes. `v-model` on a `ref()` hands
// back a reactive proxy of what we emitted, so compare the raw object, then content.
watch(() => props.modelValue, (value) => {
  const ed = editor.value
  const raw = value ? toRaw(value) : null
  if (!ed || raw === lastEmitted) return
  if (raw && JSON.stringify(raw) === JSON.stringify(unwrapUnknown(ed.getJSON()))) return
  load(ed, raw)
})
watch(() => props.editable, value => editor.value?.setEditable(value && !contentFailed.value))
watch([messages, () => props.locale, () => props.uploadImage, () => props.maxImageSize, scope], () => {
  const config = editor.value?.storage.meiConfig
  if (!config) return
  config.messages = messages.value
  config.locale = props.locale
  config.uploadImage = props.uploadImage ?? null
  config.maxImageSize = props.maxImageSize
  config.scope = scope.value
})

defineExpose({ editor })

// --- Drag handle + block menu -------------------------------------------
// Show the handle for top-level blocks and for blocks directly inside a column
// (not for list items, table cells, callout children...). On ties the deeper
// node wins, so inside a column you grab the block, not the whole columns row.
const nestedOptions: NestedOptions = {
  defaultRules: false,
  edgeDetection: 'none',
  rules: [{
    id: 'blockLevelOnly',
    evaluate: ({ node, parent }) => {
      if (!parent || node.type.name === 'column') return 1000
      return ['doc', 'column'].includes(parent.type.name) ? 0 : 1000
    },
  }],
}

interface HoveredBlock { node: PMNode, pos: number }
const hovered = shallowRef<HoveredBlock | null>(null)
const menu = shallowRef<{ range: BlockRange, anchor: DOMRect } | null>(null)

function onNodeChange({ node, pos }: { node: PMNode | null, pos: number }) {
  if (menu.value) return
  hovered.value = node ? { node, pos } : null
}

// Lets the BlockDrop extension take over the drop (see block-drop.ts).
function onDragStart() {
  const config = editor.value?.storage.blockDrop
  if (config) config.active = true
}

function setHandleLocked(locked: boolean) {
  const ed = editor.value
  if (ed && !ed.isDestroyed) ed.view.dispatch(ed.state.tr.setMeta('lockDragHandle', locked))
}

function showMenu(range: BlockRange, anchor: DOMRect) {
  const ed = editor.value
  if (!ed) return
  hideTooltip()
  selectBlocks(ed, range)
  menu.value = { range, anchor }
  setHandleLocked(true)
}

/** ⋮⋮ click: act on the whole block selection if the block is part of it, else select just this block. */
function openMenu(e: MouseEvent) {
  const ed = editor.value
  if (!ed || !hovered.value) return
  const own = rangeOfBlock({ ...hovered.value, depth: ed.state.doc.resolve(hovered.value.pos).depth })
  const sel = isBlockSelection(ed.state) ? currentRange(ed.state) : null
  const range = sel && own.from >= sel.from && own.to <= sel.to ? sel : own
  showMenu(range, (e.currentTarget as HTMLElement).getBoundingClientRect())
}

/** ⌘/: open the menu next to the first selected block. */
function openMenuAt(range: BlockRange) {
  const dom = editor.value?.view.nodeDOM(range.from)
  if (!(dom instanceof HTMLElement)) return
  const r = dom.getBoundingClientRect()
  showMenu(range, new DOMRect(r.left, r.top, 0, Math.min(r.height, 24)))
}

/** Closing keeps the blocks selected (like Notion) so shortcuts keep working. */
function closeMenu() {
  menu.value = null
  setHandleLocked(false)
  editor.value?.view.focus()
}

// --- Copy link to block ---------------------------------------------------
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined
function showToast(text: string) {
  toast.value = text
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 1800)
}
async function copyLink(id: string) {
  const url = props.blockLink?.(id) ?? `${location.href.split('#')[0]}#${id}`
  try {
    await navigator.clipboard.writeText(url)
  }
  catch {}
  showToast(messages.value.blockMenu.linkCopied)
}

/** Scroll to and select the block named in the URL hash (target of a copied link). */
function revealHashBlock() {
  const ed = editor.value
  const id = decodeURIComponent(location.hash.slice(1))
  if (!ed || !id) return
  let found: BlockRange | null = null
  ed.state.doc.descendants((node, pos) => {
    if (found) return false
    if (node.attrs.id === id) found = { from: pos, to: pos + node.nodeSize, depth: ed.state.doc.resolve(pos).depth }
  })
  if (!found) return
  selectBlocks(ed, found)
  ;(ed.view.nodeDOM((found as BlockRange).from) as HTMLElement | null)?.scrollIntoView({ block: 'center' })
}

// --- Handle tooltips --------------------------------------------------------
const tooltip = shallowRef<{ lines: [string, string][], hint?: string, rect: DOMRect } | null>(null)
let tooltipTimer: ReturnType<typeof setTimeout> | undefined
function showTooltip(e: MouseEvent, kind: 'add' | 'grip') {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const h = messages.value.handle
  const lines: [string, string][] = kind === 'add'
    ? [[h.clickVerb, h.add], [h.altClickVerb, h.addAbove]]
    : [[h.dragVerb, h.drag], [h.clickVerb, h.menu]]
  clearTimeout(tooltipTimer)
  tooltipTimer = setTimeout(() => (tooltip.value = { lines, hint: kind === 'grip' ? kbd('Mod-/') : undefined, rect }), 500)
}
function hideTooltip() {
  clearTimeout(tooltipTimer)
  tooltip.value = null
}

/** "+" button: add an empty line below the hovered block and open the slash menu. */
function addBlock(e: MouseEvent) {
  const ed = editor.value
  if (!ed || !hovered.value) return
  const { node, pos } = hovered.value
  if (node.type.name === 'paragraph' && node.content.size === 0) {
    ed.chain().focus().setTextSelection(pos + 1).insertContent('/').run()
    return
  }
  // Alt-click inserts above, like Notion.
  const at = e.altKey ? pos : pos + node.nodeSize
  ed.chain()
    .insertContentAt(at, { type: 'paragraph', content: [{ type: 'text', text: '/' }] })
    .setTextSelection(at + 2)
    .focus()
    .run()
}

function focusEnd() {
  const ed = editor.value
  if (!ed || !ed.isEditable) return
  const last = ed.state.doc.lastChild
  if (last?.type.name === 'paragraph' && last.content.size === 0) ed.commands.focus('end')
  else ed.chain().insertContentAt(ed.state.doc.content.size, { type: 'paragraph' }).focus('end').run()
}

watch(editor, (ed) => {
  if (!ed) return
  ed.storage.blockSelection.openMenu = openMenuAt
  revealHashBlock()
}, { immediate: true })
onMounted(() => window.addEventListener('hashchange', revealHashBlock))
onBeforeUnmount(() => {
  window.removeEventListener('hashchange', revealHashBlock)
  clearTimeout(toastTimer)
  clearTimeout(tooltipTimer)
  editor.value?.destroy()
})
</script>

<template>
  <div v-if="editor" ref="rootEl" v-bind="scope" class="me-root">
    <DragHandle
      :editor="editor"
      :nested="nestedOptions"
      :on-node-change="onNodeChange"
      :on-element-drag-start="onDragStart"
      :compute-position-config="{ placement: 'left-start', strategy: 'absolute' }"
      class="me-drag-handle"
    >
      <div class="me-handle">
        <button type="button" class="me-handle-btn" @click="addBlock" @mouseenter="showTooltip($event, 'add')" @mouseleave="hideTooltip" @mousedown="hideTooltip">
          <Plus />
        </button>
        <button
          type="button"
          class="me-handle-btn me-handle-btn--grab"
          @click="openMenu"
          @mouseenter="showTooltip($event, 'grip')"
          @mouseleave="hideTooltip"
          @mousedown="hideTooltip"
        >
          <GripVertical />
        </button>
      </div>
    </DragHandle>

    <!-- Static wrapper: the drag handle plugin moves its own DOM, so conditional siblings need a fixed anchor. -->
    <div class="me-content-error-slot">
      <div v-if="contentFailed" class="me-content-error" role="alert">
        {{ messages.contentError }}
      </div>
    </div>
    <FormatMenu :editor="editor" />
    <EditorContent :editor="editor" />
    <TableControls v-if="hasTables && editable" :editor="editor" />
    <MeiOutline v-if="outline" :editor="editor" :min-headings="outlineMin" :root="rootEl" />
    <div v-if="editable" class="me-editor-tail" @click="focusEnd" />

    <BlockMenu
      v-if="menu"
      :editor="editor"
      :range="menu.range"
      :anchor="menu.anchor"
      @close="closeMenu"
      @copy-link="copyLink"
    />

    <Teleport to="body">
      <div
        v-if="tooltip"
        v-bind="scope"
        class="me-tooltip"
        :style="{ left: `${tooltip.rect.left + tooltip.rect.width / 2}px`, top: `${tooltip.rect.top}px` }"
      >
        <div v-for="[verb, text] in tooltip.lines" :key="verb">
          <strong class="me-tooltip-verb">{{ verb }}</strong> {{ text }}
        </div>
        <div v-if="tooltip.hint" class="me-tooltip-hint">
          {{ tooltip.hint }}
        </div>
      </div>
      <div v-if="toast" v-bind="scope" class="me-toast">
        {{ toast }}
      </div>
    </Teleport>
  </div>
</template>
