<script setup lang="ts">
/** View tabs: switch, add (type picker), rename, duplicate, delete. */
import { Copy, Pencil, Plus, Trash2 } from '@lucide/vue'
import { computed, nextTick, ref, shallowRef } from 'vue'
import { useDb } from '../context'
import { fmt } from '../messages'
import type { View, ViewConfig, ViewType } from '../types'
import { byPosition, clone, positionAfter, uuidv7 } from '../util'
import DbPopover from './DbPopover.vue'
import PropIcon from './PropIcon.vue'

const emit = defineEmits<{ select: [viewId: string] }>()
const db = useDb()
const m = computed(() => db.m.value)
const views = computed(() => [...db.source.views.value].sort(byPosition))
const TYPES: ViewType[] = ['table', 'board', 'calendar', 'timeline', 'gallery', 'list', 'chart', 'pivot']
const adding = shallowRef<HTMLElement | null>(null)
const menu = shallowRef<{ view: View, anchor: HTMLElement } | null>(null)
const renaming = ref<string | null>(null)
const draft = ref('')

/** Sensible starting config per type, from the database's properties. */
function defaults(type: ViewType): ViewConfig {
  const props = db.props.value
  const first = (...types: string[]) => props.find(p => types.includes(p.type))?.id
  switch (type) {
    case 'board': {
      const g = first('status', 'select', 'person')
      return g ? { group_by: { prop: g }, card: { props: [] } } : { card: { props: [] } }
    }
    case 'calendar': return { date_prop: first('date', 'created_time') }
    case 'timeline': return { start_prop: first('date', 'created_time'), scale: 'day' }
    case 'gallery': return { cover: first('files'), size: 'm', card: { props: [] } }
    case 'list': return { card: { props: [] } }
    case 'chart': return { chart: 'bar', x: { prop: first('status', 'select', 'date') ?? props[0]?.id ?? '' }, y: [{ fn: 'count' }] }
    case 'pivot': return { rows: [first('status', 'select') ?? ''].filter(Boolean), cols: [], values: [{ fn: 'count' }], totals: true }
    default: return {}
  }
}

function add(type: ViewType) {
  adding.value = null
  const view: View = { id: uuidv7(), name: m.value.viewTypes[type], type, position: positionAfter(views.value[views.value.length - 1]?.position), config: defaults(type) }
  db.source.upsertView(view)
  emit('select', view.id)
}
function duplicate(v: View) {
  menu.value = null
  const copy: View = { ...clone(v), id: uuidv7(), name: fmt(m.value.copyOf, { name: v.name }), position: positionAfter(views.value[views.value.length - 1]?.position) }
  db.source.upsertView(copy)
  emit('select', copy.id)
}
function remove(v: View) {
  menu.value = null
  if (views.value.length < 2) return
  const rest = views.value.filter(x => x.id !== v.id)
  db.source.deleteView(v.id)
  if (db.view.value?.id === v.id) emit('select', rest[0]!.id)
}
async function startRename(v: View) {
  menu.value = null
  renaming.value = v.id
  draft.value = v.name
  await nextTick()
  document.querySelector<HTMLInputElement>(`[data-rename-view="${v.id}"]`)?.focus()
}
function commitRename(v: View) {
  const name = draft.value.trim()
  renaming.value = null
  if (name && name !== v.name) db.source.upsertView({ ...v, name })
}
function onTabClick(v: View, e: MouseEvent) {
  if (db.view.value?.id === v.id && db.canEditStructure.value) menu.value = { view: v, anchor: e.currentTarget as HTMLElement }
  else emit('select', v.id)
}
</script>

<template>
  <div class="me-db-tabs" role="tablist">
    <template v-for="v in views" :key="v.id">
      <input
        v-if="renaming === v.id"
        v-model="draft"
        class="me-input me-db-tab-input"
        :data-rename-view="v.id"
        :aria-label="m.renameView"
        @keydown.enter.prevent="commitRename(v)"
        @keydown.esc="renaming = null"
        @blur="commitRename(v)"
      >
      <button
        v-else
        type="button"
        role="tab"
        class="me-db-tab"
        :class="{ 'is-active': db.view.value?.id === v.id }"
        :aria-selected="db.view.value?.id === v.id"
        :data-view-id="v.id"
        @click="onTabClick(v, $event)"
        @dblclick="db.canEditStructure.value && startRename(v)"
      >
        <PropIcon :view="v.type" /><span class="me-db-tab-name">{{ v.name }}</span>
      </button>
    </template>
    <button v-if="db.canEditStructure.value" type="button" class="me-db-tab is-add" :aria-label="m.addView" data-add-view @click="adding = $event.currentTarget as HTMLElement">
      <Plus />
    </button>

    <DbPopover v-if="adding" :anchor="adding" :scope="db.scope.value" :label="m.addView" @close="adding = null">
      <div class="me-menu me-db-menu" role="menu">
        <div class="me-menu-label">{{ m.addView }}</div>
        <button v-for="t in TYPES" :key="t" type="button" class="me-menu-item" role="menuitem" :data-view-type="t" @click="add(t)">
          <PropIcon :view="t" /><span class="me-menu-title">{{ m.viewTypes[t] }}</span>
        </button>
      </div>
    </DbPopover>
    <DbPopover v-if="menu" :anchor="menu.anchor" :scope="db.scope.value" :label="menu.view.name" @close="menu = null">
      <div class="me-menu me-db-menu" role="menu">
        <button type="button" class="me-menu-item" role="menuitem" @click="startRename(menu.view)"><Pencil class="me-db-menu-icon" />{{ m.renameView }}</button>
        <button type="button" class="me-menu-item" role="menuitem" data-duplicate-view @click="duplicate(menu.view)"><Copy class="me-db-menu-icon" />{{ m.duplicateView }}</button>
        <button v-if="views.length > 1" type="button" class="me-menu-item is-danger" role="menuitem" data-delete-view @click="remove(menu.view)"><Trash2 class="me-db-menu-icon" />{{ m.deleteView }}</button>
      </div>
    </DbPopover>
  </div>
</template>
