import type { LocaleName } from '@toantranmei/editor'
import type { ChartMessages } from './messages'

/** Chart types (contract 1.3, chart view `config.chart`). */
export type ChartKind = 'bar' | 'line' | 'area' | 'pie' | 'donut' | 'scatter'

/** Aggregation of a y value. `count` needs no prop. */
export type ChartFn = 'count' | 'sum' | 'avg' | 'min' | 'max'

/**
 * Chart config, shaped like the database chart view's config (contract 1.3). In the standalone `chart` block, every
 * `prop` is a column NAME of the block's data table.
 */
export interface ChartConfig {
  chart: ChartKind
  x: { prop: string, bucket?: 'day' | 'week' | 'month' | 'year' }
  y: Array<{ prop?: string, fn: ChartFn }>
  series?: string
  stacked?: boolean
}

/** Chart-ready data: what `DatabaseSource.chart(viewId)` returns. */
export interface ChartSeriesData {
  x: Array<string | number>
  series: Array<{ name: string, data: number[] }>
}

/** The standalone block's table (`attrs.data`). */
export interface ChartTable {
  columns: string[]
  rows: Array<Array<string | number>>
}

/** Colors and fonts read from the `--me-chart-*` tokens. */
export interface ChartTheme {
  series: string[]
  text: string
  title: string
  axis: string
  splitLine: string
  tooltipBg: string
  tooltipText: string
  tooltipBorder: string
  fontSize: number
  fontFamily: string
}

/** `chartBlock.configure(options)`. */
export interface ChartBlockOptions {
  /** Override any string, per locale: `{ en: { edit: 'Edit data' } }`. */
  messages?: Partial<Record<LocaleName, Partial<ChartMessages>>> | null
  /** Data and config of a newly inserted chart. Default: a small sample table, bar chart. */
  initial?: { data: ChartTable, config: ChartConfig } | null
}
