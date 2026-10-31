import type { ChartConfig, ChartTable } from './types'

/** Data of a new chart block: a small sample the user overwrites (or pastes CSV over). */
export const SAMPLE_TABLE: ChartTable = {
  columns: ['Month', 'Sales', 'Costs'],
  rows: [['Jan', 120, 80], ['Feb', 160, 95], ['Mar', 140, 90], ['Apr', 210, 120]],
}

export const SAMPLE_CONFIG: ChartConfig = {
  chart: 'bar',
  x: { prop: 'Month' },
  y: [{ prop: 'Sales', fn: 'sum' }, { prop: 'Costs', fn: 'sum' }],
  stacked: false,
}

export const CHART_KINDS = ['bar', 'line', 'area', 'pie', 'donut', 'scatter'] as const
export const CHART_FNS = ['sum', 'avg', 'min', 'max', 'count'] as const

export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

/** Accepts anything stored in a document; returns a usable table. */
export function normalizeTable(value: unknown): ChartTable {
  const v = value as Partial<ChartTable> | null
  const columns = Array.isArray(v?.columns) ? v.columns.map(String) : []
  const rows = Array.isArray(v?.rows) ? v.rows.filter(Array.isArray).map(r => r.map(c => (typeof c === 'number' ? c : String(c ?? '')))) : []
  return { columns, rows }
}

export function normalizeConfig(value: unknown): ChartConfig {
  const v = (value ?? {}) as Partial<ChartConfig>
  return {
    chart: CHART_KINDS.includes(v.chart as never) ? v.chart! : 'bar',
    x: { prop: typeof v.x?.prop === 'string' ? v.x.prop : '', ...(v.x?.bucket ? { bucket: v.x.bucket } : {}) },
    y: Array.isArray(v.y) ? v.y.filter(y => y && CHART_FNS.includes(y.fn as never)).map(y => (y.prop ? { prop: y.prop, fn: y.fn } : { fn: y.fn })) : [],
    ...(v.series ? { series: v.series } : {}),
    stacked: !!v.stacked,
  }
}
