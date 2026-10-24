<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import { computed, nextTick, ref, watch } from 'vue'
import { useScope } from '../composables/useScope'
import type { SlashItem } from '../slash-items'

const props = defineProps<{
  editor: Editor
  items: SlashItem[]
  query: string
  command: (item: SlashItem) => void
}>()

const selected = ref(0)
const listEl = ref<HTMLElement | null>(null)
const m = computed(() => props.editor.storage.meiConfig.messages)
const scope = useScope(() => props.editor)

// While searching, show one ranked list; otherwise keep the sections (recent, groups, colors).
const groups = computed(() => {
  if (props.query.trim()) return [[m.value.slash.results, props.items.map((item, index) => ({ item, index }))] as const]
  const map = new Map<string, { item: SlashItem, index: number }[]>()
  props.items.forEach((item, index) => {
    if (!map.has(item.group)) map.set(item.group, [])
    map.get(item.group)!.push({ item, index })
  })
  return [...map.entries()]
})

watch(() => props.items, () => (selected.value = 0))
watch(selected, async (i) => {
  await nextTick()
  listEl.value?.querySelector(`[data-index="${i}"]`)?.scrollIntoView({ block: 'nearest' })
})

function select(index: number) {
  const item = props.items[index]
  if (item) props.command(item)
}

function onKeyDown(event: KeyboardEvent) {
  const n = props.items.length
  if (!n) return false
  if (event.key === 'ArrowDown') {
    selected.value = (selected.value + 1) % n
    return true
  }
  if (event.key === 'ArrowUp') {
    selected.value = (selected.value + n - 1) % n
    return true
  }
  if (event.key === 'Enter' || event.key === 'Tab') {
    select(selected.value)
    return true
  }
  return false
}

defineExpose({ onKeyDown })
</script>

<template>
  <div ref="listEl" v-bind="scope" class="me-popover me-menu">
    <template v-if="items.length">
      <div v-for="[group, entries] in groups" :key="group">
        <div class="me-menu-label">
          {{ group }}
        </div>
        <button
          v-for="{ item, index } in entries"
          :key="item.key"
          type="button"
          :data-index="index"
          class="me-menu-item"
          :class="{ 'is-active': index === selected }"
          @mouseenter="selected = index"
          @mousedown.prevent="select(index)"
        >
          <span v-if="item.swatch" class="me-menu-icon" :class="item.swatch.kind === 'text' ? 'me-swatch--text' : 'me-swatch--bg'" :data-color="item.swatch.color">A</span>
          <span v-else class="me-menu-icon"><component :is="item.icon" /></span>
          <span class="me-menu-text">
            <span class="me-menu-title">{{ item.title }}</span>
            <span v-if="item.description" class="me-menu-desc">{{ item.description }}</span>
          </span>
          <span v-if="item.shortcut" class="me-menu-shortcut">{{ item.shortcut }}</span>
        </button>
      </div>
    </template>
    <div v-else class="me-menu-empty">
      {{ m.slash.empty }}
    </div>
  </div>
</template>
