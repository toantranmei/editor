<script setup lang="ts">
/**
 * Column header menu: rename, edit property, change type (warns when lossy), sort, filter, hide, wrap text, freeze,
 * insert left / right, duplicate, delete. Table-only items (wrap, freeze, insert) show when `column` is given.
 */
import {
  ArrowDown, ArrowUp, BetweenVerticalEnd, Calculator, Check, BetweenVerticalStart, ChevronRight, Copy, EyeOff, Group, ListFilter, Settings2,
  Snowflake, Trash2, TriangleAlert, WrapText,
} from '@lucide/vue'
import { computed, nextTick, onMounted, ref } from 'vue'
import { useDb } from '../context'
import { defaultCondition, groupItems, groupMode, makeGroup, resultType } from '../filters'
import { fmt } from '../messages'
import type { Prop, PropConfig, PropType } from '../types'
import { aggregatesFor } from '../aggregates'
import { clone, CREATABLE_TYPES, groupableTypes, OPTION_TYPES, placeColumn, positionAfter, uuidv7, visibleIds } from '../util'
import { isLossyChange } from '../values'
import DbPopover from './DbPopover.vue'
import OptionsList from './OptionsList.vue'
import PropertyEditor from './PropertyEditor.vue'
import PropIcon from './PropIcon.vue'

const props = defineProps<{
  prop: Prop
  anchor: HTMLElement | null
  /** Table column index (0 = title): enables wrap, freeze and insert left / right. */
  column?: number | null
}>()
const emit = defineEmits<{ close: [] }>()
const db = useDb()
const m = computed(() => db.m.value)
const structure = computed(() => db.canEditStructure.value)
const isTitle = computed(() => props.prop.type === 'title')
/** Buttons hold no value: no filter, sort or calculation. */
const valueless = computed(() => props.prop.type === 'button')
const name = ref(props.prop.name)
const panel = ref<'menu' | 'types' | 'confirmType' | 'confirmDelete' | 'edit' | 'insert' | 'calc'>('menu')
const insertSide = ref<'left' | 'right'>('right')
const isTable = computed(() => props.column !== null && props.column !== undefined)
const config = computed(() => db.view.value?.config ?? {})
const wrapped = computed(() => config.value.wraps?.[props.prop.id] ?? !!config.value.wrap)
const frozenHere = computed(() => isTable.value && (config.value.freeze ?? 1) === props.column! + 1)
const pendingType = ref<PropType | null>(null)
const root = ref<HTMLElement | null>(null)

/** The property as the source has it now (the options submenu saves several times while open). */
const live = computed(() => db.props.value.find(p => p.id === props.prop.id) ?? props.prop)
const hasOptions = computed(() => OPTION_TYPES.has(props.prop.type))
/** "Edit property ›" of a select / status property: its options in a submenu beside this menu (Notion). */
const optionsAnchor = ref<HTMLElement | null>(null)
function editProperty(e: MouseEvent) {
  if (!hasOptions.value) {
    panel.value = 'edit'
    return
  }
  optionsAnchor.value = e.currentTarget as HTMLElement
}
function patchOptions(patch: Partial<PropConfig>) {
  const config: PropConfig = { ...live.value.config, ...patch }
  for (const k of Object.keys(patch)) if (patch[k] === undefined) delete config[k]
  db.source.upsertProp({ ...live.value, config })
}

/** The name field is focused when the menu opens, the caret after the name (Notion), if the user may rename. */
const nameInput = ref<HTMLInputElement | null>(null)
onMounted(() => nextTick(() => {
  const el = nameInput.value
  if (!el || !structure.value) return
  el.focus({ preventScroll: true })
  el.setSelectionRange(el.value.length, el.value.length)
}))

