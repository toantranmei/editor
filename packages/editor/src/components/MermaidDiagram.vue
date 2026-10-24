<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import type { EditorMessages } from '../locale'
import { loadMermaid } from '../lazy'

const props = defineProps<{ code: string, messages: EditorMessages, dark: boolean }>()

const svg = ref('')
const error = ref('')
const id = `me-mermaid-${useId()}`
let timer: ReturnType<typeof setTimeout> | undefined

async function render() {
  if (!props.code.trim()) {
    svg.value = ''
    return
  }
  try {
    const mermaid = await loadMermaid()
    // securityLevel 'strict' sanitizes labels and disables click handlers in diagrams.
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: props.dark ? 'dark' : 'default' })
    const result = await mermaid.render(id, props.code)
    svg.value = result.svg
    error.value = ''
  }
  catch (e) {
    error.value = e instanceof Error && /Failed to fetch|import/i.test(e.message) ? props.messages.mermaid.missing : props.messages.mermaid.invalid
    document.getElementById(id)?.remove()
  }
}

// Debounced while typing.
watch(() => [props.code, props.dark], () => {
  clearTimeout(timer)
  timer = setTimeout(render, 300)
}, { immediate: true })
onBeforeUnmount(() => clearTimeout(timer))

const label = computed(() => props.messages.mermaid.preview)
</script>

<template>
  <div class="me-mermaid" contenteditable="false" :aria-label="label">
    <div v-if="svg" class="me-mermaid-svg" v-html="svg" />
    <p v-else-if="error" class="me-error">
      {{ error }}
    </p>
  </div>
</template>
