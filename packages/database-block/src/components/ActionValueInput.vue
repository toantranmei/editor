<script setup lang="ts">
/**
 * Value an action writes into one property (buttons, automations): shaped by the property type, with the dynamic
 * values Notion offers (date: today / now, person: me). Emits the whole `ActionValue`.
 */
import { Plus } from '@lucide/vue'
import { computed, ref, shallowRef } from 'vue'
import { useDb } from '../context'
import type { ActionValue, DateValue, Prop } from '../types'
import { parseNumber } from '../values'
import DbPopover from './DbPopover.vue'
import SearchPicker from './SearchPicker.vue'

const props = defineProps<{ prop: Prop, spec: ActionValue }>()
const emit = defineEmits<{ change: [spec: ActionValue] }>()
const db = useDb()
const m = computed(() => db.m.value)
const type = computed(() => props.prop.type)
const options = computed(() => props.prop.config?.options ?? [])
const ids = computed<string[]>(() => (Array.isArray(props.spec.value) ? props.spec.value.map(String) : []))
const people = computed(() => {
  void db.valueCtx.value
  return [...db.names.people.entries()].map(([id, name]) => ({ id, name }))
})
const me = computed(() => db.source.currentUserId?.() ?? null)

const set = (value: unknown) => emit('change', { prop: props.prop.id, value })
const setDynamic = (dynamic: ActionValue['dynamic']) => emit('change', { prop: props.prop.id, dynamic })
const text = computed(() => (props.spec.value === null || props.spec.value === undefined ? '' : String(props.spec.value)))
const val = (e: Event) => (e.target as HTMLInputElement | HTMLSelectElement).value
function toggle(id: string) {
  const single = type.value === 'person' && props.prop.config?.limit === 1
  const list = ids.value.includes(id) ? ids.value.filter(x => x !== id) : single ? [id] : [...ids.value, id]
  set(list)
}
// Date: today / now / a picked day.
const dateMode = computed(() => props.spec.dynamic ?? (props.spec.value ? 'date' : ''))
const day = computed(() => ((props.spec.value as DateValue | null)?.start ?? '').slice(0, 10))
function setDateMode(mode: string) {
  if (mode === 'today' || mode === 'now') setDynamic(mode)
  else if (mode === 'date') set({ start: day.value || new Date().toISOString().slice(0, 10) })
  else set(null)
}
// Relation: the picker opens over the editor.
const picker = shallowRef<HTMLElement | null>(null)
const pickerOpen = ref(false)
</script>

<template>
  <span class="me-db-action-value" :data-type="type">
    <input
      v-if="type === 'title' || type === 'text' || type === 'url' || type === 'email' || type === 'phone'"
      class="me-input"
      :value="text"
      :placeholder="m.emptyValue"
      :aria-label="prop.name"
      @change="set(val($event))"
    >
    <input
      v-else-if="type === 'number'"
      class="me-input"
      inputmode="decimal"
      :value="text"
      :placeholder="m.emptyValue"
      :aria-label="prop.name"
      @change="set(val($event).trim() ? parseNumber(val($event), db.locale.value) : null)"
    >
    <select v-else-if="type === 'select' || type === 'status'" class="me-input me-db-select" :value="text" :aria-label="prop.name" @change="set(val($event) || null)">
      <option value="">{{ m.emptyValue }}</option>
      <option v-for="o in options" :key="o.id" :value="o.id">{{ o.name }}</option>
    </select>
    <span v-else-if="type === 'multi_select'" class="me-db-chips" role="group" :aria-label="prop.name">
      <button
        v-for="o in options"
        :key="o.id"
        type="button"
        class="me-db-tag me-db-chip"
        :class="{ 'is-on': ids.includes(o.id) }"
        :data-color="o.color === 'default' ? undefined : o.color"
        :aria-pressed="ids.includes(o.id)"
        @click="toggle(o.id)"
      >
        {{ o.name }}
      </button>
    </span>
    <select v-else-if="type === 'checkbox'" class="me-input me-db-select" :value="spec.value ? 'true' : 'false'" :aria-label="prop.name" @change="set(val($event) === 'true')">
      <option value="true">{{ m.checked }}</option>
      <option value="false">{{ m.unchecked }}</option>
    </select>
    <span v-else-if="type === 'date'" class="me-db-row">
      <select class="me-input me-db-select" :value="dateMode" :aria-label="prop.name" data-date-mode @change="setDateMode(val($event))">
        <option value="">{{ m.emptyValue }}</option>
        <option value="today">{{ m.relative.today }}</option>
        <option value="now">{{ m.dynamicNow }}</option>
        <option value="date">{{ m.customDate }}</option>
      </select>
      <input v-if="dateMode === 'date'" type="date" class="me-input" :value="day" :aria-label="m.customDate" @change="set(val($event) ? { start: val($event) } : null)">
    </span>
    <span v-else-if="type === 'person'" class="me-db-chips" role="group" :aria-label="prop.name">
      <button
        v-if="me"
        type="button"
        class="me-db-tag me-db-chip"
        :class="{ 'is-on': spec.dynamic === 'me' }"
        :aria-pressed="spec.dynamic === 'me'"
        data-me
        @click="spec.dynamic === 'me' ? set(null) : setDynamic('me')"
      >
        {{ m.me }}
      </button>
      <button
        v-for="p in people"
        :key="p.id"
        type="button"
        class="me-db-tag me-db-chip"
        :class="{ 'is-on': !spec.dynamic && ids.includes(p.id) }"
        :aria-pressed="!spec.dynamic && ids.includes(p.id)"
        @click="spec.dynamic ? set([p.id]) : toggle(p.id)"
      >
        {{ p.name }}
      </button>
    </span>
    <span v-else-if="type === 'relation'" class="me-db-chips">
      <span v-for="id in ids" :key="id" class="me-db-tag">{{ db.names.rows.get(id) ?? id }}</span>
      <button ref="picker" type="button" class="me-db-icon-button" :aria-label="prop.name" :title="prop.name" @click="pickerOpen = true"><Plus /></button>
      <DbPopover v-if="pickerOpen" :anchor="picker" :scope="db.scope.value" :label="prop.name" @close="pickerOpen = false">
        <SearchPicker kind="relation" :value="ids" :database-id="prop.config?.database_id" :single="prop.config?.limit === 1" @change="set" />
      </DbPopover>
    </span>
  </span>
</template>
