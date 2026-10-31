<script setup lang="ts">
/** Sorts of the view: `config.sorts = [{ prop, dir }]`, applied in order. */
import { ArrowDown, ArrowUp, Plus, Trash2 } from '@lucide/vue'
import { computed } from 'vue'
import { useDb } from '../context'
import type { Sort } from '../types'

const db = useDb()
const m = computed(() => db.m.value)
const sorts = computed(() => db.view.value?.config.sorts ?? [])
const editable = computed(() => db.canEditStructure.value)
const sortable = computed(() => db.props.value.filter(p => p.type !== 'files'))

const save = (next: Sort[]) => db.updateView({ sorts: next.length ? next : undefined })
const set = (i: number, patch: Partial<Sort>) => save(sorts.value.map((s, j) => (j === i ? { ...s, ...patch } : s)))
function add() {
  const used = new Set(sorts.value.map(s => s.prop))
  const p = sortable.value.find(x => !used.has(x.id)) ?? sortable.value[0]
  if (p) save([...sorts.value, { prop: p.id, dir: 'asc' }])
}
function move(i: number, d: -1 | 1) {
  const next = [...sorts.value]
  const [s] = next.splice(i, 1)
  next.splice(i + d, 0, s!)
  save(next)
}
</script>

<template>
  <div class="me-db-builder" role="group" :aria-label="m.sort">
    <div v-if="!sorts.length" class="me-menu-empty">{{ m.noSorts }}</div>
    <div v-for="(s, i) in sorts" :key="i" class="me-db-builder-row" :data-index="i">
      <select class="me-input me-db-select" :value="s.prop" :disabled="!editable" :aria-label="m.properties" @change="set(i, { prop: ($event.target as HTMLSelectElement).value })">
        <option v-for="p in sortable" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
      <select class="me-input me-db-select" :value="s.dir" :disabled="!editable" :aria-label="m.sort" @change="set(i, { dir: ($event.target as HTMLSelectElement).value as 'asc' | 'desc' })">
        <option value="asc">{{ m.ascending }}</option>
        <option value="desc">{{ m.descending }}</option>
      </select>
      <template v-if="editable">
        <button type="button" class="me-db-icon-button" :disabled="i === 0" :aria-label="m.moveUp" @click="move(i, -1)"><ArrowUp /></button>
        <button type="button" class="me-db-icon-button" :disabled="i === sorts.length - 1" :aria-label="m.moveDown" @click="move(i, 1)"><ArrowDown /></button>
        <button type="button" class="me-db-icon-button" :aria-label="m.remove" @click="save(sorts.filter((_, j) => j !== i))"><Trash2 /></button>
      </template>
    </div>
    <div v-if="editable" class="me-db-builder-actions">
      <button type="button" class="me-db-text-button" data-add-sort @click="add"><Plus />{{ m.addSort }}</button>
    </div>
  </div>
</template>
