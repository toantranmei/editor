<script setup lang="ts">
/**
 * A synced block: a nested `<MeiEditor>` on the source's Y.Doc (collaboration mode), so
 * every page showing the source edits the same content. The frame shows on hover / focus.
 */
import { Repeat2 } from '@lucide/vue'
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { defaultBlocks, MeiEditor, useEditable } from '@toantranmei/editor'
import { computed, shallowRef, watch } from 'vue'
import { syncedMessages } from './messages'
import { reportError } from './node'
import { SYNCED_NODE } from './render'
import type { SyncedBlockOptions, SyncedSource } from './types'

const props = defineProps(nodeViewProps)

const options = computed(() => props.extension.options as SyncedBlockOptions)
const sourceId = computed(() => (props.node.attrs.sourceId as string | null) || null)
const locale = computed(() => props.editor.storage.meiConfig?.locale ?? 'vi')
const m = computed(() => syncedMessages(locale.value, options.value.messages))
const outerEditable = useEditable(props.editor)

type State = { status: 'loading' } | { status: 'missing' } | { status: 'ok', source: SyncedSource }
const state = shallowRef<State>({ status: 'loading' })

watch(sourceId, async (id) => {
  const resolve = options.value.doc
  if (!id || !resolve) {
    state.value = { status: 'missing' }
    return
  }
  state.value = { status: 'loading' }
  try {
    const source = await resolve(id)
    if (sourceId.value !== id) return
    state.value = source ? { status: 'ok', source } : { status: 'missing' }
  }
  catch (error) {
    if (sourceId.value !== id) return
    state.value = { status: 'missing' }
    reportError(options.value, error)
  }
}, { immediate: true })

// Read once, like <MeiEditor :blocks>. Synced blocks can't nest (a source could show itself).
const blocks = (options.value.blocks ?? defaultBlocks).filter(b => !b.nodes.includes(SYNCED_NODE))
const source = computed(() => (state.value.status === 'ok' ? state.value.source : null))
const editable = computed(() => outerEditable.value && !!source.value?.editable)
const href = computed(() => (sourceId.value ? options.value.originHref?.(sourceId.value) ?? null : null))
</script>

<template>
  <NodeViewWrapper
    class="me-synced"
    :class="{ 'is-selected': selected, 'is-readonly': source && !editable, 'is-missing': state.status === 'missing' }"
    data-type="synced-block"
    :data-source-id="sourceId ?? undefined"
  >
    <div class="me-synced-bar" contenteditable="false">
      <span class="me-synced-label"><Repeat2 /> {{ m.label }}<template v-if="source && !editable"> · {{ m.readOnly }}</template></span>
      <a v-if="href" class="me-synced-origin" :href="href" target="_blank" rel="noopener">{{ m.original }}</a>
    </div>
    <div class="me-synced-content">
      <p v-if="state.status === 'loading'" class="me-hint me-synced-empty">
        {{ m.loading }}
      </p>
      <p v-else-if="state.status === 'missing'" class="me-hint me-synced-empty">
        {{ m.unavailable }}
      </p>
      <MeiEditor
        v-else-if="source"
        :key="sourceId ?? ''"
        :collaboration="{ document: source.doc, field: source.field }"
        :editable="editable"
        :blocks="blocks"
        :locale="locale"
        :outline="false"
      />
    </div>
  </NodeViewWrapper>
</template>
