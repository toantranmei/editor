<script setup lang="ts">
/**
 * Filter bar under the toolbar (Notion): a chip per sort and per filter condition (nested groups as "N rules"),
 * "+ Filter", and — while the viewer has unsaved filter / sort changes — Reset and "Save for everyone".
 * Chips open the toolbar's sort / filter builder.
 */
import { ArrowDown, ArrowUp, ListFilter, Plus } from '@lucide/vue'
import { computed } from 'vue'
import { useDb } from '../context'
import { countConditions, groupItems, isGroup } from '../filters'
import type { FilterCondition, FilterNode } from '../types'
import { displayText } from '../values'

const db = useDb()
const m = computed(() => db.m.value)
const config = computed(() => db.view.value?.config ?? {})
const propOf = (id: string) => db.props.value.find(p => p.id === id)
const items = computed<FilterNode[]>(() => (config.value.filter ? groupItems(config.value.filter) : []))
const sorts = computed(() => config.value.sorts ?? [])
const dirty = computed(() => !!db.draft.value)
const shown = computed(() => items.value.length > 0 || sorts.value.length > 0 || dirty.value)

/** "Status: Done, Doing", "Due: This week", "Estimate > 3", "Tags is empty". */
function label(c: FilterCondition): string {
  const p = propOf(c.prop)
  if (!p) return c.prop
  const op = m.value.ops[c.op] ?? c.op
  if (c.op === 'is_empty' || c.op === 'is_not_empty') return `${p.name}: ${op.toLowerCase()}`
  if (c.op === 'is_relative') return `${p.name}: ${m.value.relative[String(c.value) as keyof typeof m.value.relative] ?? c.value}`
  const v = c.value
  const values = Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v]
  if (!values.length) return p.name
  const text = values.map((x) => {
    if (p.type === 'select' || p.type === 'status' || p.type === 'multi_select') return p.config?.options?.find(o => o.id === x)?.name ?? String(x)
    if (p.type === 'person' || p.type === 'created_by' || p.type === 'last_edited_by') return db.names.people.get(String(x)) ?? String(x)
    if (p.type === 'checkbox') return x ? m.value.checked : m.value.unchecked
    return displayText({ ...p, type: p.type === 'date' ? 'text' : p.type }, x, db.valueCtx.value) || String(x)
  }).join(', ')
  return ['=', '!=', '>', '>=', '<', '<='].includes(c.op) ? `${p.name} ${c.op} ${text}` : `${p.name}: ${text}`
}
</script>

<template>
  <div v-if="shown" class="me-db-filterbar" role="toolbar" :aria-label="m.filter" data-filterbar>
    <button v-for="s in sorts" :key="`s:${s.prop}`" type="button" class="me-db-chip-button" :class="{ 'is-draft': dirty }" :data-chip-sort="s.prop" @click="db.ui.openSort++">
      <ArrowUp v-if="s.dir === 'asc'" /><ArrowDown v-else />{{ propOf(s.prop)?.name ?? s.prop }}
    </button>
    <span v-if="sorts.length && items.length" class="me-db-filterbar-sep" aria-hidden="true" />
    <button v-for="(n, i) in items" :key="`f:${i}`" type="button" class="me-db-chip-button" :class="{ 'is-draft': dirty }" :data-chip-filter="i" @click="db.ui.openFilter++">
      <ListFilter />{{ isGroup(n) ? `${countConditions(n)} ${m.rules}` : label(n) }}
    </button>
    <button type="button" class="me-db-text-button" data-chip-add @click="db.ui.openFilter++"><Plus />{{ m.filter }}</button>
    <span class="me-db-filterbar-end">
      <template v-if="dirty">
        <button type="button" class="me-db-text-button" data-draft-reset @click="db.resetDraft()">{{ m.reset }}</button>
        <button v-if="db.canEditStructure.value" type="button" class="me-btn me-btn--primary me-db-save-draft" data-draft-save @click="db.saveDraft()">{{ m.saveForEveryone }}</button>
      </template>
    </span>
  </div>
</template>
