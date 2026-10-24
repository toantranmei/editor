<script setup lang="ts">
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { TextSelection } from '@tiptap/pm/state'
import { computed, onBeforeUnmount, shallowRef } from 'vue'

const props = defineProps(nodeViewProps)
const m = computed(() => props.editor.storage.meiConfig.messages.toc)

interface Entry { pos: number, level: number, text: string }
const entries = shallowRef<Entry[]>([])

function collect() {
  const list: Entry[] = []
  props.editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') list.push({ pos, level: node.attrs.level, text: node.textContent })
    else if (node.type.name === 'details' && node.attrs.level) list.push({ pos, level: node.attrs.level, text: node.firstChild?.textContent ?? '' })
    return node.type.name !== 'heading'
  })
  entries.value = list
}
collect()
props.editor.on('update', collect)
onBeforeUnmount(() => props.editor.off('update', collect))

const minLevel = computed(() => Math.min(...entries.value.map(e => e.level), 4))

function go(entry: Entry) {
  const { view } = props.editor
  ;(view.nodeDOM(entry.pos) as HTMLElement | null)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(entry.pos + 1))))
  view.focus()
}
</script>

<template>
  <NodeViewWrapper class="me-toc" :class="{ 'is-selected': selected }" contenteditable="false">
    <button
      v-for="e in entries"
      :key="e.pos"
      type="button"
      class="me-toc-item"
      :data-depth="e.level - minLevel"
      @click="go(e)"
    >
      {{ e.text || m.untitled }}
    </button>
    <p v-if="!entries.length" class="me-hint">
      {{ m.empty }}
    </p>
  </NodeViewWrapper>
</template>
