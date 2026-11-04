<script setup lang="ts">
/**
 * Dashboard view (Notion's Dashboard): a grid of widgets (`config.widgets`), each a chart (`source.chart(viewId,
 * query)` with the widget's chart config) or a number card (a calculation over the rows, `source.aggregate`). Every
 * widget has its own filter, on top of the view's (toolbar) filter. Editors add, remove, reorder (drag or the
 * widget menu), resize (half / full width) and edit widgets in a popover; changes save to the view at once.
 */
import { ChartColumn, ChevronLeft, ChevronRight, GripVertical, Hash, Plus, Settings2, Trash2 } from '@lucide/vue'
import { computed, ref, shallowRef } from 'vue'
import ChartSettings from '../components/ChartSettings.vue'
import DbChart from '../components/DbChart.vue'
import DbPopover from '../components/DbPopover.vue'
import FilterBuilder from '../components/FilterBuilder.vue'
import NumberWidget from '../components/NumberWidget.vue'
import { aggregatesFor } from '../aggregates'
import { useDb } from '../context'
import { countConditions, normalizeFilter } from '../filters'
import type { AggregateFn, ChartQuery, DashboardWidget, FilterGroup } from '../types'
import { uuidv7, viewDefaults } from '../util'

defineProps<{ full?: boolean }>()
const db = useDb()
const m = computed(() => db.m.value)
const view = computed(() => db.view.value)
const widgets = computed<DashboardWidget[]>(() => view.value?.config.widgets ?? [])
const editable = computed(() => db.canEditStructure.value)

function save(list: DashboardWidget[]) {
  db.updateView({ widgets: list })
}
const adding = shallowRef<HTMLElement | null>(null)
const editing = shallowRef<{ id: string, anchor: HTMLElement } | null>(null)
const editingWidget = computed(() => widgets.value.find(w => w.id === editing.value?.id))

function add(kind: DashboardWidget['kind'], anchor: HTMLElement | null) {
  adding.value = null
  if (!editable.value) return
  const id = uuidv7()
  const w: DashboardWidget = kind === 'chart'
    ? { id, kind, ...viewDefaults('chart', db.props.value) }
    : { id, kind, fn: 'count' }
  save([...widgets.value, w])
  if (anchor) editing.value = { id, anchor }
}
/** Merges `patch` into a widget (undefined fields are dropped). */
function patch(id: string, p: Partial<DashboardWidget>) {
  save(widgets.value.map((w) => {
    if (w.id !== id) return w
    const next = { ...w, ...p } as Record<string, unknown>
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k]
    return next as unknown as DashboardWidget
  }))
}
function remove(id: string) {
  editing.value = null
  save(widgets.value.filter(w => w.id !== id))
}
function move(id: string, delta: number) {
  const list = [...widgets.value]
  const i = list.findIndex(w => w.id === id)
  const j = i + delta
  if (i < 0 || j < 0 || j >= list.length) return
  list.splice(j, 0, list.splice(i, 1)[0]!)
  save(list)
}

// Drag a widget by its handle onto another one to put it there.
const dragging = ref<string | null>(null)
const over = ref<string | null>(null)
function drop(target: string) {
  const from = dragging.value
  dragging.value = over.value = null
  if (!from || from === target) return
  const list = widgets.value.filter(w => w.id !== from)
  const at = list.findIndex(w => w.id === target)
  const moved = widgets.value.find(w => w.id === from)!
  // Dropping on a later widget puts it after that one, on an earlier one before it.
  const after = widgets.value.findIndex(w => w.id === from) < widgets.value.findIndex(w => w.id === target)
  list.splice(after ? at + 1 : at, 0, moved)
  save(list)
}

/** The rows a widget counts: the view's filter (with the viewer's draft) and the widget's own. */
function filterOf(w: DashboardWidget): FilterGroup | null {
  const parts = [normalizeFilter(view.value?.config.filter), normalizeFilter(w.filter)].filter((f): f is FilterGroup => !!f)
  if (!parts.length) return null
  return parts.length === 1 ? parts[0]! : { and: parts }
}
function chartQuery(w: DashboardWidget): ChartQuery {
  const { chart, x, y, series, stacked } = w
  const search = db.search.value.trim()
  return { widget: w.id, chart, x, y, series, stacked, filter: filterOf(w), ...(search ? { search } : {}) }
}
const titleOf = (w: DashboardWidget) => w.title || m.value.widgetKinds[w.kind]

// Number widget settings: calculations offered for the chosen property (count needs none).
const numberProp = computed(() => db.props.value.find(p => p.id === editingWidget.value?.prop))
const numberFns = computed<AggregateFn[]>(() => (numberProp.value ? aggregatesFor(numberProp.value) : ['count']))
function setNumberProp(id: string) {
  const w = editingWidget.value
  if (!w) return
  const p = db.props.value.find(x => x.id === id)
  const fns = p ? aggregatesFor(p) : ['count']
  patch(w.id, { prop: id || undefined, fn: fns.includes(w.fn ?? 'count') ? w.fn : 'count' })
}
const value = (e: Event) => (e.target as HTMLSelectElement | HTMLInputElement).value
</script>

