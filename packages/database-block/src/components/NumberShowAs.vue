<script setup lang="ts">
/** "Show as" of a number (and numeric rollup): number, bar or ring, with color, "divide by" (full) and show number. */
import { COLORS } from '@toantranmei/editor'
import { computed } from 'vue'
import { useDb } from '../context'
import type { OptionColor, PropConfig } from '../types'

const props = defineProps<{ config: PropConfig }>()
const emit = defineEmits<{ change: [patch: Partial<PropConfig>] }>()
const db = useDb()
const m = computed(() => db.m.value)
const kind = computed(() => props.config.show_as ?? 'number')
const KINDS = ['number', 'bar', 'ring'] as const
</script>

<template>
  <div class="me-db-field" data-setting="show_as">
    <span class="me-menu-label">{{ m.showAs }}</span>
    <div class="me-db-option-sort" role="radiogroup" :aria-label="m.showAs">
      <button
        v-for="k in KINDS"
        :key="k"
        type="button"
        class="me-db-seg"
        role="radio"
        :aria-checked="kind === k"
        :class="{ 'is-on': kind === k }"
        :data-show-as="k"
        @click="emit('change', { show_as: k === 'number' ? undefined : k })"
      >
        {{ m.showAsKinds[k] }}
      </button>
    </div>
    <template v-if="kind !== 'number'">
      <label class="me-db-field">
        <span class="me-menu-label">{{ m.optionColor }}</span>
        <select class="me-input me-db-select" :value="config.show_color ?? 'green'" data-setting="show_color" @change="emit('change', { show_color: ($event.target as HTMLSelectElement).value as OptionColor })">
          <option v-for="c in COLORS" :key="c" :value="c">{{ m.colors[c] }}</option>
        </select>
      </label>
      <label class="me-db-field">
        <span class="me-menu-label">{{ m.divideBy }}</span>
        <input class="me-input" type="number" min="0" :value="config.divide_by ?? 100" data-setting="divide_by" @change="emit('change', { divide_by: Number(($event.target as HTMLInputElement).value) || undefined })">
      </label>
      <label class="me-db-toggle-row">
        <span>{{ m.showNumber }}</span>
        <input type="checkbox" class="me-db-switch" :checked="config.show_number !== false" data-setting="show_number" @change="emit('change', { show_number: ($event.target as HTMLInputElement).checked ? undefined : false })">
      </label>
      <span class="me-db-hint">{{ m.appliesToAllViews }}</span>
    </template>
  </div>
</template>
