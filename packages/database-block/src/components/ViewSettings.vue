<script setup lang="ts">
/**
 * Toolbar panels that edit the current view's config: grouping, property visibility and per-type settings
 * (board cover, calendar / timeline dates, gallery size, chart and pivot setup).
 */
import { Eye, EyeOff } from '@lucide/vue'
import { computed } from 'vue'
import { useDb } from '../context'
import type { ChartKind, Prop, ValueFn, ViewConfig } from '../types'
import { visibleIds } from '../util'
import PropIcon from './PropIcon.vue'

const props = defineProps<{ panel: 'group' | 'properties' | 'settings' }>()
const db = useDb()
const m = computed(() => db.m.value)
const view = computed(() => db.view.value)
const c = computed<ViewConfig>(() => view.value?.config ?? {})
const editable = computed(() => db.canEditStructure.value)
const all = computed(() => db.props.value)
const ofTypes = (...types: string[]) => all.value.filter(p => types.includes(p.type))
const groupable = computed(() => (view.value?.type === 'board'
  ? ofTypes('select', 'status', 'person', 'checkbox', 'multi_select')
  : ofTypes('select', 'status', 'multi_select', 'person', 'checkbox', 'text', 'url', 'email', 'phone', 'date', 'relation')))
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
const toggle = (p: Prop) => setShown(shown.value.includes(p.id) ? shown.value.filter(id => id !== p.id) : [...shown.value, p.id])

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
    </template>

    <!-- Properties -->
    <template v-else-if="props.panel === 'properties'">
      <div class="me-db-row">
        <button type="button" class="me-db-text-button" :disabled="!editable" @click="setShown(nonTitle.map(p => p.id))">{{ m.showAll }}</button>
        <button type="button" class="me-db-text-button" :disabled="!editable" @click="setShown([])">{{ m.hideAll }}</button>
      </div>
      <button
        v-for="p in nonTitle"
        :key="p.id"
        type="button"
        class="me-menu-item"
        :data-prop="p.id"
        :aria-pressed="shown.includes(p.id)"
        :disabled="!editable"
        @click="toggle(p)"
      >
        <PropIcon :type="p.type" />
        <span class="me-menu-title">{{ p.name }}</span>
        <Eye v-if="shown.includes(p.id)" class="me-db-menu-end" /><EyeOff v-else class="me-db-menu-end is-off" />
      </button>
    </template>

    <!-- Per-type settings -->
    <template v-else>
      <template v-if="view?.type === 'board' || view?.type === 'gallery'">
        <label class="me-db-field">
          <span class="me-menu-label">{{ m.cover }}</span>
          <select class="me-input me-db-select" :value="(view.type === 'board' ? c.card?.cover : c.cover) ?? ''" :disabled="!editable" @change="view.type === 'board' ? set({ card: { ...c.card, cover: ($event.target as HTMLSelectElement).value || undefined } }) : set({ cover: ($event.target as HTMLSelectElement).value || undefined })">
            <option value="">{{ m.coverNone }}</option>
            <option v-for="p in fileProps" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>
        <label v-if="view.type === 'gallery'" class="me-db-field">
          <span class="me-menu-label">{{ m.size }}</span>
          <select class="me-input me-db-select" :value="c.size ?? 'm'" :disabled="!editable" @change="set({ size: ($event.target as HTMLSelectElement).value as 's' | 'm' | 'l' })">
            <option v-for="s in (['s', 'm', 'l'] as const)" :key="s" :value="s">{{ m.sizes[s] }}</option>
          </select>
        </label>
      </template>
      <label v-if="view?.type === 'calendar'" class="me-db-field">
        <span class="me-menu-label">{{ m.dateProperty }}</span>
        <select class="me-input me-db-select" :value="c.date_prop ?? ''" :disabled="!editable" @change="set({ date_prop: ($event.target as HTMLSelectElement).value })">
          <option v-for="p in dateProps" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </label>
      <template v-if="view?.type === 'timeline'">
        <label class="me-db-field">
          <span class="me-menu-label">{{ m.startProperty }}</span>
          <select class="me-input me-db-select" :value="c.start_prop ?? ''" :disabled="!editable" @change="set({ start_prop: ($event.target as HTMLSelectElement).value })">
            <option v-for="p in dateProps" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>
        <label class="me-db-field">
          <span class="me-menu-label">{{ m.endProperty }}</span>
          <select class="me-input me-db-select" :value="c.end_prop ?? ''" :disabled="!editable" @change="set({ end_prop: ($event.target as HTMLSelectElement).value || undefined })">
            <option value="">–</option>
            <option v-for="p in dateProps" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>
        <label class="me-db-field">
          <span class="me-menu-label">{{ m.scale }}</span>
          <select class="me-input me-db-select" :value="c.scale ?? 'day'" :disabled="!editable" @change="set({ scale: ($event.target as HTMLSelectElement).value as 'day' | 'week' | 'month' })">
            <option v-for="s in (['day', 'week', 'month'] as const)" :key="s" :value="s">{{ m.scales[s] }}</option>
          </select>
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
            <option v-for="p in all" :key="p.id" :value="p.id">{{ p.name }}</option>
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
    </template>
  </div>
</template>