<template>
  <div class="me-db-dashboard-wrap" :class="{ 'is-full': full }">
    <div v-if="!widgets.length" class="me-db-empty">{{ m.dashboardEmpty }}</div>
    <div class="me-db-dashboard" data-dashboard>
      <section
        v-for="(w, i) in widgets"
        :key="w.id"
        class="me-db-widget"
        :class="{ 'is-over': over === w.id && dragging !== w.id, 'is-dragging': dragging === w.id }"
        :data-widget-id="w.id"
        :data-kind="w.kind"
        :data-span="w.span ?? 1"
        :aria-label="titleOf(w)"
        @dragover.prevent="dragging && (over = w.id)"
        @dragleave="over === w.id && (over = null)"
        @drop.prevent="drop(w.id)"
      >
        <header class="me-db-widget-head">
          <span
            v-if="editable"
            class="me-db-row-handle me-db-widget-handle"
            draggable="true"
            :title="m.dragWidget"
            :aria-label="m.dragWidget"
            @dragstart="dragging = w.id; $event.dataTransfer?.setData('text/plain', w.id)"
            @dragend="dragging = over = null"
          ><GripVertical /></span>
          <span class="me-db-widget-title">{{ titleOf(w) }}</span>
          <span v-if="countConditions(w.filter)" class="me-db-badge" :title="m.filter">{{ countConditions(w.filter) }}</span>
          <span v-if="editable" class="me-db-widget-actions">
            <button type="button" class="me-db-icon-button" :aria-label="m.moveEarlier" :title="m.moveEarlier" :disabled="i === 0" data-widget-earlier @click="move(w.id, -1)"><ChevronLeft /></button>
            <button type="button" class="me-db-icon-button" :aria-label="m.moveLater" :title="m.moveLater" :disabled="i === widgets.length - 1" data-widget-later @click="move(w.id, 1)"><ChevronRight /></button>
            <button type="button" class="me-db-icon-button" :aria-label="m.editWidget" :title="m.editWidget" data-widget-edit @click="editing = { id: w.id, anchor: $event.currentTarget as HTMLElement }"><Settings2 /></button>
          </span>
        </header>
        <DbChart v-if="w.kind === 'chart' && view" :view-id="view.id" :spec="w" :query="chartQuery(w)" />
        <NumberWidget v-else-if="view" :view-id="view.id" :widget="w" :filter="filterOf(w)" />
      </section>
    </div>
    <button v-if="editable" type="button" class="me-db-new-row is-static me-db-widget-add" data-add-widget @click="adding = $event.currentTarget as HTMLElement"><Plus />{{ m.addWidget }}</button>

    <DbPopover v-if="adding" :anchor="adding" :scope="db.scope.value" :label="m.addWidget" @close="adding = null">
      <div class="me-menu me-db-menu" role="menu">
        <div class="me-menu-label">{{ m.addWidget }}</div>
        <button type="button" class="me-menu-item" role="menuitem" data-widget-kind="chart" @click="add('chart', adding)"><ChartColumn class="me-db-menu-icon" />{{ m.widgetKinds.chart }}</button>
        <button type="button" class="me-menu-item" role="menuitem" data-widget-kind="number" @click="add('number', adding)"><Hash class="me-db-menu-icon" />{{ m.widgetKinds.number }}</button>
      </div>
    </DbPopover>

    <DbPopover v-if="editing && editingWidget" :anchor="editing.anchor" :scope="db.scope.value" :label="m.editWidget" @close="editing = null">
      <div class="me-db-menu me-db-settings me-db-widget-settings" data-widget-settings>
        <label class="me-db-field">
          <span class="me-menu-label">{{ m.widgetTitle }}</span>
          <input class="me-input" data-setting="title" :value="editingWidget.title ?? ''" :placeholder="m.widgetKinds[editingWidget.kind]" @change="patch(editingWidget.id, { title: value($event).trim() || undefined })">
        </label>
        <ChartSettings v-if="editingWidget.kind === 'chart'" :spec="editingWidget" :editable="editable" @patch="p => patch(editingWidget!.id, p)" />
        <template v-else>
          <label class="me-db-field">
            <span class="me-menu-label">{{ m.property }}</span>
            <select class="me-input me-db-select" data-setting="prop" :value="editingWidget.prop ?? ''" @change="setNumberProp(value($event))">
              <option value="">–</option>
              <option v-for="p in db.props.value" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </label>
          <label class="me-db-field">
            <span class="me-menu-label">{{ m.calculate }}</span>
            <select class="me-input me-db-select" data-setting="fn" :value="editingWidget.fn ?? 'count'" @change="patch(editingWidget.id, { fn: value($event) as AggregateFn })">
              <option v-for="f in numberFns" :key="f" :value="f">{{ m.aggregates[f] ?? f }}</option>
            </select>
          </label>
        </template>
        <label class="me-db-field">
          <span class="me-menu-label">{{ m.widgetWidth }}</span>
          <select class="me-input me-db-select" data-setting="span" :value="String(editingWidget.span ?? 1)" @change="patch(editingWidget.id, { span: value($event) === '2' ? 2 : undefined })">
            <option value="1">{{ m.widthHalf }}</option>
            <option value="2">{{ m.widthFull }}</option>
          </select>
        </label>
        <div class="me-menu-label">{{ m.filter }}</div>
        <p class="me-db-hint">{{ m.widgetFilterHint }}</p>
        <FilterBuilder standalone :value="editingWidget.filter" @change="f => patch(editingWidget!.id, { filter: normalizeFilter(f) })" />
        <div class="me-db-separator" role="separator" />
        <button type="button" class="me-menu-item is-danger" data-widget-remove @click="remove(editingWidget.id)"><Trash2 class="me-db-menu-icon" />{{ m.removeWidget }}</button>
      </div>
    </DbPopover>
  </div>
</template>
