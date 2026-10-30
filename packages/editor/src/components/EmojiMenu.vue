<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import { nextTick, ref, watch } from 'vue'
import { useScope } from '../composables/useScope'
import type { EmojiEntry } from '../emoji-data'
import { usePointerMoved } from '../composables/usePointerMoved'

const props = defineProps<{ editor: Editor, items: EmojiEntry[], command: (item: EmojiEntry) => void }>()
const scope = useScope(() => props.editor)
const selected = ref(0)
const root = ref<HTMLElement | null>(null)
const COLS = 8

watch(() => props.items, () => (selected.value = 0))
watch(selected, async (i) => {
  await nextTick()
  root.value?.querySelector(`[data-index="${i}"]`)?.scrollIntoView({ block: 'nearest' })
})

function onKeyDown(e: KeyboardEvent) {
  const n = props.items.length
  if (!n) return false
  const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLS, ArrowUp: -COLS }[e.key]
  if (step) {
    selected.value = Math.min(n - 1, Math.max(0, selected.value + step))
    return true
  }
  if (e.key === 'Enter' || e.key === 'Tab') {
    const item = props.items[selected.value]
    if (item) props.command(item)
    return true
  }
  return false
}
defineExpose({ onKeyDown })

// Hover selects a row only after a real pointer move (KS-BUG-3).
const pointerMoved = usePointerMoved()
</script>

<template>
  <!-- Always render a root element (the popup positions it); hide it while empty. -->
  <div ref="root" v-bind="scope" class="me-popover me-emoji-menu" :hidden="!items.length">
    <div class="me-emoji-menu-grid">
      <button
        v-for="(e, i) in items"
        :key="e.unicode"
        type="button"
        class="me-emoji"
        :class="{ 'is-active': i === selected }"
        :data-index="i"
        :title="e.label"
        @mousemove="pointerMoved($event) && (selected = i)"
        @mousedown.prevent="command(e)"
      >
        {{ e.unicode }}
      </button>
    </div>
    <div class="me-menu-desc me-emoji-menu-label">
      {{ items[selected]?.label }}
    </div>
  </div>
</template>
