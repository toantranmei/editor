<script setup lang="ts">
/** Column header menu: rename, edit property, change type (warns when lossy), hide, sort, filter, delete. */
import { ArrowDown, ArrowUp, ChevronRight, EyeOff, ListFilter, Settings2, Trash2, TriangleAlert } from '@lucide/vue'
import { computed, ref } from 'vue'
import { useDb } from '../context'
import { defaultCondition, groupItems, groupMode, makeGroup } from '../filters'
import { fmt } from '../messages'
import type { Prop, PropType } from '../types'
import { CREATABLE_TYPES, visibleIds } from '../util'
import { isLossyChange } from '../values'
import DbPopover from './DbPopover.vue'
import PropertyEditor from './PropertyEditor.vue'
import PropIcon from './PropIcon.vue'

const props = defineProps<{ prop: Prop, anchor: HTMLElement | null }>()
const emit = defineEmits<{ close: [] }>()
const db = useDb()
const m = computed(() => db.m.value)
const structure = computed(() => db.canEditStructure.value)
const isTitle = computed(() => props.prop.type === 'title')
const name = ref(props.prop.name)
const panel = ref<'menu' | 'types' | 'confirmType' | 'confirmDelete' | 'edit'>('menu')
const pendingType = ref<PropType | null>(null)
const root = ref<HTMLElement | null>(null)

function rename() {
  const n = name.value.trim()
  if (n && n !== props.prop.name && structure.value) db.source.upsertProp({ ...props.prop, name: n })
}
function sort(dir: 'asc' | 'desc') {
  db.updateView(c => ({ ...c, sorts: [{ prop: props.prop.id, dir }, ...(c.sorts ?? []).filter(s => s.prop !== props.prop.id)] }))
  emit('close')
}
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
  <DbPopover v-if="panel !== 'edit'" :anchor="anchor" :scope="db.scope.value" :label="prop.name" @close="rename(); emit('close')">
    <div ref="root" class="me-menu me-db-menu" role="menu">
      <template v-if="panel === 'menu'">
        <input v-model="name" class="me-input" :readonly="!structure" :aria-label="m.rename" @keydown.enter.prevent="rename(); emit('close')" @blur="rename">
        <template v-if="structure">
          <button type="button" class="me-menu-item" role="menuitem" @click="panel = 'edit'"><Settings2 class="me-db-menu-icon" />{{ m.editOptions }}</button>
          <button v-if="!isTitle" type="button" class="me-menu-item" role="menuitem" @click="panel = 'types'">
            <PropIcon :type="prop.type" /><span class="me-menu-title">{{ m.changeType }}</span><ChevronRight class="me-db-menu-end" />
          </button>
        </template>
        <button type="button" class="me-menu-item" role="menuitem" @click="sort('asc')"><ArrowUp class="me-db-menu-icon" />{{ m.sortAscending }}</button>
        <button type="button" class="me-menu-item" role="menuitem" @click="sort('desc')"><ArrowDown class="me-db-menu-icon" />{{ m.sortDescending }}</button>
        <button v-if="prop.type !== 'files'" type="button" class="me-menu-item" role="menuitem" @click="filter"><ListFilter class="me-db-menu-icon" />{{ m.filterBy }}</button>
        <button v-if="!isTitle" type="button" class="me-menu-item" role="menuitem" @click="hide"><EyeOff class="me-db-menu-icon" />{{ m.hide }}</button>
        <button v-if="structure && !isTitle" type="button" class="me-menu-item is-danger" role="menuitem" @click="panel = 'confirmDelete'"><Trash2 class="me-db-menu-icon" />{{ m.deleteProperty }}</button>
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
  <PropertyEditor v-else :anchor="anchor" :prop="prop" @close="emit('close')" />
</template>
