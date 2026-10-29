// Extracted to dist/style.css; consumers import '@toantranmei/chart-block/style.css'.
// ECharts is never imported here: `DatabaseChart` loads it on mount (`loadECharts`).
import './styles/chart.css'

export { chartBlock } from './definition'
export { CHART_NODE, ChartNode } from './node'
export { default as DatabaseChart } from './DatabaseChart.vue'
export { buildChartOption, ANIMATION_LIMIT } from './option'
export { lttb, lttbIndices, MAX_POINTS } from './lttb'
export { parseCsv, parseDelimited, detectDelimiter, toCell } from './csv'
export { bucketKey, tableToChartData, valueLabel } from './data'
export { readChartTheme } from './theme'
export { loadECharts, type EChartsModule } from './load'
export { SAMPLE_CONFIG, SAMPLE_TABLE, normalizeConfig, normalizeTable } from './defaults'
export { chartMessages, messages, type ChartMessages } from './messages'
export type { ChartBlockOptions, ChartConfig, ChartFn, ChartKind, ChartSeriesData, ChartTable, ChartTheme } from './types'
