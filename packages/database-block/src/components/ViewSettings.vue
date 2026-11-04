<script setup lang="ts">
/**
 * Toolbar panels that edit the current view's config: grouping, property visibility and "View options" (layout
 * switcher, per-layout settings such as wrap / freeze, card cover and size, dates, chart and pivot setup, and
 * "Open pages in", conditional colors, automations).
 */
import { Check, Eye, EyeOff, GripVertical, Lock, LockOpen, Zap } from '@lucide/vue'
import { computed, ref } from 'vue'
import { SUB_ITEM_VIEWS, useDb } from '../context'
import type { ChartKind, OpenMode, Prop, ValueFn, ViewConfig, ViewType } from '../types'
import { groupableTypes, positionAfter, switchLayout, uuidv7, visibleIds } from '../util'
import AutomationsPanel from './AutomationsPanel.vue'
import ColorRules from './ColorRules.vue'
import OpenModeIcon from './OpenModeIcon.vue'
import PropIcon from './PropIcon.vue'

const props = defineProps<{ panel: 'group' | 'properties' | 'settings' }>()
const db = useDb()
const m = computed(() => db.m.value)
const view = computed(() => db.view.value)
const c = computed<ViewConfig>(() => view.value?.config ?? {})
const editable = computed(() => db.canEditStructure.value)
const all = computed(() => db.props.value)
const ofTypes = (...types: string[]) => all.value.filter(p => types.includes(p.type))
const groupable = computed(() => ofTypes(...groupableTypes(view.value?.type)))
const dateProps = computed(() => ofTypes('date', 'created_time', 'last_edited_time'))
const fileProps = computed(() => ofTypes('files'))
const numberProps = computed(() => all.value.filter(p => p.type === 'number' || (p.type === 'formula' && p.config?.result_type === 'number') || p.type === 'rollup'))
const CHARTS: ChartKind[] = ['bar', 'line', 'area', 'pie', 'donut', 'scatter']
const FNS: ValueFn[] = ['count', 'sum', 'avg', 'min', 'max']
const set = (patch: Partial<ViewConfig>) => db.updateView(patch)

// Visibility: table columns (`visible`), card properties elsewhere (`card.props`).
const usesCards = computed(() => ['board', 'gallery', 'list', 'calendar', 'timeline'].includes(view.value?.type ?? ''))
const shown = computed(() => {
  if (!view.value) return []
  return usesCards.value ? c.value.card?.props ?? [] : visibleIds(view.value, all.value)
})
const nonTitle = computed(() => all.value.filter(p => p.type !== 'title'))
function setShown(ids: string[]) {
  if (usesCards.value) set({ card: { ...c.value.card, props: ids } })
  else set({ visible: ids.filter(id => all.value.find(p => p.id === id)?.type !== 'title') })
}
const propQuery = ref('')
const matches = (p: Prop) => !propQuery.value.trim() || p.name.toLowerCase().includes(propQuery.value.trim().toLowerCase())
const byId = computed(() => new Map(all.value.map(p => [p.id, p])))
const shownProps = computed(() => shown.value.map(id => byId.value.get(id)).filter((p): p is Prop => !!p && p.type !== 'title' && matches(p)))
const hiddenProps = computed(() => nonTitle.value.filter(p => !shown.value.includes(p.id) && matches(p)))
const dragProp = ref<string | null>(null)
const overProp = ref<string | null>(null)
function dropProp(target: string) {
  const from = dragProp.value
  dragProp.value = overProp.value = null
  if (!from || from === target) return
  const ids = shown.value.filter(id => id !== from)
  ids.splice(ids.indexOf(target), 0, from)
  setShown(ids)
}
const toggle = (p: Prop) => setShown(shown.value.includes(p.id) ? shown.value.filter(id => id !== p.id) : [...shown.value, p.id])