function rename() {
  const n = name.value.trim()
  if (n && n !== props.prop.name && structure.value) db.source.upsertProp({ ...props.prop, name: n })
}
function sort(dir: 'asc' | 'desc') {
  db.updateView(c => ({ ...c, sorts: [{ prop: props.prop.id, dir }, ...(c.sorts ?? []).filter(s => s.prop !== props.prop.id)] }))
  emit('close')
}
const canGroup = computed(() => groupableTypes(db.view.value?.type).includes(props.prop.type))
const groupedHere = computed(() => config.value.group_by?.prop === props.prop.id)
function group() {
  db.updateView(c => ({ ...c, group_by: groupedHere.value ? undefined : { prop: props.prop.id } }))
  emit('close')
}
const aggregate = computed(() => config.value.aggregates?.[props.prop.id] ?? null)
function setAggregate(fn: string | null) {
  db.updateView((c) => {
    const aggregates = { ...c.aggregates }
    if (fn) aggregates[props.prop.id] = fn
    else delete aggregates[props.prop.id]
    return { ...c, aggregates }
  })
  emit('close')
}
/** Notion words sort directions by type: numbers low → high, dates old → new, the rest ascending. */
const sortLabels = computed(() => {
  const t = resultType(props.prop)
  if (t === 'number' || t === 'unique_id') return [m.value.sortLowHigh, m.value.sortHighLow]
  if (t === 'date' || t === 'created_time' || t === 'last_edited_time') return [m.value.sortOldNew, m.value.sortNewOld]
  return [m.value.sortAscending, m.value.sortDescending]
})
function filter() {
  db.updateView((c) => {
    const f = c.filter ?? { and: [] }
    return { ...c, filter: makeGroup(groupMode(f), [...groupItems(f), defaultCondition(props.prop)]) }
  })
  db.ui.openFilter++
  emit('close')
}
function hide() {
  const view = db.view.value
  if (!view) return
  db.updateView({ visible: visibleIds(view, db.props.value).filter(id => id !== props.prop.id && db.props.value.find(p => p.id === id)?.type !== 'title') })
  emit('close')
}
function toggleWrap() {
  const next = !wrapped.value
  db.updateView(c => ({ ...c, wraps: { ...c.wraps, [props.prop.id]: next } }))
  emit('close')
}
function freeze() {
  db.updateView({ freeze: frozenHere.value ? 0 : props.column! + 1 })
  emit('close')
}
function insert(side: 'left' | 'right') {
  insertSide.value = side
  panel.value = 'insert'
}
function duplicate() {
  const all = db.props.value
  const copy: Prop = {
    ...clone(props.prop),
    id: uuidv7(),
    name: fmt(m.value.copyOf, { name: props.prop.name }),
    // There is one title property: its copy is a text property.
    type: props.prop.type === 'title' ? 'text' : props.prop.type,
    position: positionAfter(all[all.length - 1]?.position),
  }
  db.source.upsertProp(copy)
  const view = db.view.value
  if (view) db.updateView({ visible: placeColumn(view, all, copy.id, props.prop.id, 'right') })
  emit('close')
}
function chooseType(t: PropType) {
  if (t === props.prop.type) return emit('close')
  pendingType.value = t
  if (isLossyChange(props.prop.type, t)) panel.value = 'confirmType'
  else applyType()
}
function applyType() {
  const t = pendingType.value
  if (!t) return
  const config = { ...props.prop.config }
  // Option lists carry over between select-like types; new ones start empty.
  if (['select', 'multi_select', 'status'].includes(t) && !config.options) config.options = []
  db.source.upsertProp({ ...props.prop, type: t, config })
  emit('close')
}
function remove() {
  db.source.deleteProp(props.prop.id)
  emit('close')
}
</script>

