<script lang="ts">
/**
 * A page-unique id for every render. Node views are separate Vue render roots, so useId()
 * gave every diagram the same id (`me-mermaid-v-0`): when several diagrams rendered together
 * (opening a page), a failing one removed `#id` — another diagram's SVG — and the next renders
 * failed too (KS-BUG-8).
 */
let counter = 0
const nextId = () => `me-mermaid-${++counter}`
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { EditorMessages } from '../locale'
import { loadMermaid } from '../lazy'

const props = defineProps<{ code: string, messages: EditorMessages, dark: boolean }>()

const svg = ref('')
const error = ref('')
let timer: ReturnType<typeof setTimeout> | undefined
let latest = ''

async function render() {
  if (!props.code.trim()) {
    svg.value = ''
    return
  }
  const id = nextId()
  latest = id
  try {
    const mermaid = await loadMermaid()
    // securityLevel 'strict' sanitizes labels and disables click handlers in diagrams.
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: props.dark ? 'dark' : 'default' })
    const result = await mermaid.render(id, props.code)
    if (latest !== id) return // a newer render took over
    svg.value = result.svg
    error.value = ''
  }
  catch (e) {
    if (latest !== id) return
    error.value = e instanceof Error && /Failed to fetch|import/i.test(e.message) ? props.messages.mermaid.missing : props.messages.mermaid.invalid
    svg.value = ''
  }
  finally {
    // Mermaid renders in temporary elements in <body> and leaves them there on a syntax error.
    for (const leftover of [id, `d${id}`, `i${id}`]) {
      const el = document.getElementById(leftover)
      if (el && !el.closest('.me-mermaid')) el.remove()
    }
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
