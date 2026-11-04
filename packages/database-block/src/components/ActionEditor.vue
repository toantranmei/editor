<script setup lang="ts">
/**
 * Steps of a button property or an automation (Notion's actions): edit properties of the row, add a page, open a
 * URL, show a confirmation. Shared by the property editor (`kind: 'button'`) and the automations panel.
 */
import { Plus, Trash2, X } from '@lucide/vue'
import { computed } from 'vue'
import { actionWritable, AUTOMATION_ACTIONS, BUTTON_ACTIONS, newAction } from '../actions'
import { useDb } from '../context'
import type { ActionValue, DbAction, DbActionType } from '../types'
import ActionValueInput from './ActionValueInput.vue'

const props = defineProps<{ actions: DbAction[], kind: 'button' | 'automation', disabled?: boolean }>()
const emit = defineEmits<{ change: [actions: DbAction[]] }>()
const db = useDb()
const m = computed(() => db.m.value)
const types = computed(() => (props.kind === 'button' ? BUTTON_ACTIONS : AUTOMATION_ACTIONS))
const writable = computed(() => db.props.value.filter(actionWritable))
const urlProps = computed(() => db.props.value.filter(p => p.type === 'url'))
const propOf = (id: string) => db.props.value.find(p => p.id === id)

const save = (next: DbAction[]) => emit('change', next)
const patch = (id: string, p: Partial<DbAction>) => save(props.actions.map(a => (a.id === id ? { ...a, ...p } as DbAction : a)))
const add = (type: DbActionType) => save([...props.actions, newAction(type)])
const remove = (id: string) => save(props.actions.filter(a => a.id !== id))
function setType(a: DbAction, type: DbActionType) {
  if (a.type !== type) save(props.actions.map(x => (x.id === a.id ? { ...newAction(type), id: a.id } : x)))
}
type WithValues = Extract<DbAction, { values: ActionValue[] }>
/** Properties not set yet by this step (each property once). */
const free = (a: WithValues) => writable.value.filter(p => !a.values.some(v => v.prop === p.id))
function addValue(a: WithValues) {
  const p = free(a)[0]
  if (p) patch(a.id, { values: [...a.values, { prop: p.id, value: p.type === 'checkbox' ? true : null }] })
}
const setValue = (a: WithValues, i: number, spec: ActionValue) => patch(a.id, { values: a.values.map((v, j) => (j === i ? spec : v)) })
function setValueProp(a: WithValues, i: number, id: string) {
  const p = propOf(id)
  if (p) setValue(a, i, { prop: id, value: p.type === 'checkbox' ? true : null })
}
const val = (e: Event) => (e.target as HTMLInputElement | HTMLSelectElement).value
</script>

<template>
  <div class="me-db-actions-editor" :data-kind="kind">
    <p v-if="!actions.length" class="me-db-hint">{{ m.noActions }}</p>
    <fieldset v-for="a in actions" :key="a.id" class="me-db-action" :data-action="a.type" :disabled="disabled">
      <div class="me-db-row">
        <select class="me-input me-db-select" :value="a.type" :aria-label="m.actionsLabel" data-action-type @change="setType(a, val($event) as DbActionType)">
          <option v-for="t in types" :key="t" :value="t">{{ m.actionTypes[t] }}</option>
        </select>
        <button type="button" class="me-db-icon-button" :aria-label="m.deleteAction" :title="m.deleteAction" data-action-delete @click="remove(a.id)"><Trash2 /></button>
      </div>
      <template v-if="a.type === 'set_values' || a.type === 'add_row'">
        <div v-for="(v, i) in a.values" :key="v.prop" class="me-db-action-set" data-action-value>
          <div class="me-db-row">
            <select class="me-input me-db-select" :value="v.prop" :aria-label="m.property" @change="setValueProp(a, i, val($event))">
              <option v-for="p in [...(propOf(v.prop) ? [propOf(v.prop)!] : []), ...free(a)]" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
            <button type="button" class="me-db-icon-button" :aria-label="m.remove" :title="m.remove" @click="patch(a.id, { values: a.values.filter((_, j) => j !== i) })"><X /></button>
          </div>
          <ActionValueInput v-if="propOf(v.prop)" :prop="propOf(v.prop)!" :spec="v" @change="s => setValue(a, i, s)" />
        </div>
        <button v-if="free(a).length" type="button" class="me-db-text-button" data-action-add-value @click="addValue(a)"><Plus />{{ m.setProperty }}</button>
        <label v-if="a.type === 'add_row' && kind === 'button'" class="me-db-toggle-row">
          <span>{{ m.openNewRow }}</span>
          <input type="checkbox" class="me-db-switch" :checked="!!a.open" data-action-open @change="patch(a.id, { open: ($event.target as HTMLInputElement).checked || undefined })">
        </label>
      </template>
      <template v-else-if="a.type === 'open_url'">
        <label class="me-db-field">
          <span class="me-menu-label">{{ m.urlFrom }}</span>
          <select class="me-input me-db-select" :value="a.prop ?? ''" data-action-url-from @change="patch(a.id, val($event) ? { prop: val($event), url: undefined } : { prop: undefined, url: '' })">
            <option value="">{{ m.typedUrl }}</option>
            <option v-for="p in urlProps" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>
        <input v-if="!a.prop" class="me-input" :value="a.url ?? ''" placeholder="https://" :aria-label="m.typedUrl" data-action-url @change="patch(a.id, { url: val($event).trim() })">
      </template>
      <label v-else-if="a.type === 'show_confirm'" class="me-db-field">
        <span class="me-menu-label">{{ m.confirmMessage }}</span>
        <input class="me-input" :value="a.message ?? ''" :placeholder="m.confirmDefault" data-action-message @change="patch(a.id, { message: val($event).trim() || undefined })">
      </label>
    </fieldset>
    <select v-if="!disabled" class="me-input me-db-select" value="" :aria-label="m.addAction" data-action-add @change="add(val($event) as DbActionType); ($event.target as HTMLSelectElement).value = ''">
      <option value="" disabled>{{ m.addAction }}</option>
      <option v-for="t in types" :key="t" :value="t">{{ m.actionTypes[t] }}</option>
    </select>
  </div>
</template>
