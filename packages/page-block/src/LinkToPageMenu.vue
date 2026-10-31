<script setup lang="ts">
/** "Link to page" popover: search the app's pages (`search`) and pick one. */
import { FileText } from '@lucide/vue'
import type { Editor } from '@tiptap/core'
import { useScope } from '@toantranmei/editor'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { pageMessages } from './messages'
import type { PageBlockOptions, PageSearchResult } from './types'

const props = defineProps<{
  editor: Editor
  options: PageBlockOptions
  onSelect: (page: PageSearchResult) => void
  onClose: () => void
}>()

const scope = useScope(() => props.editor)
const m = computed(() => pageMessages(props.editor.storage.meiConfig?.locale, props.options.messages))
const query = ref('')
const results = shallowRef<PageSearchResult[]>([])
const loading = ref(false)
const selected = ref(0)
const input = ref<HTMLInputElement | null>(null)
const root = ref<HTMLElement | null>(null)

let timer: ReturnType<typeof setTimeout> | undefined
let seq = 0
async function run(q: string) {
  const search = props.options.search
  if (!search) return
  const mine = ++seq
  loading.value = true
  try {
    const found = await search(q)
    if (mine !== seq) return
    results.value = found
    selected.value = 0
  }
  catch (error) {
    if (mine === seq) results.value = []
    if (props.options.onError) props.options.onError(error)
    else console.error('[page-block]', error)
  }
  finally {
    if (mine === seq) loading.value = false
  }
}
watch(query, (q) => {
  clearTimeout(timer)
  timer = setTimeout(() => run(q), props.options.searchDelay ?? 150)
})

function onKeydown(e: KeyboardEvent) {
  const n = results.value.length
  if (e.key === 'Escape') {
    e.preventDefault()
    props.onClose()
  }
  else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && n) {
    e.preventDefault()
    selected.value = (selected.value + (e.key === 'ArrowDown' ? 1 : n - 1)) % n
  }
  else if (e.key === 'Enter') {
    e.preventDefault()
    const page = results.value[selected.value]
    if (page) props.onSelect(page)
  }
}
watch(selected, async (i) => {
  await nextTick()
  root.value?.querySelector(`[data-index="${i}"]`)?.scrollIntoView?.({ block: 'nearest' })
})

const onPointerDown = (e: PointerEvent) => {
  if (root.value && !root.value.contains(e.target as Node)) props.onClose()
}
onMounted(() => {
  run('')
  document.addEventListener('pointerdown', onPointerDown, true)
})
onBeforeUnmount(() => {
  clearTimeout(timer)
  seq++
  document.removeEventListener('pointerdown', onPointerDown, true)
})

defineExpose({ query, results })
</script>

<template>
  <div ref="root" v-bind="scope" class="me-popover me-page-link-popover" role="dialog" @keydown="onKeydown">
    <input
      ref="input"
      v-model="query"
      class="me-input me-page-link-search"
      :placeholder="m.searchPlaceholder"
      :aria-label="m.searchPlaceholder"
    >
    <div class="me-menu me-page-link-results" role="listbox">
      <button
        v-for="(page, index) in results"
        :key="page.id"
        type="button"
        role="option"
        class="me-menu-item"
        :class="{ 'is-active': index === selected }"
        :aria-selected="index === selected"
        :data-index="index"
        @mouseenter="selected = index"
        @mousedown.prevent="onSelect(page)"
      >
        <span class="me-menu-icon">
          <span v-if="page.icon" class="me-page-link-emoji">{{ page.icon }}</span>
          <component :is="options.defaultIcon ?? FileText" v-else />
        </span>
        <span class="me-menu-text">
          <span class="me-menu-title" :class="{ 'me-page-link-untitled': !page.title.trim() }">{{ page.title.trim() || m.untitled }}</span>
        </span>
      </button>
      <div v-if="!results.length" class="me-menu-empty">
        {{ loading ? m.searching : m.noResults }}
      </div>
    </div>
  </div>
</template>
