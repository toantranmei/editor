<script setup lang="ts">
/** Chart view: `source.chart(viewId)` drawn by chart-block's `<DatabaseChart>` (loaded only when shown). */
import type { ChartConfig } from '@toantranmei/chart-block'
import { computed, defineAsyncComponent, onBeforeUnmount, shallowRef, watch } from 'vue'
import { useDb } from '../context'
import type { ChartResult } from '../types'

defineProps<{ full?: boolean }>()
const DatabaseChart = defineAsyncComponent(() => import('@toantranmei/chart-block').then(m => m.DatabaseChart))
const db = useDb()
const m = computed(() => db.m.value)
const data = shallowRef<ChartResult>({ x: [], series: [] })
const loading = shallowRef(true)
const config = computed<ChartConfig>(() => {
  const c = db.view.value?.config ?? {}
  return { chart: c.chart ?? 'bar', x: c.x ?? { prop: '' }, y: c.y?.length ? c.y : [{ fn: 'count' }], series: c.series, stacked: c.stacked }
})
let seq = 0
async function load() {
  const view = db.view.value
  if (!view) return
  const mine = ++seq
  // Switching views runs this watcher once more, with the next view, before this one unmounts
  // (KS-BUG-12): never query a view that isn't a chart, or a chart without an x axis yet.
  if (view.type !== 'chart' || !view.config?.x?.prop) {
    data.value = { x: [], series: [] }
    loading.value = false
    return
  }
  try {
    const res = await db.source.chart(view.id)
    if (mine === seq) data.value = res
  }
  catch (error) {
    db.report(error)
  }
  finally {
    if (mine === seq) loading.value = false
  }
}
watch([() => db.view.value?.id, () => JSON.stringify(db.view.value?.config), () => db.source.version.value], load, { immediate: true })
onBeforeUnmount(() => seq++)
</script>

<template>
  <div class="me-db-chart" :class="{ 'is-full': full }">
    <div v-if="loading" class="me-db-empty">{{ m.loading }}</div>
    <DatabaseChart v-else :data="data" :config="config" :empty-text="m.noData" :locale="(db.locale.value as 'vi' | 'en' | 'zh')" />
  </div>
</template>