/** Groups that can be listed up front (option-based properties and checkbox): '' = no value. */
const groupKeys = computed(() => {
  const gp = all.value.find(p => p.id === c.value.group_by?.prop)
  if (!gp) return []
  const none = { key: '', label: m.value.noValue.replace('{name}', gp.name), color: undefined as string | undefined }
  let keys: Array<{ key: string, label: string, color?: string }> = []
  if (gp.type === 'select' || gp.type === 'status' || gp.type === 'multi_select') keys = (gp.config?.options ?? []).map(o => ({ key: o.id, label: o.name, color: o.color }))
  else if (gp.type === 'checkbox') keys = [{ key: 'true', label: m.value.checked }, { key: 'false', label: m.value.unchecked }]
  else return []
  if (gp.type !== 'checkbox') keys.push(none)
  const order = c.value.group_by?.order
  if (order?.length) keys.sort((a, b) => (order.indexOf(a.key) + 1 || 1e9) - (order.indexOf(b.key) + 1 || 1e9))
  return keys
})
const isHiddenGroup = (k: string) => !!c.value.group_by?.hidden?.includes(k)
function toggleGroup(k: string) {
  const g = c.value.group_by
  if (!g) return
  const hidden = isHiddenGroup(k) ? (g.hidden ?? []).filter(x => x !== k) : [...(g.hidden ?? []), k]
  set({ group_by: { ...g, hidden: hidden.length ? hidden : undefined } })
}
const dragGroup = ref<string | null>(null)
const overGroup = ref<string | null>(null)
function dropGroup(target: string) {
  const from = dragGroup.value
  dragGroup.value = overGroup.value = null
  const g = c.value.group_by
  if (from === null || !g || from === target) return
  const keys = groupKeys.value.map(x => x.key).filter(k => k !== from)
  keys.splice(keys.indexOf(target), 0, from)
  set({ group_by: { ...g, order: keys } })
}
/** Relations of this database to itself: what sub-items can use as "Parent item". */
const selfRelations = computed(() => all.value.filter(p => p.type === 'relation' && (!p.config?.database_id || p.config.database_id === db.databaseId)))
/** Creates a "Parent item" relation (this database, 1 page) and uses it for sub-items. */
function turnOnSubItems() {
  const id = uuidv7()
  db.source.upsertProp({ id, name: m.value.parentItem, type: 'relation', position: positionAfter(all.value[all.value.length - 1]?.position), config: { database_id: db.databaseId, limit: 1 } })
  set({ sub_items: id })
}
function setGroup(id: string) {
  set({ group_by: id ? { ...c.value.group_by, prop: id } : undefined })
}
function setY(patch: { prop?: string, fn?: ValueFn }) {
  const y = c.value.y?.[0] ?? { fn: 'count' as ValueFn }
  const next = { ...y, ...patch }
  if (next.fn === 'count') delete next.prop
  else if (!next.prop) next.prop = numberProps.value[0]?.id
  set({ y: [next] })
}
const xProp = computed(() => all.value.find(p => p.id === c.value.x?.prop))
const isDateX = computed(() => !!xProp.value && ['date', 'created_time', 'last_edited_time'].includes(xProp.value.type))
const pivotValue = computed(() => c.value.values?.[0] ?? { fn: 'count' })

// ── Layout ──
const LAYOUTS: ViewType[] = ['table', 'board', 'calendar', 'timeline', 'gallery', 'list', 'chart', 'pivot']
const MODES: OpenMode[] = ['side_peek', 'center_peek', 'full_page']
const opensRows = computed(() => !['chart', 'pivot'].includes(view.value?.type ?? ''))
function setLayout(type: ViewType) {
  const v = view.value
  if (!v || !editable.value || v.type === type) return
  db.source.upsertView({ ...v, type, config: switchLayout(v, type, all.value) })
}
const checked = (e: Event) => (e.target as HTMLInputElement).checked
const value = (e: Event) => (e.target as HTMLSelectElement).value
</script>

