<script setup lang="ts">
/** Read-only rendering of one value (table cells, cards, list rows). */
import { Check, FileText } from '@lucide/vue'
import { computed } from 'vue'
import { useDb } from '../context'
import { resultType } from '../filters'
import type { FileValue, Prop } from '../types'
import { displayText, optionById } from '../values'
import { isEmptyValue } from '../util'

const props = defineProps<{ prop: Prop, value: unknown, compact?: boolean }>()
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
const isCheckbox = computed(() => props.prop.type === 'checkbox' || (props.prop.type === 'formula' && typeof props.value === 'boolean'))
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(-2).map(w => w[0]).join('').toUpperCase()
</script>

<template>
  <span class="me-db-value" :class="{ 'is-number': isNumber, 'is-compact': compact }">
    <span v-if="isCheckbox" class="me-db-checkbox" :class="{ 'is-checked': !!value }" role="img" :aria-label="value ? db.m.value.checked : db.m.value.unchecked">
      <Check v-if="value" />
    </span>
    <template v-else-if="options.length">
      <span v-for="opt in options" :key="opt!.id" class="me-db-tag" :data-color="opt!.color === 'default' ? undefined : opt!.color">{{ opt!.name }}</span>
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
    <a v-else-if="href" class="me-db-link" :href="href" target="_blank" rel="noopener" @click.stop>{{ text }}</a>
    <span v-else class="me-db-text">{{ text }}</span>
  </span>
</template>
