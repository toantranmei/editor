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
    <div v-if="state === 'loading'" class="me-db-empty" contenteditable="false">{{ m.loading }}</div>
    <div v-else-if="state === 'missing' || !source" class="me-db-empty is-missing" contenteditable="false">{{ m.notFound }}</div>
    <a
      v-else-if="!inline"
      class="me-db-link-row"
      contenteditable="false"
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
      contenteditable="false"
      :source="source"
      :database-id="databaseId!"
      :view-id="(node.attrs.viewId as string | null)"
      :locale="locale"
      :options="options"
      :editable="editable"
      :scope="scope"
      @update:view-id="setView"
    />
  </NodeViewWrapper>
</template>
