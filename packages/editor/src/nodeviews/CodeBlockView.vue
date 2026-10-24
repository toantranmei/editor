<script setup lang="ts">
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { Check, ChevronDown, Copy } from '@lucide/vue'
import { computed, ref } from 'vue'
import { useEditable } from '../composables/useEditable'
import { CODE_LANGUAGES } from '../extensions/code-block'
import MermaidDiagram from '../components/MermaidDiagram.vue'

const props = defineProps(nodeViewProps)
const editable = useEditable(props.editor)

const m = computed(() => props.editor.storage.meiConfig.messages.code)
const hasMermaid = computed(() => !!props.editor.extensionManager.extensions.find(e => e.name === 'mermaidPreview'))
const languages = computed(() => {
  const list = hasMermaid.value ? [...CODE_LANGUAGES, 'mermaid'] : CODE_LANGUAGES
  // Keep an unknown current language (e.g. an alias like "js") selectable.
  const current = props.node.attrs.language
  return current && !list.includes(current) ? [...list, current] : list
})
const copied = ref(false)

const showDiagram = computed(() => props.node.attrs.language === 'mermaid' && hasMermaid.value)
// Dark when the editor is forced dark, or follows a dark page.
const isDark = computed(() => {
  const scope = props.editor.storage.meiConfig.scope.class
  return scope.includes('me-dark') || (!scope.includes('me-light') && document.documentElement.classList.contains('dark'))
})

async function copy() {
  await navigator.clipboard.writeText(props.node.textContent)
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}
</script>

<template>
  <NodeViewWrapper class="me-code-block">
    <div class="me-block-bar me-code-toolbar" contenteditable="false">
      <label class="me-code-lang">
        <select
          :value="node.attrs.language || 'plaintext'"
          :disabled="!editable"
          @change="updateAttributes({ language: ($event.target as HTMLSelectElement).value })"
        >
          <option v-for="lang in languages" :key="lang" :value="lang">{{ lang }}</option>
        </select>
        <ChevronDown />
      </label>
      <button type="button" class="me-tool-btn me-code-copy" @click="copy">
        <component :is="copied ? Check : Copy" /> {{ copied ? m.copied : m.copy }}
      </button>
    </div>
    <pre><NodeViewContent as="code" :class="`hljs language-${node.attrs.language || 'plaintext'}`" /></pre>
    <MermaidDiagram v-if="showDiagram" :code="node.textContent" :messages="editor.storage.meiConfig.messages" :dark="isDark" />
  </NodeViewWrapper>
</template>