<template>
  <div class="me-db-menu me-db-settings" :data-panel="panel">
    <!-- Group -->
    <template v-if="props.panel === 'group'">
      <label class="me-db-field">
        <span class="me-menu-label">{{ m.groupBy }}</span>
        <select class="me-input me-db-select" :value="c.group_by?.prop ?? ''" :disabled="!editable" @change="setGroup(($event.target as HTMLSelectElement).value)">
          <option v-if="view?.type !== 'board'" value="">{{ m.noGrouping }}</option>
          <option v-for="p in groupable" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </label>
      <label v-if="c.group_by" class="me-db-toggle-row">
        <span>{{ m.hideEmptyGroups }}</span>
        <input type="checkbox" class="me-db-switch" :checked="!!c.group_by.hide_empty" :disabled="!editable" @change="set({ group_by: { ...c.group_by!, hide_empty: ($event.target as HTMLInputElement).checked } })">
      </label>
      <label v-if="c.group_by" class="me-db-field">
        <span class="me-menu-label">{{ m.optionSort }}</span>
        <select class="me-input me-db-select" data-setting="group_sort" :value="c.group_by.sort ?? ''" :disabled="!editable" @change="set({ group_by: { ...c.group_by!, sort: (value($event) || undefined) as 'asc' | 'desc' | undefined } })">
          <option value="">{{ m.optionSorts.manual }}</option>
          <option value="asc">{{ m.optionSorts.asc }}</option>
          <option value="desc">{{ m.optionSorts.desc }}</option>
        </select>
      </label>
      <template v-if="groupKeys.length">
        <div class="me-db-row me-db-section-head">
          <span class="me-menu-label">{{ m.groups }}</span>
          <button type="button" class="me-db-text-button" :disabled="!editable" data-groups-toggle @click="set({ group_by: { ...c.group_by!, hidden: (c.group_by!.hidden?.length ? undefined : groupKeys.map(g => g.key)) } })">{{ c.group_by!.hidden?.length ? m.showAll : m.hideAll }}</button>
        </div>
        <div
          v-for="g in groupKeys"
          :key="g.key"
          class="me-menu-item me-db-prop-row"
          :class="{ 'is-over': overGroup === g.key && dragGroup !== g.key }"
          :data-group-key="g.key"
          @dragover.prevent="dragGroup !== null && (overGroup = g.key)"
          @drop.prevent="dropGroup(g.key)"
        >
          <span class="me-db-row-handle" :draggable="editable && !c.group_by!.sort" :title="m.dragToMove" @dragstart="dragGroup = g.key" @dragend="dragGroup = overGroup = null"><GripVertical /></span>
          <span v-if="g.color" class="me-db-tag" :data-color="g.color === 'default' ? undefined : g.color">{{ g.label }}</span>
          <span v-else class="me-menu-title">{{ g.label }}</span>
          <button type="button" class="me-db-icon-button me-db-menu-end" :class="{ 'is-off': isHiddenGroup(g.key) }" :disabled="!editable" :aria-label="m.hide" :aria-pressed="!isHiddenGroup(g.key)" data-toggle-group @click="toggleGroup(g.key)">
            <EyeOff v-if="isHiddenGroup(g.key)" /><Eye v-else />
          </button>
        </div>
      </template>
    </template>

    <!-- Properties: search, shown (drag to reorder) and hidden -->
    <template v-else-if="props.panel === 'properties'">
      <input v-model="propQuery" class="me-input" :placeholder="m.searchProperty" :aria-label="m.searchProperty" data-prop-search>
      <div class="me-db-row me-db-section-head">
        <span class="me-menu-label">{{ m.shownProps }}</span>
        <button type="button" class="me-db-text-button" :disabled="!editable" data-hide-all @click="setShown([])">{{ m.hideAll }}</button>
      </div>
      <div
        v-for="p in shownProps"
        :key="p.id"
        class="me-menu-item me-db-prop-row"
        :class="{ 'is-over': overProp === p.id && dragProp !== p.id }"
        :data-prop="p.id"
        :aria-pressed="true"
        @dragover.prevent="dragProp && (overProp = p.id)"
        @drop.prevent="dropProp(p.id)"
      >
        <span class="me-db-row-handle" :draggable="editable" :title="m.dragToMove" @dragstart="dragProp = p.id" @dragend="dragProp = overProp = null"><GripVertical /></span>
        <PropIcon :type="p.type" />
        <span class="me-menu-title">{{ p.name }}</span>
        <button type="button" class="me-db-icon-button me-db-menu-end" :disabled="!editable" :aria-label="m.hide" data-toggle @click="toggle(p)"><Eye /></button>
      </div>
      <template v-if="hiddenProps.length">
        <div class="me-db-row me-db-section-head">
          <span class="me-menu-label">{{ m.hiddenProps }}</span>
          <button type="button" class="me-db-text-button" :disabled="!editable" data-show-all @click="setShown([...shown, ...hiddenProps.map(p => p.id)])">{{ m.showAll }}</button>
        </div>
        <div v-for="p in hiddenProps" :key="p.id" class="me-menu-item me-db-prop-row" :data-prop="p.id" :aria-pressed="false">
          <span class="me-db-row-handle is-placeholder" />
          <PropIcon :type="p.type" />
          <span class="me-menu-title">{{ p.name }}</span>
          <button type="button" class="me-db-icon-button me-db-menu-end is-off" :disabled="!editable" :aria-label="m.showAll" data-toggle @click="toggle(p)"><EyeOff /></button>
        </div>
      </template>
    </template>

    <!-- View options: layout, per-layout settings, open mode -->
    <template v-else>
      <div class="me-menu-label">{{ m.layout }}</div>
      <div class="me-db-layouts" role="radiogroup" :aria-label="m.layout">
        <button
          v-for="t in LAYOUTS"
          :key="t"
          type="button"
          class="me-db-layout"
          role="radio"
          :aria-checked="view?.type === t"
          :class="{ 'is-on': view?.type === t }"
          :disabled="!editable"
          :data-layout="t"
          @click="setLayout(t)"
        >
          <PropIcon :view="t" /><span>{{ m.viewTypes[t] }}</span>
        </button>
      </div>

      <template v-if="view?.type === 'table'">
        <label class="me-db-toggle-row">
          <span>{{ m.wrapAll }}</span>
          <input type="checkbox" class="me-db-switch" data-setting="wrap" :checked="!!c.wrap" :disabled="!editable" @change="set({ wrap: checked($event) || undefined, wraps: undefined })">
        </label>
        <label class="me-db-toggle-row">
          <span>{{ m.freezeFirst }}</span>
          <input type="checkbox" class="me-db-switch" data-setting="freeze" :checked="(c.freeze ?? 1) > 0" :disabled="!editable" @change="set({ freeze: checked($event) ? undefined : 0 })">
        </label>
        <label class="me-db-field">
          <span class="me-menu-label">{{ m.loadLimit }}</span>
          <select class="me-input me-db-select" data-setting="load_limit" :value="String(c.load_limit ?? 50)" :disabled="!editable" @change="set({ load_limit: value($event) === '50' ? undefined : Number(value($event)) })">
            <option v-for="n in [10, 25, 50, 100]" :key="n" :value="String(n)">{{ n }}</option>
            <option value="0">{{ m.noLimit }}</option>
          </select>
        </label>
        <label class="me-db-toggle-row">
          <span>{{ m.verticalLines }}</span>
          <input type="checkbox" class="me-db-switch" data-setting="vertical_lines" :checked="c.vertical_lines !== false" :disabled="!editable" @change="set({ vertical_lines: checked($event) ? undefined : false })">
        </label>
      </template>
      <template v-if="SUB_ITEM_VIEWS.includes(view?.type ?? '')">
        <label class="me-db-field">
          <span class="me-menu-label">{{ m.subItems }}</span>
          <select class="me-input me-db-select" data-setting="sub_items" :value="c.sub_items ?? ''" :disabled="!editable" @change="set({ sub_items: value($event) || undefined })">
            <option value="">{{ m.off }}</option>
            <option v-for="p in selfRelations" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>
        <button v-if="!selfRelations.length && editable" type="button" class="me-db-text-button" data-turn-on-sub-items @click="turnOnSubItems">{{ m.turnOnSubItems }}</button>
        <label v-if="c.sub_items" class="me-db-field">
          <span class="me-menu-label">{{ m.subItemsDisplay }}</span>
          <select class="me-input me-db-select" data-setting="sub_items_display" :value="c.sub_items_display ?? 'nested'" :disabled="!editable" @change="set({ sub_items_display: value($event) === 'flat' ? 'flat' : undefined })">
            <option v-for="d in (['nested', 'flat'] as const)" :key="d" :value="d">{{ m.subItemsDisplays[d] }}</option>
          </select>
        </label>
      </template>
      <template v-if="view?.type === 'board' || view?.type === 'gallery'">
        <label class="me-db-field">
          <span class="me-menu-label">{{ m.cover }}</span>
          <select class="me-input me-db-select" data-setting="cover" :value="(view.type === 'board' ? c.card?.cover : c.cover) ?? ''" :disabled="!editable" @change="view.type === 'board' ? set({ card: { ...c.card, cover: value($event) || undefined } }) : set({ cover: value($event) || undefined })">
            <option value="">{{ m.coverNone }}</option>
            <option value="page_cover">{{ m.coverPageCover }}</option>
            <option value="page_content">{{ m.coverPageContent }}</option>
            <option v-for="p in fileProps" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>
        <label class="me-db-field">
          <span class="me-menu-label">{{ m.cardSize }}</span>
          <select class="me-input me-db-select" data-setting="size" :value="(view.type === 'board' ? c.card?.size : c.size) ?? 'm'" :disabled="!editable" @change="view.type === 'board' ? set({ card: { ...c.card, size: value($event) as 's' | 'm' | 'l' } }) : set({ size: value($event) as 's' | 'm' | 'l' })">
            <option v-for="s in (['s', 'm', 'l'] as const)" :key="s" :value="s">{{ m.sizes[s] }}</option>
          </select>
        </label>
        <label class="me-db-field">
          <span class="me-menu-label">{{ m.cardLayout }}</span>
          <select class="me-input me-db-select" data-setting="card_layout" :value="c.card?.layout ?? 'list'" :disabled="!editable" @change="set({ card: { ...c.card, layout: value($event) === 'compact' ? 'compact' : undefined } })">
            <option v-for="l in (['list', 'compact'] as const)" :key="l" :value="l">{{ m.cardLayouts[l] }}</option>
          </select>
        </label>
        <label class="me-db-toggle-row">
          <span>{{ m.fitImage }}</span>
          <input type="checkbox" class="me-db-switch" data-setting="fit" :checked="!!c.fit_image" :disabled="!editable" @change="set({ fit_image: checked($event) || undefined })">
        </label>
        <label v-if="view.type === 'board'" class="me-db-toggle-row">
          <span>{{ m.colorColumns }}</span>
          <input type="checkbox" class="me-db-switch" data-setting="color-columns" :checked="!!c.color_columns" :disabled="!editable" @change="set({ color_columns: checked($event) || undefined })">
        </label>
      </template>
      <template v-if="view?.type === 'calendar'">
        <label class="me-db-field">
          <span class="me-menu-label">{{ m.dateProperty }}</span>
          <select class="me-input me-db-select" :value="c.date_prop ?? ''" :disabled="!editable" @change="set({ date_prop: value($event) })">
            <option v-for="p in dateProps" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>
        <label class="me-db-field">
          <span class="me-menu-label">{{ m.calendarAs }}</span>
          <select class="me-input me-db-select" data-setting="calendar_as" :value="c.calendar_as ?? 'month'" :disabled="!editable" @change="set({ calendar_as: value($event) === 'week' ? 'week' : undefined })">
            <option value="month">{{ m.calendarModes.month }}</option>
            <option value="week">{{ m.calendarModes.week }}</option>
          </select>
        </label>
        <label class="me-db-toggle-row">
          <span>{{ m.wrapPageTitles }}</span>
          <input type="checkbox" class="me-db-switch" data-setting="wrap_titles" :checked="!!c.wrap_titles" :disabled="!editable" @change="set({ wrap_titles: checked($event) || undefined })">
        </label>
        <label class="me-db-toggle-row">
          <span>{{ m.showWeekends }}</span>
          <input type="checkbox" class="me-db-switch" data-setting="weekends" :checked="c.show_weekends !== false" :disabled="!editable" @change="set({ show_weekends: checked($event) ? undefined : false })">
        </label>
      </template>
      <template v-if="view?.type === 'timeline'">
        <label class="me-db-field">
          <span class="me-menu-label">{{ m.startProperty }}</span>
          <select class="me-input me-db-select" :value="c.start_prop ?? ''" :disabled="!editable" @change="set({ start_prop: value($event) })">
            <option v-for="p in dateProps" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>
        <label class="me-db-field">
          <span class="me-menu-label">{{ m.endProperty }}</span>
          <select class="me-input me-db-select" :value="c.end_prop ?? ''" :disabled="!editable" @change="set({ end_prop: value($event) || undefined })">
            <option value="">–</option>
            <option v-for="p in dateProps" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>
        <label class="me-db-field">
          <span class="me-menu-label">{{ m.scale }}</span>
          <select class="me-input me-db-select" :value="c.scale ?? 'day'" :disabled="!editable" @change="set({ scale: value($event) as 'day' | 'week' | 'month' | 'quarter' | 'year' })">
            <option v-for="s in (['day', 'week', 'month', 'quarter', 'year'] as const)" :key="s" :value="s">{{ m.scales[s] }}</option>
          </select>
        </label>
        <label class="me-db-toggle-row">
          <span>{{ m.showTable }}</span>
          <input type="checkbox" class="me-db-switch" data-setting="show-table" :checked="c.show_table !== false" :disabled="!editable" @change="set({ show_table: checked($event) ? undefined : false })">
        </label>
      </template>
      <template v-if="view?.type === 'chart'">
        <label class="me-db-field">
          <span class="me-menu-label">{{ m.chartType }}</span>
          <select class="me-input me-db-select" :value="c.chart ?? 'bar'" :disabled="!editable" data-setting="chart" @change="set({ chart: ($event.target as HTMLSelectElement).value as ChartKind })">
            <option v-for="k in CHARTS" :key="k" :value="k">{{ m.chartTypes[k] }}</option>
          </select>
        </label>
        <label class="me-db-field">
          <span class="me-menu-label">{{ m.xAxis }}</span>
          <select class="me-input me-db-select" :value="c.x?.prop ?? ''" :disabled="!editable" @change="set({ x: { prop: ($event.target as HTMLSelectElement).value } })">
            <option v-for="p in all.filter(p => p.type !== 'button')" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>
        <label v-if="isDateX" class="me-db-field">
          <span class="me-menu-label">{{ m.bucket }}</span>
          <select class="me-input me-db-select" :value="c.x?.bucket ?? ''" :disabled="!editable" @change="set({ x: { prop: c.x!.prop, bucket: (($event.target as HTMLSelectElement).value || undefined) as 'day' | undefined } })">
            <option value="">{{ m.buckets.none }}</option>
            <option v-for="b in (['day', 'week', 'month', 'year'] as const)" :key="b" :value="b">{{ m.buckets[b] }}</option>
          </select>
        </label>
        <label class="me-db-field">
          <span class="me-menu-label">{{ m.yAxis }}</span>
          <span class="me-db-row">
            <select class="me-input me-db-select" :value="c.y?.[0]?.fn ?? 'count'" :disabled="!editable" @change="setY({ fn: ($event.target as HTMLSelectElement).value as ValueFn })">
              <option v-for="f in FNS" :key="f" :value="f">{{ m.aggregates[f] ?? f }}</option>
            </select>
            <select v-if="(c.y?.[0]?.fn ?? 'count') !== 'count'" class="me-input me-db-select" :value="c.y?.[0]?.prop ?? ''" :disabled="!editable" @change="setY({ prop: ($event.target as HTMLSelectElement).value })">
              <option v-for="p in numberProps" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </span>
        </label>
        <label class="me-db-field">
          <span class="me-menu-label">{{ m.series }}</span>
          <select class="me-input me-db-select" :value="c.series ?? ''" :disabled="!editable" @change="set({ series: ($event.target as HTMLSelectElement).value || undefined })">
            <option value="">–</option>
            <option v-for="p in groupable" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>
        <label class="me-db-toggle-row">
          <span>{{ m.stacked }}</span>
          <input type="checkbox" class="me-db-switch" :checked="!!c.stacked" :disabled="!editable" @change="set({ stacked: ($event.target as HTMLInputElement).checked })">
        </label>
      </template>
      <template v-if="view?.type === 'pivot'">
        <label class="me-db-field">
          <span class="me-menu-label">{{ m.pivotRows }}</span>
          <select class="me-input me-db-select" :value="c.rows?.[0] ?? ''" :disabled="!editable" @change="set({ rows: ($event.target as HTMLSelectElement).value ? [($event.target as HTMLSelectElement).value] : [] })">
            <option value="">–</option>
            <option v-for="p in groupable" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>
        <label class="me-db-field">
          <span class="me-menu-label">{{ m.pivotCols }}</span>
          <select class="me-input me-db-select" :value="c.cols?.[0] ?? ''" :disabled="!editable" @change="set({ cols: ($event.target as HTMLSelectElement).value ? [($event.target as HTMLSelectElement).value] : [] })">
            <option value="">–</option>
            <option v-for="p in groupable" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>
        <label class="me-db-field">
          <span class="me-menu-label">{{ m.pivotValues }}</span>
          <span class="me-db-row">
            <select class="me-input me-db-select" :value="pivotValue.fn" :disabled="!editable" @change="set({ values: [{ ...pivotValue, fn: ($event.target as HTMLSelectElement).value, prop: ($event.target as HTMLSelectElement).value === 'count' ? undefined : pivotValue.prop ?? numberProps[0]?.id }] })">
              <option v-for="f in FNS" :key="f" :value="f">{{ m.aggregates[f] ?? f }}</option>
            </select>
            <select v-if="pivotValue.fn !== 'count'" class="me-input me-db-select" :value="pivotValue.prop ?? ''" :disabled="!editable" @change="set({ values: [{ ...pivotValue, prop: ($event.target as HTMLSelectElement).value }] })">
              <option v-for="p in numberProps" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </span>
        </label>
        <label class="me-db-toggle-row">
          <span>{{ m.totals }}</span>
          <input type="checkbox" class="me-db-switch" :checked="c.totals !== false" :disabled="!editable" @change="set({ totals: ($event.target as HTMLInputElement).checked })">
        </label>
      </template>

      <label v-if="['table', 'board', 'gallery', 'list'].includes(view?.type ?? '')" class="me-db-toggle-row">
        <span>{{ m.showPageIcon }}</span>
        <input type="checkbox" class="me-db-switch" data-setting="show_page_icon" :checked="c.show_page_icon !== false" :disabled="!editable" @change="set({ show_page_icon: checked($event) ? undefined : false })">
      </label>
      <label class="me-db-toggle-row">
        <span>{{ m.showTitle }}</span>
        <input type="checkbox" class="me-db-switch" data-setting="show_title" :checked="c.show_title !== false" :disabled="!editable" @change="set({ show_title: checked($event) ? undefined : false })">
      </label>
      <details v-if="['table', 'board', 'gallery', 'list', 'calendar'].includes(view?.type ?? '')" class="me-db-details" data-setting="colors" :open="!!c.colors?.length">
        <summary class="me-menu-label">{{ m.conditionalColor }}<span v-if="c.colors?.length" class="me-db-menu-value">{{ c.colors.length }}</span></summary>
        <ColorRules />
      </details>
      <details v-if="editable" class="me-db-details" data-setting="automations" :open="!!db.automations.value.length">
        <summary class="me-menu-label"><Zap class="me-db-menu-icon" />{{ m.automations }}<span v-if="db.automations.value.length" class="me-db-menu-value">{{ db.automations.value.filter(a => a.enabled).length }}</span></summary>
        <AutomationsPanel />
      </details>
      <template v-if="opensRows">
        <div class="me-db-separator" role="separator" />
        <div class="me-menu-label">{{ m.openPagesIn }}</div>
        <button
          v-for="mode in MODES"
          :key="mode"
          type="button"
          class="me-menu-item"
          role="menuitemradio"
          :aria-checked="db.openMode.value === mode"
          :disabled="!editable"
          :data-open-mode="mode"
          :title="m.openModeHints[mode]"
          @click="set({ open_in: mode })"
        >
          <OpenModeIcon :mode="mode" class="me-db-menu-icon" /><span class="me-menu-title">{{ m.openModes[mode] }}</span>
          <Check v-if="db.openMode.value === mode" class="me-db-menu-end" />
        </button>
      </template>
      <template v-if="db.canLock.value">
        <div class="me-db-separator" role="separator" />
        <button type="button" class="me-menu-item" role="menuitemcheckbox" :aria-checked="db.locked.value" data-setting="lock" @click="db.source.setMeta({ locked: !db.locked.value })">
          <Lock v-if="!db.locked.value" class="me-db-menu-icon" /><LockOpen v-else class="me-db-menu-icon" />{{ db.locked.value ? m.unlockDatabase : m.lockDatabase }}
        </button>
      </template>
    </template>
  </div>
</template>
