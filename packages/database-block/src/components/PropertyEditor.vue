<script setup lang="ts">
/**
 * Creates a property ("+" in the table header, "Add property") or edits one's settings: name, type, number format,
 * options, date format, formula (checked with the optional `validateFormula`), relation / rollup, ID prefix.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useDb } from '../context'
import type { DateDisplay, FormulaCheck, NumberFormat, Prop, PropConfig, PropType, RollupFn, SelectOption } from '../types'
import { clone, CREATABLE_TYPES, OPTION_TYPES, placeColumn, positionAfter, uuidv7 } from '../util'
import DbPopover from './DbPopover.vue'
import NumberShowAs from './NumberShowAs.vue'
import OptionsList from './OptionsList.vue'
import PropIcon from './PropIcon.vue'

const props = defineProps<{
  anchor: HTMLElement | DOMRect | null
  prop?: Prop
  initialType?: PropType
  /** New property: put it next to this column of the current view ("Insert left / right"). */
  place?: { next: string, side: 'left' | 'right' } | null
}>()
const emit = defineEmits<{ close: [], saved: [prop: Prop] }>()

const db = useDb()
const m = computed(() => db.m.value)
const editing = computed(() => !!props.prop)
const type = ref<PropType>(props.prop?.type ?? props.initialType ?? 'text')
const name = ref(props.prop?.name ?? '')
const config = ref<PropConfig>(clone(props.prop?.config) ?? {})

const NUMBER_FORMATS: NumberFormat[] = ['number', 'percent', 'currency']
const DATE_FORMATS: DateDisplay[] = ['full', 'short', 'dmy', 'mdy', 'ymd', 'relative']
/** Currencies Intl formats (Notion's list, most used first). */
const CURRENCIES = ['VND', 'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'KRW', 'SGD', 'THB', 'HKD', 'TWD', 'AUD', 'CAD', 'NZD', 'CHF', 'INR', 'IDR', 'MYR', 'PHP', 'BRL', 'MXN', 'RUB', 'TRY', 'ZAR', 'SEK', 'NOK', 'DKK', 'PLN', 'AED', 'SAR']
const SHOW_AS = ['number', 'bar', 'ring'] as const
const ROLLUP_FNS: RollupFn[] = ['count', 'count_values', 'sum', 'avg', 'min', 'max', 'median', 'percent_checked', 'show_original', 'earliest', 'latest', 'range']

function defaultsFor(t: PropType): PropConfig {
  switch (t) {
    case 'number': return { format: 'number' }
    case 'select': case 'multi_select': return { options: [] }
    case 'status': {
      const options: SelectOption[] = [
        { id: uuidv7(), name: 'Not started', color: 'gray' },
        { id: uuidv7(), name: 'In progress', color: 'blue' },
        { id: uuidv7(), name: 'Done', color: 'green' },
      ]
      return { options, groups: [
        { id: uuidv7(), name: 'To-do', option_ids: [options[0]!.id] },
        { id: uuidv7(), name: 'In progress', option_ids: [options[1]!.id] },
        { id: uuidv7(), name: 'Complete', option_ids: [options[2]!.id] },
      ] }
    }
    case 'date': return { time: false }
    case 'relation': return { database_id: db.databaseId }
    case 'rollup': return { fn: 'count' }
    case 'formula': return { expression: '' }
    default: return {}
  }
}
watch(type, (t) => {
  if (!editing.value) config.value = defaultsFor(t)
})
if (!editing.value) config.value = defaultsFor(type.value)

// ── Formula check ──
const check = ref<FormulaCheck | null>(null)
const checking = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
let seq = 0
watch(() => config.value.expression, (expr) => {
  if (type.value !== 'formula' || !db.source.validateFormula) return
  clearTimeout(timer)
  checking.value = true
  timer = setTimeout(async () => {
    const mine = ++seq
    try {
      const res = await db.source.validateFormula!(expr ?? '')
      if (mine === seq) check.value = res
    }
    catch (error) {
      if (mine === seq) check.value = { ok: false, error: String(error) }
    }
    finally {
      if (mine === seq) checking.value = false
    }
  }, 250)
}, { immediate: true })
onBeforeUnmount(() => clearTimeout(timer))

const relationProps = computed(() => db.props.value.filter(p => p.type === 'relation'))
const rollupRelation = computed(() => db.props.value.find(p => p.id === config.value.relation_prop_id))
const rollupTargetsHere = computed(() => !rollupRelation.value || !rollupRelation.value.config?.database_id || rollupRelation.value.config.database_id === db.databaseId)
const valid = computed(() => {
  if (!name.value.trim()) return false
  if (type.value === 'formula' && check.value && !check.value.ok) return false
  if (type.value === 'rollup' && !config.value.relation_prop_id) return false
  return true
})

// An existing property saves as it is edited (like Notion); a new one is created with Save.
let saveTimer: ReturnType<typeof setTimeout> | undefined
watch([name, config], () => {
  if (!editing.value) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => save(false), 300)
}, { deep: true })
function close() {
  if (editing.value && saveTimer) {
    clearTimeout(saveTimer)
    save(false)
  }
  emit('close')
}
onBeforeUnmount(() => clearTimeout(saveTimer))
function patchConfig(patch: Partial<PropConfig>) {
  const next: PropConfig = { ...config.value, ...patch }
  for (const k of Object.keys(patch)) if (patch[k] === undefined) delete next[k]
  config.value = next
}

