<script setup lang="ts">
/**
 * Renders chart data (`source.chart(viewId)`, or the standalone block's table) with ECharts, loaded lazily.
 * Colors come from the `--me-chart-*` tokens and follow light / dark; resizes with its container.
 */
import type { LocaleName } from '@toantranmei/editor'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import type { ECharts } from './echarts-setup'
import { loadECharts } from './load'
import { messages } from './messages'
import { buildChartOption } from './option'
import { readChartTheme } from './theme'
import type { ChartConfig, ChartSeriesData } from './types'

const props = defineProps<{
  data: ChartSeriesData
  config: ChartConfig
  /** CSS length. Default: the `chart.height` token. */
  height?: string
  /** Shown when there is nothing to draw. */
  emptyText?: string
  /** For the default empty / loading text. */
  locale?: LocaleName
}>()
const emit = defineEmits<{ ready: [chart: ECharts], error: [error: unknown] }>()

const root = ref<HTMLElement | null>(null)
const canvas = ref<HTMLElement | null>(null)
const chart = shallowRef<ECharts | null>(null)
const failed = ref(false)
const m = computed(() => messages[props.locale ?? 'vi'] ?? messages.vi)
const empty = computed(() => !props.data.x.length || !props.data.series.length)

function render() {
  if (!chart.value || empty.value) return
  chart.value.setOption(buildChartOption(props.data, props.config, readChartTheme(root.value)), { notMerge: true, lazyUpdate: true })
}

let disposed = false
let resize: ResizeObserver | null = null
let themeObserver: MutationObserver | null = null
let media: MediaQueryList | null = null

async function start() {
  if (chart.value || disposed || !canvas.value) return
  try {
    const echarts = await loadECharts()
    if (disposed || !canvas.value) return
    chart.value = echarts.init(canvas.value, null, { renderer: 'canvas' })
    render()
    emit('ready', chart.value)
  }
  catch (error) {
    failed.value = true
    emit('error', error)
  }
}

onMounted(() => {
  if (!empty.value) start()
  if (typeof ResizeObserver !== 'undefined' && root.value) {
    resize = new ResizeObserver(() => chart.value?.resize())
    resize.observe(root.value)
  }
  // Re-theme when the app toggles `html.dark` or the editor's forced mode (`.me-scope.me-dark`).
  if (typeof MutationObserver !== 'undefined') {
    themeObserver = new MutationObserver(render)
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] })
    const scope = root.value?.closest('.me-scope')
    if (scope) themeObserver.observe(scope, { attributes: true, attributeFilter: ['class', 'data-me-id'] })
  }
  media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null
  media?.addEventListener?.('change', render)
})

onBeforeUnmount(() => {
  disposed = true
  resize?.disconnect()
  themeObserver?.disconnect()
  media?.removeEventListener?.('change', render)
  chart.value?.dispose()
  chart.value = null
})

watch(() => props.data, () => (chart.value ? render() : !empty.value && start()))
watch(() => props.config, render, { deep: true })

defineExpose({ chart, render })
</script>

<template>
  <div ref="root" class="me-chart" :class="{ 'is-empty': empty }" :style="height ? { height } : undefined">
    <div ref="canvas" class="me-chart-canvas" />
    <div v-if="empty" class="me-chart-empty">
      {{ emptyText ?? m.empty }}
    </div>
    <div v-else-if="!chart && !failed" class="me-chart-empty" aria-live="polite">
      {{ m.loading }}
    </div>
  </div>
</template>
