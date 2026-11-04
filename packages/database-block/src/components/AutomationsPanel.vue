<script setup lang="ts">
/**
 * Database automations (Notion's ⚡): when a page is added or a property is edited (optionally only to a matching
 * value), run steps on that page. Kept in the title property's `config.automations`; run by this block right after
 * the write that triggers them (see `context.ts`).
 */
import { Plus, Trash2 } from '@lucide/vue'
import { computed } from 'vue'
import { useDb } from '../context'
import { defaultCondition, filterableProps, opsFor, withOp } from '../filters'
import type { Automation, AutomationTrigger, DbAction, FilterOp } from '../types'
import { isReadOnly, uuidv7 } from '../util'
import ActionEditor from './ActionEditor.vue'
import FilterValue from './FilterValue.vue'

const db = useDb()
const m = computed(() => db.m.value)
const editable = computed(() => db.canEditStructure.value)
const list = computed(() => db.automations.value)
const props = computed(() => filterableProps(db.props.value).filter(p => !isReadOnly(p.type)))
const propOf = (id: string | undefined) => (id ? db.props.value.find(p => p.id === id) : undefined)

const save = (next: Automation[]) => db.saveAutomations(next)
const patch = (id: string, p: Partial<Automation>) => save(list.value.map(a => (a.id === id ? { ...a, ...p } : a)))
const add = () => save([...list.value, { id: uuidv7(), enabled: true, trigger: { type: 'row_added' }, actions: [] }])
const val = (e: Event) => (e.target as HTMLInputElement | HTMLSelectElement).value

function setTriggerType(a: Automation, type: AutomationTrigger['type']) {
  if (a.trigger.type !== type) patch(a.id, { trigger: type === 'row_added' ? { type } : { type, prop: props.value[0]?.id } })
}
function setTriggerProp(a: Automation, id: string) {
  patch(a.id, { trigger: { type: 'prop_changed', prop: id || undefined } })
}
function toggleCondition(a: Automation, on: boolean) {
  const t = a.trigger
  const p = t.type === 'prop_changed' ? propOf(t.prop) : undefined
  if (t.type !== 'prop_changed' || !p) return
  patch(a.id, { trigger: on ? { ...t, condition: defaultCondition(p) } : { type: t.type, prop: t.prop } })
}
function setOp(a: Automation, op: FilterOp) {
  const t = a.trigger
  const p = t.type === 'prop_changed' ? propOf(t.prop) : undefined
  if (t.type === 'prop_changed' && p && t.condition) patch(a.id, { trigger: { ...t, condition: withOp(t.condition, op, p) } })
}
function setCondValue(a: Automation, value: unknown) {
  const t = a.trigger
  if (t.type === 'prop_changed' && t.condition) patch(a.id, { trigger: { ...t, condition: { ...t.condition, value } } })
}
</script>

<template>
  <div class="me-db-automations" data-panel="automations">
    <p class="me-db-hint">{{ m.automationsHint }}</p>
    <fieldset v-for="a in list" :key="a.id" class="me-db-automation" :class="{ 'is-off': !a.enabled }" :data-automation="a.id" :disabled="!editable">
      <div class="me-db-row">
        <input class="me-input" :value="a.name ?? ''" :placeholder="m.automationName" :aria-label="m.automationName" data-automation-name @change="patch(a.id, { name: val($event).trim() || undefined })">
        <label class="me-db-row" :title="m.automationEnabled">
          <span class="me-menu-label">{{ m.automationEnabled }}</span>
          <input type="checkbox" class="me-db-switch" :checked="a.enabled" :aria-label="m.automationEnabled" data-automation-enabled @change="patch(a.id, { enabled: ($event.target as HTMLInputElement).checked })">
        </label>
        <button type="button" class="me-db-icon-button" :aria-label="m.deleteAutomation" :title="m.deleteAutomation" data-automation-delete @click="save(list.filter(x => x.id !== a.id))"><Trash2 /></button>
      </div>
      <label class="me-db-field">
        <span class="me-menu-label">{{ m.triggerWhen }}</span>
        <select class="me-input me-db-select" :value="a.trigger.type" data-trigger-type @change="setTriggerType(a, val($event) as AutomationTrigger['type'])">
          <option value="row_added">{{ m.triggers.row_added }}</option>
          <option value="prop_changed">{{ m.triggers.prop_changed }}</option>
        </select>
      </label>
      <template v-if="a.trigger.type === 'prop_changed'">
        <select class="me-input me-db-select" :value="a.trigger.prop ?? ''" :aria-label="m.property" data-trigger-prop @change="setTriggerProp(a, val($event))">
          <option value="">{{ m.anyProperty }}</option>
          <option v-for="p in props" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <template v-if="propOf(a.trigger.prop)">
          <label class="me-db-toggle-row">
            <span>{{ m.onlyWhen }}</span>
            <input type="checkbox" class="me-db-switch" :checked="!!a.trigger.condition" data-trigger-condition @change="toggleCondition(a, ($event.target as HTMLInputElement).checked)">
          </label>
          <template v-if="a.trigger.condition">
            <select class="me-input me-db-select" :value="a.trigger.condition.op" :aria-label="m.operator" data-trigger-op @change="setOp(a, val($event) as FilterOp)">
              <option v-for="op in opsFor(propOf(a.trigger.prop)!)" :key="op" :value="op">{{ m.ops[op] ?? op }}</option>
            </select>
            <FilterValue :prop="propOf(a.trigger.prop)!" :op="a.trigger.condition.op" :value="a.trigger.condition.value" @change="v => setCondValue(a, v)" />
          </template>
        </template>
      </template>
      <div class="me-db-field">
        <span class="me-menu-label">{{ m.thenDo }}</span>
        <ActionEditor :actions="a.actions" kind="automation" :disabled="!editable" @change="(actions: DbAction[]) => patch(a.id, { actions })" />
      </div>
    </fieldset>
    <button v-if="editable" type="button" class="me-db-text-button" data-automation-add @click="add"><Plus />{{ m.addAutomation }}</button>
  </div>
</template>