function save(andClose = true) {
  saveTimer = undefined
  if (!valid.value) return
  const c: PropConfig = { ...config.value }
  if (type.value === 'formula' && check.value?.ok && check.value.type) c.result_type = check.value.type
  const all = db.props.value
  const prop: Prop = props.prop
    ? { ...props.prop, name: name.value.trim(), type: type.value, config: c }
    : { id: uuidv7(), name: name.value.trim(), type: type.value, position: positionAfter(all[all.length - 1]?.position), config: c }
  if (!Object.keys(c).length) delete prop.config
  db.source.upsertProp(prop)
  // A new property shows up in the current view (next to a column when inserted from its menu).
  const view = db.view.value
  if (!props.prop && view && props.place) db.updateView({ visible: placeColumn(view, db.props.value, prop.id, props.place.next, props.place.side) })
  else if (!props.prop && view?.config.visible) db.updateView({ visible: [...view.config.visible, prop.id] })
  if (!andClose) return
  emit('saved', prop)
  emit('close')
}
</script>

<template>
  <DbPopover :anchor="anchor" :scope="db.scope.value" :label="editing ? prop!.name : m.addProperty" @close="close">
    <form class="me-db-menu me-db-prop-editor" @submit.prevent="save()">
      <label class="me-db-field">
        <span class="me-menu-label">{{ m.propertyName }}</span>
        <input v-model="name" class="me-input" :aria-label="m.propertyName" autofocus>
      </label>
      <div v-if="!editing" class="me-db-field">
        <span class="me-menu-label">{{ m.propertyType }}</span>
        <div class="me-db-type-grid" role="radiogroup" :aria-label="m.propertyType">
          <button
            v-for="t in CREATABLE_TYPES"
            :key="t"
            type="button"
            role="radio"
            class="me-menu-item"
            :class="{ 'is-active': type === t }"
            :aria-checked="type === t"
            :data-type="t"
            @click="type = t; if (!name.trim()) name = m.types[t] ?? t"
          >
            <PropIcon :type="t" /><span class="me-menu-title">{{ m.types[t] }}</span>
          </button>
        </div>
      </div>

      <template v-if="type === 'number'">
        <label class="me-db-field">
          <span class="me-menu-label">{{ m.numberFormat }}</span>
          <select v-model="config.format" class="me-input me-db-select">
            <option v-for="f in NUMBER_FORMATS" :key="f" :value="f">{{ m.numberFormats[f] }}</option>
          </select>
        </label>
        <label v-if="config.format === 'currency'" class="me-db-field">
          <span class="me-menu-label">{{ m.currency }}</span>
          <select :value="config.currency ?? 'VND'" class="me-input me-db-select" data-setting="currency" @change="patchConfig({ currency: ($event.target as HTMLSelectElement).value })">
            <option v-for="c in CURRENCIES" :key="c" :value="c">{{ c }}</option>
          </select>
        </label>
        <label class="me-db-field">
          <span class="me-menu-label">{{ m.decimals }}</span>
          <input :value="config.decimals ?? ''" type="number" min="0" max="10" class="me-input" @input="config.decimals = ($event.target as HTMLInputElement).value === '' ? undefined : Number(($event.target as HTMLInputElement).value)">
        </label>
        <NumberShowAs :config="config" @change="patchConfig" />
      </template>

      <div v-else-if="OPTION_TYPES.has(type)" class="me-db-field">
        <span class="me-menu-label">{{ m.editOptions }}</span>
        <OptionsList :config="config" :status="type === 'status'" @change="patchConfig" />
      </div>

      <template v-else-if="type === 'date'">
        <label class="me-db-field">
          <span class="me-menu-label">{{ m.dateFormat }}</span>
          <select v-model="config.format" class="me-input me-db-select">
            <option :value="undefined">–</option>
            <option v-for="f in DATE_FORMATS" :key="f" :value="f">{{ m.dateFormats[f] }}</option>
          </select>
        </label>
        <label class="me-db-toggle-row">
          <span>{{ m.includeTime }}</span>
          <input v-model="config.time" type="checkbox" class="me-db-switch">
        </label>
        <label class="me-db-field">
          <span class="me-menu-label">{{ m.timeFormat }}</span>
          <select :value="config.hour12 ? '12' : '24'" class="me-input me-db-select" data-setting="hour12" @change="patchConfig({ hour12: ($event.target as HTMLSelectElement).value === '12' || undefined })">
            <option value="24">{{ m.hour24 }}</option>
            <option value="12">{{ m.hour12 }}</option>
          </select>
        </label>
      </template>

      <label v-else-if="type === 'url'" class="me-db-toggle-row">
        <span>{{ m.showFullUrl }}</span>
        <input type="checkbox" class="me-db-switch" data-setting="full_url" :checked="config.full_url !== false" @change="patchConfig({ full_url: ($event.target as HTMLInputElement).checked ? undefined : false })">
      </label>

      <div v-else-if="type === 'formula'" class="me-db-field">
        <span class="me-menu-label">{{ m.formula }}</span>
        <textarea v-model="config.expression" class="me-input me-db-formula" spellcheck="false" :placeholder="m.formulaPlaceholder" :aria-label="m.formula" :aria-invalid="check?.ok === false || undefined" />
        <span v-if="checking" class="me-db-hint">{{ m.formulaChecking }}</span>
        <span v-else-if="check && !check.ok" class="me-db-error" role="alert">{{ check.error }}<template v-if="check.position !== undefined"> (@{{ check.position }})</template></span>
        <span v-else-if="check?.ok" class="me-db-hint">{{ m.formulaOk }}</span>
      </div>

      <template v-else-if="type === 'relation'">
        <label class="me-db-field">
          <span class="me-menu-label">{{ m.relationDatabase }}</span>
          <input v-model="config.database_id" class="me-input" :placeholder="m.thisDatabase" :aria-label="m.relationDatabase">
        </label>
        <label class="me-db-toggle-row">
          <span>{{ m.twoWay }}</span>
          <input type="checkbox" class="me-db-switch" :checked="!!config.two_way_prop_id" @change="config.two_way_prop_id = ($event.target as HTMLInputElement).checked ? uuidv7() : undefined">
        </label>
      </template>

      <template v-else-if="type === 'rollup'">
        <label class="me-db-field">
          <span class="me-menu-label">{{ m.rollupRelation }}</span>
          <select v-model="config.relation_prop_id" class="me-input me-db-select">
            <option v-for="p in relationProps" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>
        <label class="me-db-field">
          <span class="me-menu-label">{{ m.rollupTarget }}</span>
          <select v-if="rollupTargetsHere" v-model="config.target_prop_id" class="me-input me-db-select">
            <option v-for="p in db.props.value" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <input v-else v-model="config.target_prop_id" class="me-input">
        </label>
        <label class="me-db-field">
          <span class="me-menu-label">{{ m.rollupFn }}</span>
          <select v-model="config.fn" class="me-input me-db-select">
            <option v-for="f in ROLLUP_FNS" :key="f" :value="f">{{ m.rollupFns[f] }}</option>
          </select>
        </label>
      </template>

      <label v-else-if="type === 'unique_id'" class="me-db-field">
        <span class="me-menu-label">{{ m.prefix }}</span>
        <input v-model="config.prefix" class="me-input" placeholder="TASK">
      </label>

      <div v-if="!editing" class="me-db-actions">
        <button type="button" class="me-btn" @click="emit('close')">{{ m.cancel }}</button>
        <button type="submit" class="me-btn me-btn--primary" :disabled="!valid">{{ m.save }}</button>
      </div>
      <div v-else class="me-db-actions">
        <button type="button" class="me-btn me-btn--primary" data-done @click="close">{{ m.done }}</button>
      </div>
    </form>
  </DbPopover>
</template>
