<script setup lang="ts">
/** Value input of one filter condition, shaped by the property type and operator. */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useDb } from '../context'
import { RELATIVE_DATES, valueInput } from '../filters'
import type { FilterOp, Prop } from '../types'
import { parseNumber } from '../values'

const props = defineProps<{ prop: Prop, op: FilterOp, value: unknown }>()
const emit = defineEmits<{ change: [value: unknown] }>()
const db = useDb()
const m = computed(() => db.m.value)
const kind = computed(() => valueInput(props.prop, props.op))
const people = computed(() => {
  void db.valueCtx.value
  return [...db.names.people.entries()].map(([id, name]) => ({ id, name }))
})
const isPeople = computed(() => ['person', 'created_by', 'last_edited_by'].includes(props.prop.type))
const options = computed(() => props.prop.config?.options ?? [])
/** Status: options under their group (To-do / In progress / Complete), so a whole group can be picked at once. */
const groups = computed(() => {
  const gs = props.prop.type === 'status' ? props.prop.config?.groups ?? [] : []
  const byId = new Map(options.value.map(o => [o.id, o]))
  return gs.map(g => ({ id: g.id, name: g.name, options: g.option_ids.map(id => byId.get(id)).filter(o => !!o) }))
})
const toggleGroup = (ids: string[]) => {
  const all = ids.every(id => list.value.includes(id))
  emit('change', all ? list.value.filter(x => !ids.includes(x)) : [...new Set([...list.value, ...ids])])
}
const list = computed<string[]>(() => (Array.isArray(props.value) ? props.value.map(String) : []))

// Text / number inputs write after a short pause, so typing doesn't re-query on every key.
const text = ref('')
watch(() => props.value, (v) => {
  const s = v === null || v === undefined ? '' : Array.isArray(v) ? v.join(', ') : String(v)
  if (s !== text.value) text.value = s
}, { immediate: true })
let timer: ReturnType<typeof setTimeout> | undefined
function onText() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    if (kind.value === 'number') emit('change', text.value.trim() ? parseNumber(text.value, db.locale.value) : null)
    else if (kind.value === 'list') emit('change', text.value.split(',').map(s => s.trim()).filter(Boolean))
    else emit('change', text.value)
  }, 300)
}
onBeforeUnmount(() => clearTimeout(timer))
const toggle = (id: string) => emit('change', list.value.includes(id) ? list.value.filter(x => x !== id) : [...list.value, id])
const range = computed<[string, string]>(() => (Array.isArray(props.value) ? [String(props.value[0] ?? ''), String(props.value[1] ?? '')] : ['', '']))
</script>

<template>
  <span class="me-db-filter-value" :data-kind="kind">
    <template v-if="kind === 'none'" />
    <select v-else-if="kind === 'option' && groups.length" class="me-input me-db-select" :value="value ?? ''" :aria-label="m.value" @change="emit('change', ($event.target as HTMLSelectElement).value)">
      <option value="" />
      <optgroup v-for="g in groups" :key="g.id" :label="g.name">
        <option v-for="o in g.options" :key="o.id" :value="o.id">{{ o.name }}</option>
      </optgroup>
    </select>
    <select v-else-if="kind === 'option' && (options.length || !isPeople)" class="me-input me-db-select" :value="value ?? ''" :aria-label="m.value" @change="emit('change', ($event.target as HTMLSelectElement).value)">
      <option value="" />
      <option v-for="o in options" :key="o.id" :value="o.id">{{ o.name }}</option>
    </select>
    <span v-else-if="kind === 'options' && groups.length" class="me-db-filter-groups" role="group" :aria-label="m.value">
      <span v-for="g in groups" :key="g.id" class="me-db-chips" data-status-group>
        <button
          type="button"
          class="me-db-chip me-db-group-chip"
          :class="{ 'is-on': g.options.length > 0 && g.options.every(o => list.includes(o.id)) }"
          :aria-pressed="g.options.length > 0 && g.options.every(o => list.includes(o.id))"
          :data-group="g.id"
          @click="toggleGroup(g.options.map(o => o.id))"
        >
          {{ g.name }}
        </button>
        <button
          v-for="o in g.options"
          :key="o.id"
          type="button"
          class="me-db-tag me-db-chip"
          :class="{ 'is-on': list.includes(o.id) }"
          :data-color="o.color === 'default' ? undefined : o.color"
          :aria-pressed="list.includes(o.id)"
          @click="toggle(o.id)"
        >
          {{ o.name }}
        </button>
      </span>
    </span>
    <span v-else-if="kind === 'options' || (kind === 'list' && isPeople)" class="me-db-chips" role="group" :aria-label="m.value">
      <button
        v-for="o in (kind === 'options' ? options.map(o => ({ id: o.id, name: o.name, color: o.color })) : people.map(p => ({ id: p.id, name: p.name, color: 'default' })))"
        :key="o.id"
        type="button"
        class="me-db-tag me-db-chip"
        :class="{ 'is-on': list.includes(o.id) }"
        :data-color="o.color === 'default' ? undefined : o.color"
        :aria-pressed="list.includes(o.id)"
        @click="toggle(o.id)"
      >
        {{ o.name }}
      </button>
    </span>
    <select v-else-if="kind === 'text' && isPeople" class="me-input me-db-select" :value="value ?? ''" :aria-label="m.value" @change="emit('change', ($event.target as HTMLSelectElement).value)">
      <option value="" />
      <option v-for="p in people" :key="p.id" :value="p.id">{{ p.name }}</option>
    </select>
    <input v-else-if="kind === 'text' || kind === 'number' || kind === 'list'" v-model="text" class="me-input" :inputmode="kind === 'number' ? 'decimal' : undefined" :aria-label="m.value" :placeholder="m.value" @input="onText">
    <input v-else-if="kind === 'date'" type="date" class="me-input" :value="value ?? ''" :aria-label="m.value" @change="emit('change', ($event.target as HTMLInputElement).value)">
    <span v-else-if="kind === 'date_range'" class="me-db-row">
      <input type="date" class="me-input" :value="range[0]" :aria-label="m.value" @change="emit('change', [($event.target as HTMLInputElement).value, range[1]])">
      <input type="date" class="me-input" :value="range[1]" :aria-label="m.endDate" @change="emit('change', [range[0], ($event.target as HTMLInputElement).value])">
    </span>
    <select v-else-if="kind === 'relative'" class="me-input me-db-select" :value="value" :aria-label="m.value" @change="emit('change', ($event.target as HTMLSelectElement).value)">
      <option v-for="r in RELATIVE_DATES" :key="r" :value="r">{{ m.relative[r] }}</option>
    </select>
    <select v-else-if="kind === 'bool'" class="me-input me-db-select" :value="value ? 'true' : 'false'" :aria-label="m.value" @change="emit('change', ($event.target as HTMLSelectElement).value === 'true')">
      <option value="true">{{ m.checked }}</option>
      <option value="false">{{ m.unchecked }}</option>
    </select>
  </span>
</template>
