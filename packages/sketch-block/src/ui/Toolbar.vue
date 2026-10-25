<script setup lang="ts">
import { type Component, computed } from 'vue'
import type { SketchMessages } from '../messages'
import type { ToolName } from '../tools/controller'
import {
  Circle, Diamond, Eraser, Frame, Hand, Highlighter, Lasso, Lock, LockOpen, Minus, MousePointer2, MoveUpRight, Pencil,
  Pipette, Square, StickyNote, Type, Wand2,
} from './icons'

const props = withDefaults(defineProps<{
  tool: ToolName
  locked: boolean
  readonly: boolean
  /** View mode: only the hand tool. */
  viewMode?: boolean
  messages: SketchMessages
}>(), { viewMode: false })

const emit = defineEmits<{
  select: [tool: ToolName]
  toggleLock: []
}>()

/** `badge` is the letter shortcut named in the tooltip ('' = no key). */
interface Item { name: ToolName; icon: Component; badge: string }

const GROUPS: Item[][] = [
  [
    { name: 'hand', icon: Hand, badge: 'H' },
    { name: 'select', icon: MousePointer2, badge: 'V' },
    { name: 'lasso', icon: Lasso, badge: '' },
  ],
  [
    { name: 'rectangle', icon: Square, badge: 'R' },
    { name: 'diamond', icon: Diamond, badge: 'D' },
    { name: 'ellipse', icon: Circle, badge: 'O' },
    { name: 'arrow', icon: MoveUpRight, badge: 'A' },
    { name: 'line', icon: Minus, badge: 'L' },
  ],
  [
    { name: 'pen', icon: Pencil, badge: 'P' },
    { name: 'highlighter', icon: Highlighter, badge: 'M' },
    { name: 'text', icon: Type, badge: 'T' },
    { name: 'sticky', icon: StickyNote, badge: 'S' },
    { name: 'frame', icon: Frame, badge: 'F' },
  ],
  [
    { name: 'eraser', icon: Eraser, badge: 'E' },
    { name: 'laser', icon: Wand2, badge: 'K' },
    { name: 'eyedropper', icon: Pipette, badge: 'I' },
  ],
]

/** Read-only: hand and select (no lock); view mode: hand only. */
const groups = computed(() => {
  if (props.viewMode) return [GROUPS[0]!.filter(i => i.name === 'hand')]
  if (props.readonly) return [GROUPS[0]!.filter(i => i.name === 'hand' || i.name === 'select')]
  return GROUPS
})
const showLock = computed(() => !props.readonly && !props.viewMode)
</script>

<template>
  <div class="me-sketch-toolbar" role="toolbar" :aria-label="messages.toolbar">
    <template v-if="showLock">
      <button
        type="button"
        class="me-tool-btn me-sketch-tool"
        data-tool="lock"
        :class="{ 'is-active': locked }"
        :title="messages.tools.lock"
        :aria-label="messages.tools.lock"
        :aria-pressed="locked"
        @click="emit('toggleLock')"
      >
        <Lock v-if="locked" />
        <LockOpen v-else />
        <span class="me-sketch-badge" aria-hidden="true">Q</span>
      </button>
      <span class="me-toolbar-divider" aria-hidden="true" />
    </template>
    <template v-for="(group, gi) in groups" :key="gi">
      <span v-if="gi > 0" class="me-toolbar-divider" aria-hidden="true" />
      <button
        v-for="item in group"
        :key="item.name"
        type="button"
        class="me-tool-btn me-sketch-tool"
        :data-tool="item.name"
        :class="{ 'is-active': tool === item.name }"
        :title="messages.tools[item.name]"
        :aria-label="messages.tools[item.name]"
        :aria-pressed="tool === item.name"
        @click="emit('select', item.name)"
      >
        <component :is="item.icon" />
        <span v-if="item.badge" class="me-sketch-badge" aria-hidden="true">{{ item.badge }}</span>
      </button>
    </template>
  </div>
</template>
