<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'
import type { SearchMessages } from '../messages'
import { ChevronDown, ChevronUp, Search, X } from './icons'

const props = defineProps<{
  query: string
  /** Position of the active match (-1 = none yet). */
  index: number
  total: number
  messages: SearchMessages
}>()

const emit = defineEmits<{
  'update:query': [value: string]
  next: []
  prev: []
  close: []
}>()

const input = shallowRef<HTMLInputElement | null>(null)

const status = computed(() => {
  if (!props.query.trim()) return ''
  if (!props.total) return props.messages.noMatches
  return props.messages.count.replace('{i}', String(props.index + 1)).replace('{n}', String(props.total))
})

/** Focuses the field with its text selected (mod+F again re-selects it). */
function focus(): void {
  input.value?.focus({ preventScroll: true })
  input.value?.select()
}

/** The board never sees the box's keys (letters would switch tools); Enter / Escape / mod+F act here. */
function onKeyDown(e: KeyboardEvent): void {
  e.stopPropagation()
  if (e.key === 'Enter') {
    e.preventDefault()
    if (e.shiftKey) emit('prev')
    else emit('next')
  } else if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  } else if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key.toLowerCase() === 'f' || e.code === 'KeyF')) {
    e.preventDefault()
    focus()
  }
}

onMounted(focus)
defineExpose({ focus })
</script>

<template>
  <div class="me-sketch-search" role="search" @pointerdown.stop>
    <Search class="me-sketch-search-icon" aria-hidden="true" />
    <input
      ref="input"
      type="text"
      class="me-sketch-search-input"
      :value="query"
      :placeholder="messages.placeholder"
      :aria-label="messages.label"
      spellcheck="false"
      autocomplete="off"
      @input="emit('update:query', ($event.target as HTMLInputElement).value)"
      @keydown="onKeyDown"
      @keyup.stop
    >
    <span class="me-sketch-search-status" aria-live="polite">{{ status }}</span>
    <button
      type="button" class="me-tool-btn" data-search="prev"
      :disabled="!total" :title="messages.prev" :aria-label="messages.prev"
      @click="emit('prev')"
    >
      <ChevronUp />
    </button>
    <button
      type="button" class="me-tool-btn" data-search="next"
      :disabled="!total" :title="messages.next" :aria-label="messages.next"
      @click="emit('next')"
    >
      <ChevronDown />
    </button>
    <button
      type="button" class="me-tool-btn" data-search="close"
      :title="messages.close" :aria-label="messages.close"
      @click="emit('close')"
    >
      <X />
    </button>
  </div>
</template>
