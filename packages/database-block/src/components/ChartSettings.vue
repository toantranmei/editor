<script setup lang="ts">
/** Chart setup (type, x axis and bucket, y value, series, stacked): a chart view's options, a dashboard chart widget. */
import { computed } from 'vue'
import { useDb } from '../context'
import type { ChartKind, ChartSpec, ValueFn } from '../types'
import { groupableTypes } from '../util'

const props = defineProps<{ spec: ChartSpec, editable: boolean }>()
const emit = defineEmits<{ patch: [patch: Partial<ChartSpec>] }>()
const db = useDb()
const m = computed(() => db.m.value)
const c = computed(() => props.spec)
const all = computed(() => db.props.value)
const groupable = computed(() => all.value.filter(p => groupableTypes('chart').includes(p.type)))
const numberProps = computed(() => all.value.filter(p => p.type === 'number' || (p.type === 'formula' && p.config?.result_type === 'number') || p.type === 'rollup'))
const CHARTS: ChartKind[] = ['bar', 'line', 'area', 'pie', 'donut', 'scatter']
const FNS: ValueFn[] = ['count', 'sum', 'avg', 'min', 'max']
const set = (patch: Partial<ChartSpec>) => emit('patch', patch)
const xProp = computed(() => all.value.find(p => p.id === c.value.x?.prop))
const isDateX = computed(() => !!xProp.value && ['date', 'created_time', 'last_edited_time'].includes(xProp.value.type))
function setY(patch: { prop?: string, fn?: ValueFn }) {
  const y = c.value.y?.[0] ?? { fn: 'count' as ValueFn }
  const next = { ...y, ...patch }
  if (next.fn === 'count') delete next.prop
  else if (!next.prop) next.prop = numberProps.value[0]?.id
  set({ y: [next] })
}
const value = (e: Event) => (e.target as HTMLSelectElement).value
</script>

<template>
  <label class="me-db-field">
    <span class="me-menu-label">{{ m.chartType }}</span>
    <select class="me-input me-db-select" :value="c.chart ?? 'bar'" :disabled="!editable" data-setting="chart" @change="set({ chart: value($event) as ChartKind })">
      <option v-for="k in CHARTS" :key="k" :value="k">{{ m.chartTypes[k] }}</option>
    </select>
  </label>
  <label class="me-db-field">
    <span class="me-menu-label">{{ m.xAxis }}</span>
    <select class="me-input me-db-select" :value="c.x?.prop ?? ''" :disabled="!editable" data-setting="x" @change="set({ x: { prop: value($event) } })">
      <option v-for="p in all.filter(p => p.type !== 'button')" :key="p.id" :value="p.id">{{ p.name }}</option>
    </select>
  </label>
  <label v-if="isDateX" class="me-db-field">
    <span class="me-menu-label">{{ m.bucket }}</span>
    <select class="me-input me-db-select" :value="c.x?.bucket ?? ''" :disabled="!editable" @change="set({ x: { prop: c.x!.prop, bucket: (value($event) || undefined) as 'day' | undefined } })">
      <option value="">{{ m.buckets.none }}</option>
      <option v-for="b in (['day', 'week', 'month', 'year'] as const)" :key="b" :value="b">{{ m.buckets[b] }}</option>
    </select>
  </label>
  <label class="me-db-field">
    <span class="me-menu-label">{{ m.yAxis }}</span>
    <span class="me-db-row">
      <select class="me-input me-db-select" :value="c.y?.[0]?.fn ?? 'count'" :disabled="!editable" data-setting="y-fn" @change="setY({ fn: value($event) as ValueFn })">
        <option v-for="f in FNS" :key="f" :value="f">{{ m.aggregates[f] ?? f }}</option>
      </select>
      <select v-if="(c.y?.[0]?.fn ?? 'count') !== 'count'" class="me-input me-db-select" :value="c.y?.[0]?.prop ?? ''" :disabled="!editable" @change="setY({ prop: value($event) })">
        <option v-for="p in numberProps" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
    </span>
  </label>
  <label class="me-db-field">
    <span class="me-menu-label">{{ m.series }}</span>
    <select class="me-input me-db-select" :value="c.series ?? ''" :disabled="!editable" @change="set({ series: value($event) || undefined })">
      <option value="">–</option>
      <option v-for="p in groupable" :key="p.id" :value="p.id">{{ p.name }}</option>
    </select>
  </label>
  <label class="me-db-toggle-row">
    <span>{{ m.stacked }}</span>
    <input type="checkbox" class="me-db-switch" :checked="!!c.stacked" :disabled="!editable" @change="set({ stacked: ($event.target as HTMLInputElement).checked })">
  </label>
</template>
