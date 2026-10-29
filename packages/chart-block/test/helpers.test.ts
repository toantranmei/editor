import { describe, expect, it } from 'vitest'
import { buildChartOption, lttb, lttbIndices, MAX_POINTS, parseCsv, readChartTheme, tableToChartData, type ChartConfig, type ChartSeriesData, type ChartTheme } from '../src'

const theme: ChartTheme = {
  series: ['#111', '#222', '#333'],
  text: '#777',
  title: '#000',
  axis: '#ddd',
  splitLine: '#eee',
  tooltipBg: '#fff',
  tooltipText: '#000',
  tooltipBorder: '#ccc',
  fontSize: 12,
  fontFamily: 'sans-serif',
}
const data: ChartSeriesData = { x: ['a', 'b', 'c'], series: [{ name: 'S1', data: [1, 2, 3] }, { name: 'S2', data: [4, 5, 6] }] }
const cfg = (chart: ChartConfig['chart'], extra: Partial<ChartConfig> = {}): ChartConfig => ({ chart, x: { prop: 'x' }, y: [{ fn: 'count' }], ...extra })

describe('buildChartOption', () => {
  it('bar: category x, one bar series per data series, theme colors', () => {
    const o = buildChartOption(data, cfg('bar'), theme)
    expect(o.color).toEqual(theme.series)
    expect(o.xAxis).toMatchObject({ type: 'category', data: ['a', 'b', 'c'] })
    expect(o.yAxis.splitLine.lineStyle.color).toBe('#eee')
    expect(o.series.map((s: any) => [s.type, s.name, s.stack])).toEqual([['bar', 'S1', undefined], ['bar', 'S2', undefined]])
    expect(o.series[0].data).toEqual([1, 2, 3])
    expect(o.tooltip).toMatchObject({ trigger: 'axis', backgroundColor: '#fff' })
    expect(o.legend.show).toBe(true)
    expect(o.animation).toBe(true)
  })

  it('stacked bar / line / area share a stack; area has areaStyle', () => {
    for (const kind of ['bar', 'line', 'area'] as const) {
      const o = buildChartOption(data, cfg(kind, { stacked: true }), theme)
      expect(o.series.every((s: any) => s.stack === 'total')).toBe(true)
      expect(o.series[0].type).toBe(kind === 'bar' ? 'bar' : 'line')
      expect(!!o.series[0].areaStyle).toBe(kind === 'area')
    }
  })

  it('pie sums series per x; donut has an inner radius', () => {
    const pie = buildChartOption(data, cfg('pie'), theme)
    expect(pie.series[0].type).toBe('pie')
    expect(pie.series[0].data).toEqual([{ name: 'a', value: 5 }, { name: 'b', value: 7 }, { name: 'c', value: 9 }])
    expect(pie.series[0].radius).toBe('70%')
    expect(buildChartOption(data, cfg('donut'), theme).series[0].radius).toEqual(['45%', '70%'])
    expect(pie.tooltip.trigger).toBe('item')
  })

  it('scatter: value axis for numeric x, pairs', () => {
    const o = buildChartOption({ x: [1, 2, 5], series: [{ name: 'p', data: [3, 4, 5] }] }, cfg('scatter'), theme)
    expect(o.xAxis.type).toBe('value')
    expect(o.series[0]).toMatchObject({ type: 'scatter', data: [[1, 3], [2, 4], [5, 5]] })
  })

  it('downsamples line/area above 5000 points with LTTB and turns animation off', () => {
    const n = 20_000
    const x = Array.from({ length: n }, (_, i) => i)
    const big: ChartSeriesData = { x, series: [{ name: 'sin', data: x.map(i => Math.sin(i / 100)) }] }
    const line = buildChartOption(big, cfg('line'), theme)
    expect(line.series[0].data).toHaveLength(MAX_POINTS)
    expect(line.xAxis.type).toBe('value')
    expect(line.animation).toBe(false)
    // Category x / stacked: indices shared by all series, total ≤ 5000 per category axis.
    const cat: ChartSeriesData = { x: x.map(String), series: [{ name: 'a', data: big.series[0]!.data }, { name: 'b', data: x.map(i => i % 7) }] }
    const area = buildChartOption(cat, cfg('area', { stacked: true }), theme)
    expect(area.xAxis.data.length).toBeLessThanOrEqual(MAX_POINTS)
    expect(area.series[0].data).toHaveLength(area.xAxis.data.length)
    expect(area.series[1].data).toHaveLength(area.xAxis.data.length)
    // Bars are not downsampled.
    expect(buildChartOption(big, cfg('bar'), theme).series[0].data).toHaveLength(n)
  })
})

