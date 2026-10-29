<script setup lang="ts">
/**
 * /chart: the standalone chart block (`chartBlock`) in an editor, plus `<DatabaseChart>` on its own (the component
 * the database chart view uses). ECharts is downloaded only once a chart mounts (see the Network tab).
 */
import type { JSONContent, LocaleName, ThemeMode } from '@toantranmei/editor'
import { defaultBlocks } from '@toantranmei/editor'
import { chartBlock, type ChartConfig, type ChartKind, type ChartSeriesData, DatabaseChart } from '@toantranmei/chart-block'

const blocks = [...defaultBlocks, chartBlock]

// 20k points: the line chart is drawn from ≤ 5000 LTTB-picked points.
const N = 20_000
const wave = Array.from({ length: N }, (_, i) => [i, Math.round((Math.sin(i / 300) * 50 + Math.sin(i / 37) * 10 + (i % 997 === 0 ? 40 : 0)) * 100) / 100])

const doc = ref<JSONContent | null>({
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Chart block' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Hover a chart and click "Edit data" to change cells, paste CSV or switch the chart type. Type /chart for a new one.' }] },
    {
      type: 'chart',
      attrs: {
        data: {
          columns: ['Quarter', 'Region', 'Revenue'],
          rows: [['Q1', 'North', 120], ['Q1', 'South', 90], ['Q2', 'North', 150], ['Q2', 'South', 110], ['Q3', 'North', 170], ['Q3', 'South', 140], ['Q4', 'North', 210], ['Q4', 'South', 160]],
        },
        config: { chart: 'bar', x: { prop: 'Quarter' }, y: [{ prop: 'Revenue', fn: 'sum' }], series: 'Region', stacked: true },
      },
    },
    { type: 'paragraph', content: [{ type: 'text', text: `Line chart with ${N.toLocaleString('en')} points (downsampled with LTTB):` }] },
    {
      type: 'chart',
      attrs: { data: { columns: ['t', 'signal'], rows: wave }, config: { chart: 'line', x: { prop: 't' }, y: [{ prop: 'signal', fn: 'sum' }] } },
    },
  ],
})

const locale = ref<LocaleName>('vi')
const theme = ref<ThemeMode>('auto')
watch(theme, t => document.documentElement.classList.toggle('dark', t === 'dark'))

// Standalone <DatabaseChart>: shaped like `source.chart(viewId)`.
const kind = ref<ChartKind>('area')
const stacked = ref(true)
const months = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']
const dbData: ChartSeriesData = {
  x: months,
  series: [
    { name: 'To do', data: [4, 6, 5, 8, 7, 9, 6, 5, 4, 3] },
    { name: 'In progress', data: [2, 3, 4, 4, 6, 5, 7, 8, 6, 5] },
    { name: 'Done', data: [1, 2, 4, 6, 9, 12, 15, 19, 24, 30] },
  ],
}
const dbConfig = computed<ChartConfig>(() => ({ chart: kind.value, x: { prop: 'created', bucket: 'month' }, y: [{ fn: 'count' }], series: 'status', stacked: stacked.value }))
</script>

<template>
  <div class="min-h-screen">
    <header class="sticky top-0 z-20 flex h-11 items-center justify-between bg-white/90 px-4 text-sm backdrop-blur dark:bg-[#191919]/90">
      <span class="font-medium">Chart</span>
      <div class="flex items-center gap-2">
        <select v-model="locale" class="toolbar-btn bg-transparent">
          <option value="vi">Tiếng Việt</option>
          <option value="en">English</option>
          <option value="zh">中文</option>
        </select>
        <select v-model="theme" class="toolbar-btn bg-transparent">
          <option value="auto">Auto</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
        <NuxtLink to="/" class="toolbar-btn">Playground</NuxtLink>
      </div>
    </header>

    <main class="mx-auto max-w-[900px] px-4 pt-10 pl-12">
      <MeiEditor v-model="doc" :blocks="blocks" :locale="locale" :theme="theme" :outline="false" />

      <section class="mt-12 border-t border-neutral-200 pt-6 dark:border-neutral-800">
        <h2 class="mb-2 text-lg font-semibold">&lt;DatabaseChart&gt;</h2>
        <div class="mb-3 flex items-center gap-3 text-sm">
          <select v-model="kind" class="toolbar-btn bg-transparent">
            <option v-for="k in ['bar', 'line', 'area', 'pie', 'donut', 'scatter']" :key="k" :value="k">{{ k }}</option>
          </select>
          <label class="flex items-center gap-1"><input v-model="stacked" type="checkbox"> stacked</label>
        </div>
        <!-- Outside an editor: the scope class gives it the editor's tokens (light / dark). -->
        <div class="me-scope" :class="{ 'me-dark': theme === 'dark', 'me-light': theme === 'light' }">
          <DatabaseChart :data="dbData" :config="dbConfig" :locale="locale" />
        </div>
      </section>
    </main>
  </div>
</template>
