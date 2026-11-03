<script setup lang="ts">
/**
 * Conditional color rules of the view (Notion's "Conditional color"): property + operator + value (the filter
 * operators), a color, and whether it colors the entire row or only that property. First matching rule wins.
 */
import { Plus, Trash2 } from '@lucide/vue'
import { COLORS } from '@toantranmei/editor'
import { computed } from 'vue'
import { useDb } from '../context'
import { defaultCondition, filterableProps, opsFor, withOp } from '../filters'
import type { ColorRule, FilterOp, OptionColor } from '../types'
import { uuidv7 } from '../util'
import FilterValue from './FilterValue.vue'

const db = useDb()
const m = computed(() => db.m.value)
const editable = computed(() => db.canEditStructure.value)
const rules = computed<ColorRule[]>(() => db.view.value?.config.colors ?? [])
const props = computed(() => filterableProps(db.props.value))
const propOf = (id: string) => db.props.value.find(p => p.id === id)

const save = (next: ColorRule[]) => db.updateView({ colors: next.length ? next : undefined })
const patch = (id: string, p: Partial<ColorRule>) => save(rules.value.map(r => (r.id === id ? { ...r, ...p } : r)))
function add() {
  const first = props.value[0]
  if (!first) return
  save([...rules.value, { id: uuidv7(), condition: defaultCondition(first), color: 'red', scope: 'row' }])
}
function setProp(rule: ColorRule, id: string) {
  const p = propOf(id)
  if (p) patch(rule.id, { condition: defaultCondition(p) })
}
function setOp(rule: ColorRule, op: FilterOp) {
  const p = propOf(rule.condition.prop)
  if (p) patch(rule.id, { condition: withOp(rule.condition, op, p) })
}
</script>

<template>
  <div class="me-db-color-rules" data-panel="colors">
    <p v-if="!rules.length" class="me-db-hint">{{ m.conditionalColorHint }}</p>
    <div v-for="rule in rules" :key="rule.id" class="me-db-color-rule" :data-rule="rule.id" :data-cc="rule.color === 'default' ? undefined : rule.color">
      <div class="me-db-row">
        <select class="me-input me-db-select" :value="rule.condition.prop" :disabled="!editable" :aria-label="m.property" data-rule-prop @change="setProp(rule, ($event.target as HTMLSelectElement).value)">
          <option v-for="p in props" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <select v-if="propOf(rule.condition.prop)" class="me-input me-db-select" :value="rule.condition.op" :disabled="!editable" :aria-label="m.operator" data-rule-op @change="setOp(rule, ($event.target as HTMLSelectElement).value as FilterOp)">
          <option v-for="op in opsFor(propOf(rule.condition.prop)!)" :key="op" :value="op">{{ m.ops[op] ?? op }}</option>
        </select>
        <button type="button" class="me-db-icon-button" :disabled="!editable" :aria-label="m.deleteColorRule" :title="m.deleteColorRule" data-rule-delete @click="save(rules.filter(r => r.id !== rule.id))"><Trash2 /></button>
      </div>
      <FilterValue v-if="propOf(rule.condition.prop)" :prop="propOf(rule.condition.prop)!" :op="rule.condition.op" :value="rule.condition.value" @change="v => patch(rule.id, { condition: { ...rule.condition, value: v } })" />
      <div class="me-db-row">
        <span class="me-menu-label">{{ m.background }}</span>
        <select class="me-input me-db-select" :value="rule.color" :disabled="!editable" data-rule-color @change="patch(rule.id, { color: ($event.target as HTMLSelectElement).value as OptionColor })">
          <option v-for="c in COLORS" :key="c" :value="c">{{ m.colors[c] }}</option>
        </select>
      </div>
      <div class="me-db-row">
        <span class="me-menu-label">{{ m.applyTo }}</span>
        <select class="me-input me-db-select" :value="rule.scope ?? 'row'" :disabled="!editable" data-rule-scope @change="patch(rule.id, { scope: ($event.target as HTMLSelectElement).value as 'row' | 'prop' })">
          <option value="row">{{ m.entireRow }}</option>
          <option value="prop">{{ m.thisProperty }}</option>
        </select>
      </div>
    </div>
    <button v-if="editable" type="button" class="me-db-text-button" data-rule-add @click="add"><Plus />{{ m.addColorRule }}</button>
  </div>
</template>
