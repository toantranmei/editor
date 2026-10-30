<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import { Calendar, FileText, User } from '@lucide/vue'
import { computed, nextTick, ref, watch } from 'vue'
import { useScope } from '../composables/useScope'
import type { MentionItem } from '../extensions/mention'
import { usePointerMoved } from '../composables/usePointerMoved'

const props = defineProps<{ editor: Editor, items: MentionItem[], command: (item: MentionItem) => void }>()
const scope = useScope(() => props.editor)
const m = computed(() => props.editor.storage.meiConfig.messages.mention)
const selected = ref(0)
const root = ref<HTMLElement | null>(null)
const ICONS = { user: User, page: FileText, date: Calendar }

const groups = computed(() => {
  const order: MentionItem['kind'][] = ['user', 'page', 'date']
  const label = { user: m.value.people, page: m.value.pages, date: m.value.dates }
  return order
    .map(kind => ({ kind, label: label[kind], entries: props.items.map((item, index) => ({ item, index })).filter(e => e.item.kind === kind) }))
    .filter(g => g.entries.length)
})

watch(() => props.items, () => (selected.value = 0))
watch(selected, async (i) => {
  await nextTick()
  root.value?.querySelector(`[data-index="${i}"]`)?.scrollIntoView({ block: 'nearest' })
})

function onKeyDown(e: KeyboardEvent) {
  const n = props.items.length
  if (!n) return false
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    selected.value = (selected.value + (e.key === 'ArrowDown' ? 1 : n - 1)) % n
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
  <div ref="root" v-bind="scope" class="me-popover me-menu">
    <div v-for="g in groups" :key="g.kind">
      <div class="me-menu-label">
        {{ g.label }}
      </div>
      <button
        v-for="{ item, index } in g.entries"
        :key="`${item.kind}-${item.id}`"
        type="button"
        class="me-menu-item"
        :class="{ 'is-active': index === selected }"
        :data-index="index"
        @mousemove="pointerMoved($event) && (selected = index)"
        @mousedown.prevent="command(item)"
      >
        <img v-if="item.avatar" class="me-menu-icon me-avatar" :src="item.avatar" alt="">
        <span v-else class="me-menu-icon"><component :is="ICONS[item.kind]" /></span>
        <span class="me-menu-text">
          <span class="me-menu-title">{{ item.label }}</span>
          <span v-if="item.description" class="me-menu-desc">{{ item.description }}</span>
        </span>
      </button>
    </div>
    <div v-if="!items.length" class="me-menu-empty">
      {{ m.empty }}
    </div>
  </div>
</template>
