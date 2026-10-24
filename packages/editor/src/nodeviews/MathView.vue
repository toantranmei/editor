<script setup lang="ts">
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useClickOutside } from '../composables/useClickOutside'
import { useEditable } from '../composables/useEditable'
import { loadKatex } from '../lazy'

const props = defineProps(nodeViewProps)
const editable = useEditable(props.editor)

const m = computed(() => props.editor.storage.meiConfig.messages.math)
const inline = computed(() => props.node.type.name === 'mathInline')
const rendered = ref('')
const error = ref('')
const editing = ref(false)
const draft = ref(props.node.attrs.latex as string)
const root = ref<HTMLElement | null>(null)
const input = ref<HTMLTextAreaElement | null>(null)

async function render(latex: string) {
  if (!latex.trim()) {
    rendered.value = ''
    return
  }
  try {
    const katex = await loadKatex()
    rendered.value = katex.renderToString(latex, { displayMode: !inline.value, throwOnError: false })
    error.value = ''
  }
  catch {
    error.value = m.value.missing
  }
}

watch(() => props.node.attrs.latex, latex => render(latex), { immediate: true })
watch(draft, latex => render(latex))

function open() {
  if (!props.editor.isEditable) return
  draft.value = props.node.attrs.latex
  editing.value = true
  nextTick(() => input.value?.focus())
}
function commit() {
  if (!editing.value) return
  editing.value = false
  if (draft.value !== props.node.attrs.latex) props.updateAttributes({ latex: draft.value })
  if (!draft.value.trim() && inline.value) props.deleteNode()
}
function onKeydown(e: KeyboardEvent) {
  e.stopPropagation()
  if (e.key === 'Escape' || (e.key === 'Enter' && (inline.value || e.metaKey || e.ctrlKey))) {
    e.preventDefault()
    commit()
    props.editor.commands.focus()
  }
}
useClickOutside(root, editing, commit)

// Switching to read-only closes the editor, keeping what was typed (no deletes then).
watch(editable, (value) => {
  if (value || !editing.value) return
  editing.value = false
  if (draft.value !== props.node.attrs.latex) props.updateAttributes({ latex: draft.value })
})

// A freshly inserted empty equation opens straight into editing.
onMounted(() => {
  if (!props.node.attrs.latex) open()
})
onBeforeUnmount(commit)
</script>

<template>
  <NodeViewWrapper
    ref="root"
    :as="inline ? 'span' : 'div'"
    :class="[inline ? 'me-math-inline' : 'me-math-block', { 'is-selected': selected, 'is-editing': editing, 'is-readonly-empty': !editable && !node.attrs.latex }]"
    contenteditable="false"
  >
    <span v-if="rendered" class="me-math-render" @click="open" v-html="rendered" />
    <span v-else class="me-math-empty" @click="open">{{ m.placeholder }}</span>
    <span v-if="error" class="me-error">{{ error }}</span>
    <span v-if="editing" class="me-popover me-math-editor">
      <textarea
        ref="input"
        v-model="draft"
        class="me-input me-math-input"
        :rows="inline ? 1 : 3"
        :placeholder="m.inputPlaceholder"
        spellcheck="false"
        @keydown="onKeydown"
      />
      <span class="me-hint">{{ inline ? m.hintInline : m.hintBlock }}</span>
    </span>
  </NodeViewWrapper>
</template>
