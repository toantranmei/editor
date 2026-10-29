<script setup lang="ts">
/**
 * Editor for one cell, shown in a popover over the cell. Writes contract-typed values with `setCell`:
 * text-like → string, number → number, select / status → option id, multi-select → ids, date → { start, end? },
 * person / relation → ids, files → [{ id, name, url }]; clearing writes `null`.
 */
import { computed, nextTick, onMounted, ref } from 'vue'
import { useDb } from '../context'
import type { DateValue, FileValue, Prop, Row } from '../types'
import { cellValue, isEmptyValue, isReadOnly } from '../util'
import { formatNumber, parseNumber } from '../values'
import DbDatePicker from './DbDatePicker.vue'
import DbPopover from './DbPopover.vue'
import FilesEditor from './FilesEditor.vue'
import OptionPicker from './OptionPicker.vue'
import SearchPicker from './SearchPicker.vue'

const props = defineProps<{
  prop: Prop
  row: Row
  anchor: HTMLElement | DOMRect | null
  /** Text typed to start editing (replaces the value, like a spreadsheet). */
  initialText?: string | null
}>()
/** `move`: where the table should go after committing with Enter / Tab. */
const emit = defineEmits<{ close: [move?: 'down' | 'right' | 'left' | null] }>()

const db = useDb()
const m = computed(() => db.m.value)
const type = computed(() => props.prop.type)
const current = computed(() => cellValue(props.row, props.prop))
const textLike = computed(() => ['title', 'text', 'url', 'email', 'phone', 'number'].includes(type.value))

function initialDraft(): string {
  if (props.initialText != null) return props.initialText
  const v = current.value
  if (isEmptyValue(v)) return ''
  if (type.value === 'number' && typeof v === 'number') return String(v)
  return String(v)
}
const draft = ref(initialDraft())
const area = ref<HTMLTextAreaElement | null>(null)
const error = ref(false)

onMounted(() => nextTick(() => {
  const el = area.value
  if (!el) return
  el.focus()
  const end = el.value.length
  el.setSelectionRange(end, end)
}))

/** The value as edited here (the store's row only updates after the source's next read). */
const local = ref<unknown>(current.value)
function write(value: unknown) {
  if (!db.canEditContent.value || isReadOnly(type.value)) return
  local.value = isEmptyValue(value) ? null : value
  db.source.setCell(props.row.id, props.prop.id, isEmptyValue(value) ? null : value)
}

/** Commits the text draft; returns false when it can't be parsed (number). */
function commitText(): boolean {
  if (type.value === 'number') {
    const n = draft.value.trim() ? parseNumber(draft.value, db.locale.value) : null
    if (draft.value.trim() && n === null) {
      error.value = true
      return false
    }
    if (n !== current.value) write(n)
    return true
  }
  const v = type.value === 'title' || type.value === 'text' ? draft.value : draft.value.trim()
  if (v !== (current.value ?? '')) write(v)
  return true
}

function onTextKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    if (commitText()) emit('close', 'down')
  }
  else if (e.key === 'Tab') {
    e.preventDefault()
    if (commitText()) emit('close', e.shiftKey ? 'left' : 'right')
  }
  else if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    emit('close', null)
  }
}

/** Outside click commits the text (like a spreadsheet losing focus); Escape cancels. */
function onClose(reason: 'outside' | 'escape') {
  if (textLike.value && reason === 'outside') commitText()
  emit('close', null)
}

const ids = computed<string[]>(() => {
  const v = local.value
  return Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : []
})
const preview = computed(() => (type.value === 'number' && !error.value && draft.value.trim()
  ? (() => {
      const n = parseNumber(draft.value, db.locale.value)
      return n === null ? '' : formatNumber(n, props.prop.config, db.locale.value)
    })()
  : ''))
</script>

<template>
  <DbPopover :anchor="anchor" :scope="db.scope.value" :placement="textLike ? 'over' : 'below'" :match-width="textLike" :label="prop.name" @close="onClose">
    <div class="me-db-cell-editor" :class="`is-${type}`">
      <template v-if="textLike">
        <textarea
          ref="area"
          v-model="draft"
          class="me-db-cell-textarea"
          :class="{ 'is-error': error }"
          :rows="type === 'text' ? 3 : 1"
          :inputmode="type === 'number' ? 'decimal' : undefined"
          :aria-label="prop.name"
          :aria-invalid="error || undefined"
          @input="error = false"
          @keydown="onTextKey"
        />
        <div v-if="preview" class="me-db-cell-hint">{{ preview }}</div>
      </template>
      <OptionPicker
        v-else-if="type === 'select' || type === 'status' || type === 'multi_select'"
        :prop="prop"
        :value="ids"
        :multiple="type === 'multi_select'"
        :initial-query="initialText ?? ''"
        @change="v => write(type === 'multi_select' ? v : v[0] ?? null)"
        @done="emit('close', null)"
      />
      <DbDatePicker
        v-else-if="type === 'date'"
        :value="(local as DateValue | null) ?? null"
        :include-time="!!prop.config?.time"
        @change="v => write(v)"
      />
      <SearchPicker
        v-else-if="type === 'person' || type === 'relation'"
        :kind="type === 'person' ? 'person' : 'relation'"
        :value="ids"
        :database-id="prop.config?.database_id"
        :initial-query="initialText ?? ''"
        @change="v => write(v)"
      />
      <FilesEditor v-else-if="type === 'files'" :value="(local as FileValue[] | null) ?? []" @change="v => write(v)" />
      <div v-else class="me-db-cell-hint">{{ m.readOnly }}</div>
    </div>
  </DbPopover>
</template>
