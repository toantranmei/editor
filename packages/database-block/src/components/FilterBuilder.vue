<script setup lang="ts">
/**
 * Filter builder: conditions joined by And / Or, plus one level of nested groups (like Notion's "filter group").
 * Writes contract JSON to `view.config.filter` on every change: `{ and: [{ prop, op, value? }, { or: [...] }] }`.
 */
import { Plus, Trash2 } from '@lucide/vue'
import { computed } from 'vue'
import { useDb } from '../context'
import { defaultCondition, filterableProps, groupItems, groupMode, isGroup, makeGroup, opsFor, withOp } from '../filters'
import type { FilterCondition, FilterGroup, FilterNode, FilterOp } from '../types'
import FilterValue from './FilterValue.vue'

const db = useDb()
const m = computed(() => db.m.value)
const root = computed<FilterGroup>(() => db.view.value?.config.filter ?? { and: [] })
const props = computed(() => filterableProps(db.props.value))
const propOf = (id: string) => db.props.value.find(p => p.id === id)
const editable = computed(() => db.canEditStructure.value)

function save(group: FilterGroup) {
  db.updateView({ filter: group })
}

/** Replaces the node at `path` (indices into nested groups); `null` removes it. */
function update(path: number[], node: FilterNode | null) {
  const walk = (g: FilterGroup, depth: number): FilterGroup => {
    const items = [...groupItems(g)]
    const i = path[depth]!
    if (depth === path.length - 1) {
      if (node) items[i] = node
      else items.splice(i, 1)
    }
    else {
      items[i] = walk(items[i] as FilterGroup, depth + 1)
    }
    return makeGroup(groupMode(g), items)
  }
  save(walk(root.value, 0))
}
function setMode(path: number[], mode: 'and' | 'or') {
  if (!path.length) return save(makeGroup(mode, groupItems(root.value)))
  const g = nodeAt(path) as FilterGroup
  update(path, makeGroup(mode, groupItems(g)))
}
function nodeAt(path: number[]): FilterNode {
  let n: FilterNode = root.value
  for (const i of path) n = groupItems(n as FilterGroup)[i]!
  return n
}
function add(path: number[], group = false) {
  const first = props.value[0]
  if (!first) return
  const node: FilterNode = group ? { and: [defaultCondition(first)] } : defaultCondition(first)
  const target = path.length ? nodeAt(path) as FilterGroup : root.value
  const next = makeGroup(groupMode(target), [...groupItems(target), node])
  if (!path.length) save(next)
  else update(path, next)
}
function setProp(path: number[], id: string) {
  const p = propOf(id)
  if (p) update(path, defaultCondition(p))
}
function setOp(path: number[], cond: FilterCondition, op: FilterOp) {
  const p = propOf(cond.prop)
  if (p) update(path, withOp(cond, op, p))
}
function setValue(path: number[], cond: FilterCondition, value: unknown) {
  update(path, { ...cond, value })
}
const items = computed(() => groupItems(root.value))
</script>

<template>
  <div class="me-db-builder" role="group" :aria-label="m.filter">
    <div v-if="!items.length" class="me-menu-empty">{{ m.noFilters }}</div>
    <div v-for="(node, i) in items" :key="i" class="me-db-builder-row" :data-index="i">
      <span class="me-db-builder-join">
        <template v-if="i === 0">{{ m.where }}</template>
        <select v-else-if="i === 1" class="me-input me-db-select" :value="groupMode(root)" :disabled="!editable" :aria-label="m.and" @change="setMode([], ($event.target as HTMLSelectElement).value as 'and' | 'or')">
          <option value="and">{{ m.and }}</option>
          <option value="or">{{ m.or }}</option>
        </select>
        <template v-else>{{ groupMode(root) === 'and' ? m.and : m.or }}</template>
      </span>

      <!-- Nested group -->
      <div v-if="isGroup(node)" class="me-db-builder-group">
        <div v-for="(child, j) in groupItems(node)" :key="j" class="me-db-builder-row">
          <span class="me-db-builder-join">
            <template v-if="j === 0">{{ m.where }}</template>
            <select v-else-if="j === 1" class="me-input me-db-select" :value="groupMode(node)" :disabled="!editable" :aria-label="m.and" @change="setMode([i], ($event.target as HTMLSelectElement).value as 'and' | 'or')">
              <option value="and">{{ m.and }}</option>
              <option value="or">{{ m.or }}</option>
            </select>
            <template v-else>{{ groupMode(node) === 'and' ? m.and : m.or }}</template>
          </span>
          <template v-if="!isGroup(child) && propOf(child.prop)">
            <select class="me-input me-db-select" :value="child.prop" :disabled="!editable" @change="setProp([i, j], ($event.target as HTMLSelectElement).value)">
              <option v-for="p in props" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
            <select class="me-input me-db-select" :value="child.op" :disabled="!editable" @change="setOp([i, j], child, ($event.target as HTMLSelectElement).value as FilterOp)">
              <option v-for="op in opsFor(propOf(child.prop)!)" :key="op" :value="op">{{ m.ops[op] ?? op }}</option>
            </select>
            <FilterValue :prop="propOf(child.prop)!" :op="child.op" :value="child.value" @change="v => setValue([i, j], child, v)" />
          </template>
          <button v-if="editable" type="button" class="me-db-icon-button" :aria-label="m.remove" @click="update([i, j], null)"><Trash2 /></button>
        </div>
        <button v-if="editable" type="button" class="me-db-text-button" @click="add([i])"><Plus />{{ m.addFilter }}</button>
      </div>

      <!-- Condition -->
      <template v-else-if="propOf(node.prop)">
        <select class="me-input me-db-select" :value="node.prop" :disabled="!editable" :aria-label="m.properties" @change="setProp([i], ($event.target as HTMLSelectElement).value)">
          <option v-for="p in props" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <select class="me-input me-db-select" :value="node.op" :disabled="!editable" :aria-label="m.filter" @change="setOp([i], node, ($event.target as HTMLSelectElement).value as FilterOp)">
          <option v-for="op in opsFor(propOf(node.prop)!)" :key="op" :value="op">{{ m.ops[op] ?? op }}</option>
        </select>
        <FilterValue :prop="propOf(node.prop)!" :op="node.op" :value="node.value" @change="v => setValue([i], node, v)" />
      </template>
      <button v-if="editable" type="button" class="me-db-icon-button" :aria-label="m.remove" @click="update([i], null)"><Trash2 /></button>
    </div>
    <div v-if="editable" class="me-db-builder-actions">
      <button type="button" class="me-db-text-button" data-add-filter @click="add([])"><Plus />{{ m.addFilter }}</button>
      <button type="button" class="me-db-text-button" data-add-group @click="add([], true)"><Plus />{{ m.addFilterGroup }}</button>
    </div>
  </div>
</template>
