<script lang="ts">
import { COLORS, type ColorName } from '../colors'
import type { RecentColor } from '../recent'

export interface ColorRow { section: 'recent' | 'text' | 'bg', kind: 'text' | 'bg', color: ColorName }

/** Rows in display order, so parents can drive keyboard navigation by index. */
export function colorRows(recent: RecentColor[]): ColorRow[] {
  return [
    ...recent.map(r => ({ section: 'recent' as const, ...r })),
    ...COLORS.map(color => ({ section: 'text' as const, kind: 'text' as const, color })),
    ...COLORS.map(color => ({ section: 'bg' as const, kind: 'bg' as const, color })),
  ]
}
</script>

<script setup lang="ts">
import { Check } from '@lucide/vue'
import { computed } from 'vue'
import type { EditorMessages } from '../locale'

const props = defineProps<{
  messages: EditorMessages
  recent: RecentColor[]
  /** Colors currently applied (null = mixed / none). */
  current?: { text: string | null, bg: string | null }
  activeIndex?: number
}>()
defineEmits<{ pick: [kind: 'text' | 'bg', color: ColorName], hover: [index: number] }>()

const rows = computed(() => colorRows(props.recent))
const label = (s: ColorRow['section']) => ({ recent: props.messages.blockMenu.recent, text: props.messages.blockMenu.textColor, bg: props.messages.blockMenu.backgroundColor })[s]
/** `default` has no data-color, so it falls back to the normal text/background. */
const attr = (c: ColorName) => (c === 'default' ? undefined : c)
const isCurrent = (row: ColorRow) => row.section !== 'recent' && props.current?.[row.kind] === row.color
const name = (row: ColorRow) => {
  const color = props.messages.colors[row.color] ?? row.color
  if (row.section !== 'recent') return color
  return row.kind === 'text' ? props.messages.slash.textColor(color) : props.messages.slash.bgColor(color)
}
</script>

<template>
  <template v-for="(row, i) in rows" :key="`${row.section}-${row.kind}-${row.color}`">
    <div v-if="i === 0 || rows[i - 1]!.section !== row.section" class="me-menu-label">
      {{ label(row.section) }}
    </div>
    <button
      type="button"
      class="me-menu-item"
      :class="{ 'is-active': i === activeIndex }"
      :data-index="i"
      @mouseenter="$emit('hover', i)"
      @click="$emit('pick', row.kind, row.color)"
    >
      <span class="me-menu-icon" :class="row.kind === 'text' ? 'me-swatch--text' : 'me-swatch--bg'" :data-color="attr(row.color)">A</span>
      <span class="me-menu-title me-menu-text">{{ name(row) }}</span>
      <Check v-if="isCurrent(row)" class="me-menu-check" />
    </button>
  </template>
</template>
