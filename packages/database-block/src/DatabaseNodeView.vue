<script setup lang="ts">
/**
 * Node view of `databaseView`: resolves the database's `DatabaseSource` (cached per id) and shows it inline, or as a
 * link row for a full-page database (`inline: false`).
 */
import { Database } from '@lucide/vue'
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { useEditable, useScope } from '@toantranmei/editor'
import { computed, shallowRef, watch } from 'vue'
import { DatabaseView } from './lazy'
import { databaseMessages } from './messages'
import { resolveSource } from './sources'
import type { DatabaseBlockOptions, DatabaseSource } from './types'

const props = defineProps(nodeViewProps)
const options = computed(() => props.extension.options as DatabaseBlockOptions)
const databaseId = computed(() => (props.node.attrs.databaseId as string | null) || null)
const inline = computed(() => props.node.attrs.inline !== false)
const locale = computed(() => (props.editor.storage.meiConfig?.locale ?? 'vi') as 'vi' | 'en' | 'zh')
const m = computed(() => databaseMessages(locale.value, options.value.messages))
const scope = useScope(() => props.editor)
const editable = useEditable(props.editor)

const source = shallowRef<DatabaseSource | null>(null)
const state = shallowRef<'loading' | 'ready' | 'missing'>('loading')
let seq = 0
watch([databaseId, () => options.value.source], async ([id, factory]) => {
  const mine = ++seq
  source.value = null
  if (!id || !factory) {
    state.value = 'missing'
    return
  }
  state.value = 'loading'
  try {
    const s = await resolveSource(factory, id)
    if (mine !== seq) return
    source.value = s
    state.value = 'ready'
  }
  catch (error) {
    if (mine !== seq) return
    state.value = 'missing'
    if (options.value.onError) options.value.onError(error)
    else console.error('[database-block]', error)
  }
}, { immediate: true })

function setView(viewId: string) {
  if (props.editor.isEditable && viewId !== props.node.attrs.viewId) props.updateAttributes({ viewId })
}
const linkTitle = computed(() => source.value?.meta.value?.title?.trim() || m.value.untitled)
/**
 * A mousedown inside the database UI would move the document selection into the (non-editable) node, which the
 * editor turns into a selection of the whole block. Keep the selection where it is and focus the control instead.
 * Text fields, selects and draggable parts (row / column / card drag) keep their default behavior.
 */
function onMouseDown(e: MouseEvent) {
  const target = e.target as HTMLElement | null
  if (!target || e.button !== 0) return
  const ui = e.currentTarget as HTMLElement
  // Text fields and drag sources (rows, columns, cards) keep their default. Only look inside the UI: the editor root
  // is contenteditable and the node view wrapper is draggable.
  const keep = target.closest('input, textarea, select, label, [contenteditable="true"], [draggable="true"]')
  if (keep && ui.contains(keep)) return
  e.preventDefault()
  const focusable = target.closest<HTMLElement>('button, a[href], [tabindex]')
  focusable?.focus({ preventScroll: true })
}

function openLink(e: MouseEvent | KeyboardEvent) {
  if (databaseId.value && state.value !== 'missing') options.value.open?.(databaseId.value, e)
}
</script>

<template>
  <NodeViewWrapper
    class="me-db-node"
    :class="{ 'is-selected': selected, 'is-link': !inline }"
    data-type="database-view"
    :data-database-id="databaseId ?? undefined"
  >
    <div class="me-db-ui" contenteditable="false" @mousedown="onMouseDown">
    <div v-if="state === 'loading'" class="me-db-empty">{{ m.loading }}</div>
    <div v-else-if="state === 'missing' || !source" class="me-db-empty is-missing">{{ m.notFound }}</div>
    <a
      v-else-if="!inline"
      class="me-db-link-row"
      role="link"
      tabindex="0"
      :aria-label="m.openDatabase.replace('{title}', linkTitle)"
      @click.prevent="openLink"
      @keydown.enter.prevent="openLink"
    >
      <span class="me-db-link-icon" aria-hidden="true">
        <span v-if="source.meta.value?.icon">{{ source.meta.value.icon }}</span>
        <Database v-else />
      </span>
      <span class="me-db-link-title">{{ linkTitle }}</span>
    </a>
    <DatabaseView
      v-else
      :source="source"
      :database-id="databaseId!"
      :view-id="(node.attrs.viewId as string | null)"
      :locale="locale"
      :options="options"
      :editable="editable"
      :scope="scope"
      @update:view-id="setView"
    />
    </div>
  </NodeViewWrapper>
</template>
