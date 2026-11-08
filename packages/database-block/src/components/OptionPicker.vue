<script setup lang="ts">
/**
 * Select / multi-select / status editor: search, pick, create an option (when the user may edit the schema),
 * and edit an option through its "⋯" menu (the property's option menu: name, delete, default / group, color).
 */
import { Check, MoreHorizontal, Plus, X } from '@lucide/vue'
import { computed, nextTick, onMounted, ref } from 'vue'
import { useDb } from '../context'
import type { Prop, PropConfig, SelectOption } from '../types'
import { fold } from '../util'
import { newOption, optionsOf } from '../values'
import OptionMenu from './OptionMenu.vue'

const props = withDefaults(defineProps<{
  prop: Prop
  /** Option id(s) selected. */
  value: string[]
  multiple: boolean
  /** Allow creating / editing options (needs `canEditStructure`). */
  editable?: boolean
  initialQuery?: string
}>(), { editable: true, initialQuery: '' })
const emit = defineEmits<{ change: [ids: string[]], done: [] }>()

const db = useDb()
const m = computed(() => db.m.value)
const query = ref(props.initialQuery)
const input = ref<HTMLInputElement | null>(null)
const active = ref(0)
const canEdit = computed(() => props.editable && db.canEditStructure.value)
/** Status options are added in the property's menu (each belongs to a group), not from a cell. */
const canCreate = computed(() => canEdit.value && props.prop.type !== 'status')
/** The property as the source has it now (its option menu saves while open). */
const live = computed(() => db.props.value.find(p => p.id === props.prop.id) ?? props.prop)
const options = computed(() => optionsOf(live.value))
const filtered = computed(() => {
  const q = fold(query.value.trim())
  return q ? options.value.filter(o => fold(o.name).includes(q)) : options.value
})
const exact = computed(() => options.value.some(o => fold(o.name) === fold(query.value.trim())))
const showCreate = computed(() => canCreate.value && !!query.value.trim() && !exact.value)
const selected = computed(() => props.value.map(id => options.value.find(o => o.id === id)).filter((o): o is SelectOption => !!o))

onMounted(() => nextTick(() => input.value?.focus()))

function toggle(opt: SelectOption) {
  if (props.multiple) {
    const has = props.value.includes(opt.id)
    emit('change', has ? props.value.filter(id => id !== opt.id) : [...props.value, opt.id])
    query.value = ''
  }
  else {
    emit('change', props.value[0] === opt.id ? [] : [opt.id])
    emit('done')
  }
}

function saveOptions(next: SelectOption[]) {
  patchConfig({ options: next })
}
function patchConfig(patch: Partial<PropConfig>) {
  const config: PropConfig = { ...live.value.config, ...patch }
  for (const k of Object.keys(patch)) if (patch[k] === undefined) delete config[k]
  db.source.upsertProp({ ...live.value, config })
}

function create() {
  const name = query.value.trim()
  if (!name) return
  const opt = newOption(name, options.value)
  saveOptions([...options.value, opt])
  query.value = ''
  if (props.multiple) emit('change', [...props.value, opt.id])
  else {
    emit('change', [opt.id])
    emit('done')
  }
}

function onKey(e: KeyboardEvent) {
  const n = filtered.value.length + (showCreate.value ? 1 : 0)
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    if (n) active.value = (active.value + (e.key === 'ArrowDown' ? 1 : n - 1)) % n
  }
  else if (e.key === 'Enter') {
    e.preventDefault()
    const opt = filtered.value[active.value]
    if (opt) toggle(opt)
    else if (showCreate.value) create()
    else emit('done')
  }
  else if (e.key === 'Backspace' && !query.value && props.multiple && props.value.length) {
    emit('change', props.value.slice(0, -1))
  }
}

// ── Option menu ──
const editing = ref<{ id: string, anchor: HTMLElement } | null>(null)
function openEdit(option: SelectOption, e: MouseEvent) {
  editing.value = editing.value?.id === option.id ? null : { id: option.id, anchor: e.currentTarget as HTMLElement }
}
</script>

<template>
  <div class="me-db-picker" @keydown="onKey">
    <div class="me-db-picker-input">
      <span v-for="opt in selected" :key="opt.id" class="me-db-tag" :data-color="opt.color === 'default' ? undefined : opt.color">
        {{ opt.name }}
        <button type="button" class="me-db-tag-remove" :aria-label="m.remove" @click="emit('change', value.filter(id => id !== opt.id))"><X /></button>
      </span>
      <input ref="input" v-model="query" class="me-db-picker-search" :placeholder="m.searchOrCreate" :aria-label="m.searchOrCreate" @input="active = 0">
    </div>
    <div class="me-menu me-db-picker-list" role="listbox" :aria-multiselectable="multiple">
      <div
        v-for="(opt, i) in filtered"
        :key="opt.id"
        class="me-menu-item me-db-picker-item"
        :class="{ 'is-active': i === active }"
        role="option"
        :aria-selected="value.includes(opt.id)"
        @mouseenter="active = i"
        @click="toggle(opt)"
      >
        <span class="me-db-tag" :class="{ 'is-status': prop.type === 'status' }" :data-color="opt.color === 'default' ? undefined : opt.color">{{ opt.name }}</span>
        <Check v-if="value.includes(opt.id)" class="me-db-picker-check" />
        <button v-if="canEdit" type="button" class="me-db-icon-button" :aria-label="m.editOptions" data-option-more @click.stop="openEdit(opt, $event)">
          <MoreHorizontal />
        </button>
      </div>
      <div
        v-if="showCreate"
        class="me-menu-item me-db-picker-item"
        :class="{ 'is-active': active === filtered.length }"
        role="option"
        aria-selected="false"
        @mouseenter="active = filtered.length"
        @click="create"
      >
        <Plus class="me-db-picker-check" />
        <span>{{ m.create }}</span>
        <span class="me-db-tag" :data-color="newOption('', options).color">{{ query.trim() }}</span>
      </div>
      <div v-if="!filtered.length && !showCreate" class="me-menu-empty">{{ m.noResults }}</div>
    </div>

    <OptionMenu
      v-if="editing"
      :key="editing.id"
      :config="live.config ?? {}"
      :option-id="editing.id"
      :anchor="editing.anchor"
      :status="prop.type === 'status'"
      @change="patchConfig"
      @removed="id => emit('change', value.filter(x => x !== id))"
      @close="editing = null"
    />
  </div>
</template>