describe('lttb', () => {
  it('keeps first and last, returns exactly `threshold` points, picks peaks', () => {
    const values = Array.from({ length: 1000 }, (_, i) => (i === 500 ? 100 : i === 250 ? -100 : 0))
    const out = lttb(values, 50)
    expect(out).toHaveLength(50)
    expect(out[0]).toEqual([0, 0])
    expect(out.at(-1)).toEqual([999, 0])
    expect(out.some(([x, y]) => x === 500 && y === 100)).toBe(true)
    expect(out.some(([x, y]) => x === 250 && y === -100)).toBe(true)
    // x strictly increasing.
    expect(out.every((p, i) => i === 0 || p[0] > out[i - 1]![0])).toBe(true)
  })

  it('takes [x, y] pairs and leaves short input alone', () => {
    const pairs: [number, number][] = [[0, 1], [10, 2], [20, 3]]
    expect(lttb(pairs, 10)).toEqual(pairs)
    expect(lttb([], 10)).toEqual([])
    expect(lttbIndices([0, 1, 2, 3], [1, 2, 3, 4], 2)).toEqual([0, 3])
  })
})

describe('parseCsv', () => {
  it('quotes, escaped quotes, commas and newlines inside quotes, CRLF, numbers', () => {
    const t = parseCsv('name,"amount, VND",note\r\n"Bob ""B""",1200,"line1\nline2"\r\nAnn,-3.5e2,\r\n\r\n')
    expect(t.columns).toEqual(['name', 'amount, VND', 'note'])
    expect(t.rows).toEqual([['Bob "B"', 1200, 'line1\nline2'], ['Ann', -350, '']])
  })

  it('tab-separated spreadsheet paste, ragged rows, BOM, blank headers', () => {
    const t = parseCsv('﻿Month\tSales\t\nJan\t10\nFeb\t20\t5\n')
    expect(t.columns).toEqual(['Month', 'Sales', 'Column 3'])
    expect(t.rows).toEqual([['Jan', 10, ''], ['Feb', 20, 5]])
    expect(parseCsv('a\tb,c\n1\t2').columns).toEqual(['a\tb', 'c'])
    expect(parseCsv('')).toEqual({ columns: [], rows: [] })
    // Text that only looks numeric partly stays text.
    expect(parseCsv('v\n12abc\n 7 ').rows).toEqual([['12abc'], [7]])
  })
})

describe('tableToChartData', () => {
  const table = {
    columns: ['Month', 'Team', 'Sales', 'Date'],
    rows: [
      ['Jan', 'A', 10, '2026-01-03'],
      ['Jan', 'B', 5, '2026-01-20'],
      ['Feb', 'A', 7, '2026-02-02'],
      ['Feb', 'A', 'x', '2026-02-10'],
      ['Mar', 'B', 2, '2026-03-01'],
    ] as (string | number)[][],
  }
  it('groups by x with each fn', () => {
    const r = tableToChartData(table, { chart: 'bar', x: { prop: 'Month' }, y: [{ prop: 'Sales', fn: 'sum' }, { fn: 'count' }, { prop: 'Sales', fn: 'avg' }, { prop: 'Sales', fn: 'min' }, { prop: 'Sales', fn: 'max' }] })
    expect(r.x).toEqual(['Jan', 'Feb', 'Mar'])
    expect(r.series.map(s => s.name)).toEqual(['Sales', 'count', 'Sales (avg)', 'Sales (min)', 'Sales (max)'])
    expect(r.series.map(s => s.data)).toEqual([[15, 7, 2], [2, 2, 1], [7.5, 7, 2], [5, 7, 2], [10, 7, 2]])
  })
  it('splits series by a column and buckets dates', () => {
    const r = tableToChartData(table, { chart: 'line', x: { prop: 'Date', bucket: 'month' }, y: [{ prop: 'Sales', fn: 'sum' }], series: 'Team' })
    expect(r.x).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(r.series).toEqual([{ name: 'A', data: [10, 7, 0] }, { name: 'B', data: [5, 0, 2] }])
  })
  it('numeric x is sorted; unknown x column gives no data', () => {
    const r = tableToChartData({ columns: ['n', 'v'], rows: [[3, 1], [1, 2], [2, 3]] }, { chart: 'scatter', x: { prop: 'n' }, y: [{ prop: 'v', fn: 'sum' }] })
    expect(r.x).toEqual([1, 2, 3])
    expect(r.series[0]!.data).toEqual([2, 3, 1])
    expect(tableToChartData(table, { chart: 'bar', x: { prop: 'nope' }, y: [] })).toEqual({ x: [], series: [] })
  })
})

describe('readChartTheme', () => {
  it('reads --me-chart-* vars, with literal fallbacks', () => {
    const el = document.createElement('div')
    el.style.setProperty('--me-chart-series1', '#abcdef')
    el.style.setProperty('--me-chart-font-size', '13px')
    document.body.appendChild(el)
    const t = readChartTheme(el)
    expect(t.series[0]).toBe('#abcdef')
    expect(t.series).toHaveLength(9)
    expect(t.series[1]).toMatch(/^#/)
    expect(t.fontSize).toBe(13)
    expect(t.tooltipBg).toMatch(/^#/)
    el.remove()
  })
})
