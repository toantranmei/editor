<script setup lang="ts">
import { type Component, computed } from 'vue'
import type { SketchMessages } from '../messages'
import type { ToolName } from '../tools/controller'
import { Circle, Diamond, Hand, Lock, LockOpen, MousePointer2, Square } from './icons'

const props = defineProps<{
  tool: ToolName
  locked: boolean
  readonly: boolean
  messages: SketchMessages
}>()

const emit = defineEmits<{
  select: [tool: ToolName]
  toggleLock: []
}>()

interface Item { name: ToolName; icon: Component; badge: string }

const ALL: Item[] = [
  { name: 'hand', icon: Hand, badge: 'H' },
  { name: 'select', icon: MousePointer2, badge: '1' },
  { name: 'rectangle', icon: Square, badge: '2' },
  { name: 'diamond', icon: Diamond, badge: '3' },
  { name: 'ellipse', icon: Circle, badge: '4' },
]

const items = computed(() => props.readonly ? ALL.filter(i => i.name === 'hand' || i.name === 'select') : ALL)
</script>

<template>
  <div class="me-sketch-toolbar" role="toolbar">
    <button
      v-for="item in items"
      :key="item.name"
      type="button"
      class="me-tool-btn me-sketch-tool"
      :class="{ 'is-active': tool === item.name }"
      :title="messages.tools[item.name]"
      :aria-label="messages.tools[item.name]"
      :aria-pressed="tool === item.name"
      @click="emit('select', item.name)"
    >
      <component :is="item.icon" />
      <span class="me-sketch-badge" aria-hidden="true">{{ item.badge }}</span>
    </button>
    <template v-if="!readonly">
      <span class="me-toolbar-divider" aria-hidden="true" />
      <button
        type="button"
        class="me-tool-btn me-sketch-tool"
        :class="{ 'is-active': locked }"
        :title="messages.tools.lock"
        :aria-label="messages.tools.lock"
        :aria-pressed="locked"
        @click="emit('toggleLock')"
      >
        <Lock v-if="locked" />
        <LockOpen v-else />
      </button>
    </template>
  </div>
</template>
