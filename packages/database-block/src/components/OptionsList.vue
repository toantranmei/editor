<script setup lang="ts">
/** Inline list editor for select / multi-select / status options: rename, color, delete, add. */
import { Plus, Trash2 } from '@lucide/vue'
import { COLORS } from '@toantranmei/editor'
import { computed, ref } from 'vue'
import { useDb } from '../context'
import type { OptionColor, SelectOption } from '../types'
import { newOption } from '../values'

const props = defineProps<{ options: SelectOption[] }>()
const emit = defineEmits<{ change: [options: SelectOption[]] }>()
const db = useDb()
const m = computed(() => db.m.value)
const draft = ref('')

const update = (id: string, patch: Partial<SelectOption>) => emit('change', props.options.map(o => (o.id === id ? { ...o, ...patch } : o)))
function add() {
  const name = draft.value.trim()
  if (!name) return
  emit('change', [...props.options, newOption(name, props.options)])
  draft.value = ''
}
</script>

<template>
  <div class="me-db-options">
    <div v-for="o in options" :key="o.id" class="me-db-row me-db-option-row" :data-option="o.id">
      <span class="me-db-swatch" :data-color="o.color === 'default' ? undefined : o.color" />
      <input class="me-input" :value="o.name" :aria-label="m.optionName" @change="update(o.id, { name: ($event.target as HTMLInputElement).value.trim() || o.name })">
      <select class="me-input me-db-select" :value="o.color" :aria-label="m.colors.default" @change="update(o.id, { color: ($event.target as HTMLSelectElement).value as OptionColor })">
        <option v-for="c in COLORS" :key="c" :value="c">{{ m.colors[c] }}</option>
      </select>
      <button type="button" class="me-db-icon-button" :aria-label="m.deleteOption" @click="emit('change', options.filter(x => x.id !== o.id))"><Trash2 /></button>
    </div>
    <div class="me-db-row">
      <Plus class="me-db-menu-icon" />
      <input v-model="draft" class="me-input" :placeholder="m.addOption" :aria-label="m.addOption" @keydown.enter.prevent="add">
    </div>
  </div>
</template>
