<script lang="ts">
import { defineAsyncComponent } from 'vue'

// One shared lazy import for every chart on the page (a dashboard mounts several at once).
let chartBlock: Promise<typeof import('@toantranmei/chart-block')> | null = null
function loadChartBlock() {
  chartBlock ??= import('@toantranmei/chart-block').catch((error) => {
    chartBlock = null
    throw error
  })
  return chartBlock
}
const DatabaseChart = defineAsyncComponent(() => loadChartBlock().then(m => m.DatabaseChart))
</script>

<script setup lang="ts">
/**
 * A chart of a view drawn by chart-block's `<DatabaseChart>` (loaded only when shown): `source.chart(viewId)` for
 * a chart view, `source.chart(viewId, query)` for a dashboard widget (its own chart config and filter).
 * Reloads when the config, the query or the data change.
 */
import type { ChartConfig } from '@toantranmei/chart-block'
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import { useDb } from '../context'
import type { ChartQuery, ChartResult, ChartSpec } from '../types'

const props = defineProps<{
  viewId: string
  spec: ChartSpec
  /** Dashboard widget query; without it the view's own chart config is read. */
  query?: ChartQuery | null
  /** Skip loading (e.g. the view being switched away is not a chart). */
  disabled?: boolean
}>()
const db = useDb()
const m = computed(() => db.m.value)
const data = shallowRef<ChartResult>({ x: [], series: [] })
const loading = shallowRef(true)
const config = computed<ChartConfig>(() => {
  const c = props.spec
  return { chart: c.chart ?? 'bar', x: c.x ?? { prop: '' }, y: c.y?.length ? c.y : [{ fn: 'count' }], series: c.series, stacked: c.stacked }
})
let seq = 0
async function load() {
  const mine = ++seq
  // Never query without an x axis (a chart being set up, or a view being switched away: KS-BUG-12).
  if (props.disabled || !props.spec.x?.prop) {
    data.value = { x: [], series: [] }
    loading.value = false
    return
  }
  try {
    const res = props.query ? await db.source.chart(props.viewId, props.query) : await db.source.chart(props.viewId)
    if (mine === seq) data.value = res
  }
  catch (error) {
    db.report(error)
  }
  finally {
    if (mine === seq) loading.value = false
  }
}
watch([() => props.viewId, () => JSON.stringify([props.spec, props.query, props.disabled]), () => db.source.version.value], load, { immediate: true })
onBeforeUnmount(() => seq++)
</script>

<template>
  <div v-if="loading" class="me-db-empty">{{ m.loading }}</div>
  <DatabaseChart v-else :data="data" :config="config" :empty-text="m.noData" :locale="(db.locale.value as 'vi' | 'en' | 'zh')" />
</template>
