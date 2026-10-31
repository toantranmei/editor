import type { ChartConfig, ChartFn, ChartSeriesData, ChartTable } from './types'

const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Date bucket key (`2026-10-30`, week → its Monday, `2026-10`, `2026`); non-dates pass through. */
export function bucketKey(value: string | number, bucket: NonNullable<ChartConfig['x']['bucket']>): string | number {
  const d = new Date(typeof value === 'number' ? value : String(value))
  if (Number.isNaN(d.getTime())) return value
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  if (bucket === 'year') return String(y)
  if (bucket === 'month') return `${y}-${pad(m + 1)}`
  if (bucket === 'week') {
    const monday = new Date(Date.UTC(y, m, d.getUTCDate() - ((d.getUTCDay() + 6) % 7)))
    return monday.toISOString().slice(0, 10)
  }
  return d.toISOString().slice(0, 10)
}

function reduce(values: number[], count: number, fn: ChartFn): number {
  if (fn === 'count') return count
  if (!values.length) return 0
  if (fn === 'sum') return values.reduce((a, b) => a + b, 0)
  if (fn === 'avg') return values.reduce((a, b) => a + b, 0) / values.length
  if (fn === 'min') return Math.min(...values)
  return Math.max(...values)
}

/** Series name of a y entry: `count`, the column for `sum`, `Column (avg)` otherwise. */
export function valueLabel(y: { prop?: string, fn: ChartFn }): string {
  if (y.fn === 'count' || !y.prop) return 'count'
  return y.fn === 'sum' ? y.prop : `${y.prop} (${y.fn})`
}

/**
 * The standalone block's table → chart data: rows grouped by the x column (date-bucketed with `x.bucket`),
 * optionally split into one series per value of the `series` column, each y aggregated with its `fn`.
 * Numeric and bucketed x values are sorted; text keeps the table's order.
 */
export function tableToChartData(table: ChartTable, config: ChartConfig): ChartSeriesData {
  const xi = table.columns.indexOf(config.x.prop)
  if (xi < 0 || !table.rows.length) return { x: [], series: [] }
  const si = config.series ? table.columns.indexOf(config.series) : -1
  const ys = (config.y.length ? config.y : [{ fn: 'count' as const }]).map(y => ({ ...y, i: y.prop ? table.columns.indexOf(y.prop) : -1 }))

  const xKeys = new Map<string | number, number>()
  const sKeys = new Map<string, number>()
  // cells[s][x][y] = { values, count }
  const cells = new Map<string, Map<string | number, { values: number[][], count: number }>>()
  for (const row of table.rows) {
    const raw = row[xi]
    if (raw === undefined || raw === '') continue
    const x = config.x.bucket ? bucketKey(raw, config.x.bucket) : raw
    if (!xKeys.has(x)) xKeys.set(x, xKeys.size)
    const s = si >= 0 ? String(row[si] ?? '') : ''
    if (!sKeys.has(s)) sKeys.set(s, sKeys.size)
    let bySeries = cells.get(s)
    if (!bySeries) cells.set(s, (bySeries = new Map()))
    let cell = bySeries.get(x)
    if (!cell) bySeries.set(x, (cell = { values: ys.map(() => []), count: 0 }))
    cell.count++
    ys.forEach((y, k) => {
      const v = y.i >= 0 ? num(row[y.i]) : null
      if (v !== null) cell!.values[k]!.push(v)
    })
  }

  let x = [...xKeys.keys()]
  if (config.x.bucket || x.every(v => typeof v === 'number')) {
    x = x.sort((a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))))
  }
  const series: ChartSeriesData['series'] = []
  for (const s of sKeys.keys()) {
    const bySeries = cells.get(s)!
    ys.forEach((y, k) => {
      const label = valueLabel(y)
      const name = si < 0 ? label : ys.length > 1 ? `${s || '—'} · ${label}` : s || '—'
      series.push({ name, data: x.map((key) => {
        const cell = bySeries.get(key)
        return cell ? reduce(cell.values[k]!, cell.count, y.fn) : 0
      }) })
    })
  }
  return { x, series }
}