<template>
  <DbPopover v-if="panel !== 'edit' && panel !== 'insert'" :anchor="anchor" :scope="db.scope.value" :label="prop.name" @close="rename(); emit('close')">
    <div ref="root" class="me-menu me-db-menu" role="menu">
      <template v-if="panel === 'menu'">
        <input ref="nameInput" v-model="name" class="me-input" data-prop-name :readonly="!structure" :aria-label="m.rename" @keydown.enter.prevent="rename(); emit('close')" @blur="rename">
        <template v-if="structure">
          <button type="button" class="me-menu-item" role="menuitem" data-action="edit-property" :aria-expanded="hasOptions ? !!optionsAnchor : undefined" @click="editProperty">
            <Settings2 class="me-db-menu-icon" /><span class="me-menu-title">{{ m.editProperty }}</span><ChevronRight class="me-db-menu-end" />
          </button>
          <button v-if="!isTitle" type="button" class="me-menu-item" role="menuitem" @click="panel = 'types'">
            <PropIcon :type="prop.type" /><span class="me-menu-title">{{ m.changeType }}</span><ChevronRight class="me-db-menu-end" />
          </button>
        </template>
        <div class="me-db-separator" role="separator" />
        <template v-if="!valueless">
          <button type="button" class="me-menu-item" role="menuitem" @click="filter"><ListFilter class="me-db-menu-icon" />{{ m.filterBy }}</button>
          <button type="button" class="me-menu-item" role="menuitem" data-action="sort-asc" @click="sort('asc')"><ArrowUp class="me-db-menu-icon" />{{ sortLabels[0] }}</button>
          <button type="button" class="me-menu-item" role="menuitem" data-action="sort-desc" @click="sort('desc')"><ArrowDown class="me-db-menu-icon" />{{ sortLabels[1] }}</button>
        </template>
        <button v-if="canGroup" type="button" class="me-menu-item" role="menuitem" data-action="group" @click="group"><Group class="me-db-menu-icon" />{{ groupedHere ? m.ungroup : m.groupByThis }}</button>
        <button v-if="isTable && !valueless" type="button" class="me-menu-item" role="menuitem" data-action="calculate" @click="panel = 'calc'">
          <Calculator class="me-db-menu-icon" /><span class="me-menu-title">{{ m.calculate }}</span><span v-if="aggregate" class="me-db-menu-value">{{ m.aggregates[aggregate] ?? aggregate }}</span><ChevronRight class="me-db-menu-end" />
        </button>
        <div class="me-db-separator" role="separator" />
        <button v-if="!isTitle" type="button" class="me-menu-item" role="menuitem" data-action="hide" @click="hide"><EyeOff class="me-db-menu-icon" />{{ m.hide }}</button>
        <template v-if="isTable">
          <button type="button" class="me-menu-item" role="menuitemcheckbox" :aria-checked="wrapped" data-action="wrap" @click="toggleWrap">
            <WrapText class="me-db-menu-icon" /><span class="me-menu-title">{{ m.wrapText }}</span><span class="me-db-menu-end me-db-check-slot"><Check v-if="wrapped" /></span>
          </button>
          <button type="button" class="me-menu-item" role="menuitem" data-action="freeze" @click="freeze">
            <Snowflake class="me-db-menu-icon" />{{ frozenHere ? m.unfreezeColumns : m.freezeColumn }}
          </button>
        </template>
        <template v-if="structure">
          <div class="me-db-separator" role="separator" />
          <template v-if="isTable">
            <button v-if="!isTitle" type="button" class="me-menu-item" role="menuitem" data-action="insert-left" @click="insert('left')"><BetweenVerticalStart class="me-db-menu-icon" />{{ m.insertLeft }}</button>
            <button type="button" class="me-menu-item" role="menuitem" data-action="insert-right" @click="insert('right')"><BetweenVerticalEnd class="me-db-menu-icon" />{{ m.insertRight }}</button>
          </template>
          <button type="button" class="me-menu-item" role="menuitem" data-action="duplicate" @click="duplicate"><Copy class="me-db-menu-icon" />{{ m.duplicateProperty }}</button>
          <button v-if="!isTitle" type="button" class="me-menu-item is-danger" role="menuitem" data-action="delete" @click="panel = 'confirmDelete'"><Trash2 class="me-db-menu-icon" />{{ m.deleteProperty }}</button>
        </template>
      </template>

      <template v-else-if="panel === 'calc'">
        <div class="me-menu-label">{{ m.calculate }}</div>
        <button type="button" class="me-menu-item" role="menuitemradio" :aria-checked="!aggregate" @click="setAggregate(null)">
          <span class="me-menu-title">{{ m.none }}</span><span class="me-db-menu-end me-db-check-slot"><Check v-if="!aggregate" /></span>
        </button>
        <button v-for="fn in aggregatesFor(prop)" :key="fn" type="button" class="me-menu-item" role="menuitemradio" :aria-checked="aggregate === fn" :data-fn="fn" @click="setAggregate(fn)">
          <span class="me-menu-title">{{ m.aggregates[fn] }}</span><span class="me-db-menu-end me-db-check-slot"><Check v-if="aggregate === fn" /></span>
        </button>
      </template>
      <template v-else-if="panel === 'types'">
        <div class="me-menu-label">{{ m.changeType }}</div>
        <button
          v-for="t in CREATABLE_TYPES"
          :key="t"
          type="button"
          class="me-menu-item"
          role="menuitemradio"
          :aria-checked="t === prop.type"
          :data-type="t"
          :class="{ 'is-current': t === prop.type }"
          @click="chooseType(t)"
        >
          <PropIcon :type="t" /><span class="me-menu-title">{{ m.types[t] }}</span>
        </button>
      </template>

      <div v-else-if="panel === 'confirmType'" class="me-db-confirm" role="alertdialog">
        <p class="me-db-warning"><TriangleAlert class="me-db-menu-icon" />{{ fmt(m.lossyWarning, { from: m.types[prop.type] ?? prop.type, to: m.types[pendingType!] ?? pendingType! }) }}</p>
        <div class="me-db-actions">
          <button type="button" class="me-btn" @click="panel = 'types'">{{ m.cancel }}</button>
          <button type="button" class="me-btn me-btn--primary" data-confirm @click="applyType">{{ m.confirm }}</button>
        </div>
      </div>

      <div v-else-if="panel === 'confirmDelete'" class="me-db-confirm" role="alertdialog">
        <p>{{ fmt(m.deletePropertyConfirm, { name: prop.name }) }}</p>
        <div class="me-db-actions">
          <button type="button" class="me-btn" @click="panel = 'menu'">{{ m.cancel }}</button>
          <button type="button" class="me-btn me-db-danger" data-confirm @click="remove">{{ m.deleteProperty }}</button>
        </div>
      </div>
    </div>
  </DbPopover>
  <DbPopover v-if="optionsAnchor && panel === 'menu'" :anchor="optionsAnchor" :scope="db.scope.value" placement="right" :label="m.editProperty" @close="optionsAnchor = null">
    <div class="me-menu me-db-menu" data-options-menu>
      <OptionsList :config="live.config ?? {}" :status="prop.type === 'status'" @change="patchOptions" />
    </div>
  </DbPopover>
  <PropertyEditor v-if="panel === 'insert'" :anchor="anchor" :place="{ next: prop.id, side: insertSide }" @close="emit('close')" />
  <PropertyEditor v-if="panel === 'edit'" :anchor="anchor" :prop="prop" @close="emit('close')" />
</template>
