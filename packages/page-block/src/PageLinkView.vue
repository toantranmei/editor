<script setup lang="ts">
/**
 * A page link row: icon + title, like Notion's page block. Click / Enter opens the page
 * (`open`); with `href`, modified clicks and middle-click are the browser's (new tab).
 */
import { FileQuestion, FileText } from '@lucide/vue'
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { computed, type Ref, shallowRef, watch } from 'vue'
import { pageMessages } from './messages'
import type { PageBlockOptions, PageInfo } from './types'

const props = defineProps(nodeViewProps)

const options = computed(() => props.extension.options as PageBlockOptions)
const pageId = computed(() => (props.node.attrs.pageId as string | null) || null)
const m = computed(() => pageMessages(props.editor.storage.meiConfig?.locale, options.value.messages))

// One `resolve` call per page id: the app's ref stays live while the id is the same.
// (Boxed: a shallowRef holding a ref would unwrap it.)
const source = shallowRef<{ info: Ref<PageInfo | null | undefined> } | null>(null)
watch([pageId, () => options.value.resolve], ([id, resolve]) => {
  source.value = id && resolve ? { info: resolve(id) } : null
}, { immediate: true })

/** `undefined`: loading; `null`: missing / no access. A link without an id is missing too. */
const info = computed<PageInfo | null | undefined>(() => (pageId.value ? (source.value ? source.value.info.value : null) : null))
const state = computed(() => (info.value === undefined ? 'loading' : info.value === null ? 'missing' : 'ok'))
const title = computed(() => info.value?.title?.trim() ?? '')
const icon = computed(() => info.value?.icon?.trim() || null)
const label = computed(() => {
  if (state.value === 'loading') return m.value.loading
  if (state.value === 'missing') return m.value.notFound
  return title.value || m.value.untitled
})
const href = computed(() => (pageId.value && state.value !== 'missing' ? options.value.href?.(pageId.value) ?? undefined : undefined))
const defaultIcon = computed(() => options.value.defaultIcon ?? FileText)

function onClick(event: MouseEvent) {
  const id = pageId.value
  // Let the browser open real links in a new tab / window.
  if (href.value && (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1)) return
  event.preventDefault()
  if (!id || state.value === 'missing') return
  options.value.open?.(id, event)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || !pageId.value || state.value === 'missing') return
  event.preventDefault()
  options.value.open?.(pageId.value, event)
}
</script>

<template>
  <NodeViewWrapper
    class="me-page-link"
    :class="{ 'is-selected': selected, 'is-loading': state === 'loading', 'is-missing': state === 'missing' }"
    data-type="page-link"
    :data-page-id="pageId ?? undefined"
  >
    <a
      class="me-page-link-row"
      :href="href"
      :aria-label="m.openPage.replace('{title}', label)"
      :aria-busy="state === 'loading' || undefined"
      :aria-disabled="state === 'missing' || undefined"
      draggable="false"
      contenteditable="false"
      @click="onClick"
      @keydown="onKeydown"
    >
      <span class="me-page-link-icon" aria-hidden="true">
        <FileQuestion v-if="state === 'missing'" />
        <span v-else-if="icon" class="me-page-link-emoji">{{ icon }}</span>
        <component :is="defaultIcon" v-else />
      </span>
      <span class="me-page-link-title" :class="{ 'is-muted': state !== 'ok' || !title }">{{ label }}</span>
    </a>
  </NodeViewWrapper>
</template>
