<script setup lang="ts">
/** Read-only rendering of one value (table cells, cards, list rows). */
import { Check, FileText } from '@lucide/vue'
import { computed } from 'vue'
import { useDb } from '../context'
import { resultType } from '../filters'
import type { FileValue, Prop, Row } from '../types'
import { displayText, optionById } from '../values'
import { isEmptyValue } from '../util'
import ButtonCell from './ButtonCell.vue'

/** `row`: the row shown (buttons run their actions on it). */
const props = defineProps<{ prop: Prop, value: unknown, compact?: boolean, row?: Row | null }>()
const db = useDb()

const type = computed(() => resultType(props.prop))
const text = computed(() => displayText({ ...props.prop, type: type.value === 'checkbox' && props.prop.type === 'formula' ? 'checkbox' : props.prop.type }, props.value, db.valueCtx.value))
const options = computed(() => {
  const v = props.value
  if (props.prop.type === 'select' || props.prop.type === 'status') return v ? [optionById(props.prop, v)].filter(Boolean) : []
  if (props.prop.type === 'multi_select') return (Array.isArray(v) ? v : []).map(id => optionById(props.prop, id)).filter(Boolean)
  return []
})
const people = computed(() => {
  const v = props.value
  if (!['person', 'created_by', 'last_edited_by'].includes(props.prop.type) || isEmptyValue(v)) return []
  return (Array.isArray(v) ? v : [v]).map(id => ({
    id: String(id),
    name: db.names.people.get(String(id)) ?? String(id),
    avatar: db.names.avatars.get(String(id)),
  }))
})
const relations = computed(() => (props.prop.type === 'relation' && Array.isArray(props.value)
  ? props.value.map(id => ({ id: String(id), title: db.valueCtx.value.rowTitle?.(String(id)) ?? String(id) }))
  : []))
const files = computed(() => (props.prop.type === 'files' && Array.isArray(props.value) ? props.value as FileValue[] : []))
const href = computed(() => {
  const v = typeof props.value === 'string' ? props.value.trim() : ''
  if (!v) return undefined
  if (props.prop.type === 'url') return /^https?:\/\//i.test(v) ? v : `https://${v}`
  if (props.prop.type === 'email') return `mailto:${v}`
  if (props.prop.type === 'phone') return `tel:${v.replace(/[^\d+]/g, '')}`
  return undefined
})
const isNumber = computed(() => type.value === 'number')
/** Number shown as a bar / ring: fill = value / divide_by (default 100), clamped to 0..1. */
const meter = computed(() => {
  const show = props.prop.config?.show_as
  if (!isNumber.value || (show !== 'bar' && show !== 'ring') || typeof props.value !== 'number') return null
  const full = Number(props.prop.config?.divide_by) || 100
  const ratio = Math.max(0, Math.min(1, props.value / full))
  return { kind: show, ratio, color: props.prop.config?.show_color ?? 'green', number: props.prop.config?.show_number !== false }
})
/** URL with "Show full URL" off: the host only. */
const linkText = computed(() => {
  if (props.prop.type !== 'url' || props.prop.config?.full_url !== false || !href.value) return text.value
  try {
    return new URL(href.value).host
  }
  catch {
    return text.value
  }
})
const isCheckbox = computed(() => props.prop.type === 'checkbox' || (props.prop.type === 'formula' && typeof props.value === 'boolean'))
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(-2).map(w => w[0]).join('').toUpperCase()
</script>

<template>
  <span class="me-db-value" :class="{ 'is-number': isNumber, 'is-compact': compact }">
    <ButtonCell v-if="prop.type === 'button'" :prop="prop" :row="row ?? null" />
    <span v-else-if="isCheckbox" class="me-db-checkbox" :class="{ 'is-checked': !!value }" role="img" :aria-label="value ? db.m.value.checked : db.m.value.unchecked">
      <Check v-if="value" />
    </span>
    <template v-else-if="options.length">
      <span v-for="opt in options" :key="opt!.id" class="me-db-tag" :class="{ 'is-status': prop.type === 'status' }" :data-color="opt!.color === 'default' ? undefined : opt!.color">{{ opt!.name }}</span>
    </template>
    <template v-else-if="people.length">
      <span v-for="p in people" :key="p.id" class="me-db-person">
        <img v-if="p.avatar" class="me-db-avatar" :src="p.avatar" alt="">
        <span v-else class="me-db-avatar is-initials" aria-hidden="true">{{ initials(p.name) }}</span>
        <span class="me-db-person-name">{{ p.name }}</span>
      </span>
    </template>
    <template v-else-if="relations.length">
      <span v-for="r in relations" :key="r.id" class="me-db-relation">
        <FileText class="me-db-relation-icon" />{{ r.title }}
      </span>
    </template>
    <template v-else-if="files.length">
      <a v-for="f in files" :key="f.id" class="me-db-file" :href="f.url" target="_blank" rel="noopener" @click.stop>{{ f.name }}</a>
    </template>
    <span v-else-if="meter" class="me-db-meter" :class="`is-${meter.kind}`" :data-color="meter.color === 'default' ? undefined : meter.color" role="meter" :aria-valuenow="Number(value)" aria-valuemin="0" :aria-valuemax="Number(prop.config?.divide_by) || 100" :aria-label="text">
      <svg v-if="meter.kind === 'ring'" class="me-db-ring" viewBox="0 0 36 36" aria-hidden="true">
        <circle class="me-db-ring-track" cx="18" cy="18" r="15.9155" pathLength="100" />
        <circle class="me-db-ring-fill" cx="18" cy="18" r="15.9155" pathLength="100" :stroke-dasharray="`${meter.ratio * 100} 100`" />
      </svg>
      <span v-else class="me-db-bar"><span class="me-db-bar-fill" :style="{ inlineSize: `${meter.ratio * 100}%` }" /></span>
      <span v-if="meter.number" class="me-db-meter-number">{{ text }}</span>
    </span>
    <a v-else-if="href" class="me-db-link" :href="href" target="_blank" rel="noopener" @click.stop>{{ linkText }}</a>
    <span v-else class="me-db-text">{{ text }}</span>
  </span>
</template>
