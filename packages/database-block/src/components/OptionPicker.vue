<script setup lang="ts">
/**
 * Select / multi-select / status editor: search, pick, create an option (when the user may edit the schema),
 * and edit an option (rename, color, delete) through its "⋯" menu.
 */
import { Check, MoreHorizontal, Plus, Trash2, X } from '@lucide/vue'
import { COLORS } from '@toantranmei/editor'
import { computed, nextTick, onMounted, ref } from 'vue'
import { useDb } from '../context'
import type { OptionColor, Prop, SelectOption } from '../types'
import { fold } from '../util'
import { newOption, optionsOf } from '../values'
import DbPopover from './DbPopover.vue'

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
const canCreate = computed(() => props.editable && db.canEditStructure.value && props.prop.type !== 'status')
const options = computed(() => optionsOf(props.prop))
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
  db.source.upsertProp({ ...props.prop, config: { ...props.prop.config, options: next } })
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

// ── Option menu (rename / color / delete) ──
const editing = ref<{ option: SelectOption, anchor: HTMLElement } | null>(null)
const editName = ref('')
function openEdit(option: SelectOption, e: MouseEvent) {
  editing.value = { option, anchor: e.currentTarget as HTMLElement }
  editName.value = option.name
}
function rename() {
  const e = editing.value
  if (!e || !editName.value.trim() || editName.value === e.option.name) return
  saveOptions(options.value.map(o => (o.id === e.option.id ? { ...o, name: editName.value.trim() } : o)))
}
function recolor(color: OptionColor) {
  const e = editing.value
  if (!e) return
  saveOptions(options.value.map(o => (o.id === e.option.id ? { ...o, color } : o)))
  editing.value = { ...e, option: { ...e.option, color } }
}
function remove() {
  const e = editing.value
  if (!e) return
  saveOptions(options.value.filter(o => o.id !== e.option.id))
  emit('change', props.value.filter(id => id !== e.option.id))
  editing.value = null
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
        <span class="me-db-tag" :data-color="opt.color === 'default' ? undefined : opt.color">{{ opt.name }}</span>
        <Check v-if="value.includes(opt.id)" class="me-db-picker-check" />
        <button v-if="canCreate" type="button" class="me-db-icon-button" :aria-label="m.editOptions" @click.stop="openEdit(opt, $event)">
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

    <DbPopover v-if="editing" :anchor="editing.anchor" :scope="db.scope.value" placement="right" @close="editing = null">
      <div class="me-db-menu">
        <input v-model="editName" class="me-input" :aria-label="m.optionName" @keydown.enter.prevent="rename(); editing = null" @blur="rename">
        <button type="button" class="me-menu-item me-db-danger" @click="remove"><Trash2 class="me-db-menu-icon" />{{ m.deleteOption }}</button>
        <div class="me-menu-label">{{ m.colors.default }}</div>
        <button
          v-for="c in COLORS"
          :key="c"
          type="button"
          class="me-menu-item"
          :aria-pressed="editing.option.color === c"
          @click="recolor(c as OptionColor)"
        >
          <span class="me-db-swatch" :data-color="c === 'default' ? undefined : c" />
          <span class="me-menu-title">{{ m.colors[c] }}</span>
          <Check v-if="editing.option.color === c" class="me-db-picker-check" />
        </button>
      </div>
    </DbPopover>
  </div>
</template>
