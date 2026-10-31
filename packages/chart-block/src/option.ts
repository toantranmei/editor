import { lttb, lttbIndices, MAX_POINTS } from './lttb'
import type { ChartConfig, ChartSeriesData, ChartTheme } from './types'

/** Above this many drawn points, animations are off (they cost more than they show). */
export const ANIMATION_LIMIT = 2000

type Option = Record<string, any>

const finite = (v: number) => (Number.isFinite(v) ? v : 0)

/**
 * ECharts option for chart data + view config, colored with `theme`. Line and area charts with more than 5000
 * points are downsampled with LTTB (numeric x: per series; category x: the union of each series' picks, so
 * categories stay aligned). Pure: no ECharts import.
 */
export function buildChartOption(data: ChartSeriesData, config: ChartConfig, theme: ChartTheme): Option {
  const kind = config.chart
  const textStyle = { color: theme.text, fontFamily: theme.fontFamily, fontSize: theme.fontSize }
  const tooltip = {
    backgroundColor: theme.tooltipBg,
    borderColor: theme.tooltipBorder,
    textStyle: { color: theme.tooltipText, fontFamily: theme.fontFamily, fontSize: theme.fontSize },
  }
  const legend = { show: data.series.length > 1 || kind === 'pie' || kind === 'donut', type: 'scroll', top: 0, textStyle, pageTextStyle: textStyle }
  const base: Option = { color: theme.series, textStyle, backgroundColor: 'transparent' }

  if (kind === 'pie' || kind === 'donut') {
    const slices = data.x.map((name, i) => ({ name: String(name), value: data.series.reduce((sum, s) => sum + finite(s.data[i] ?? 0), 0) }))
    return {
      ...base,
      animation: slices.length <= ANIMATION_LIMIT,
      tooltip: { ...tooltip, trigger: 'item' },
      legend,
      series: [{
        type: 'pie',
        radius: kind === 'donut' ? ['45%', '70%'] : '70%',
        center: ['50%', '55%'],
        data: slices,
        label: { color: theme.text, fontFamily: theme.fontFamily, fontSize: theme.fontSize },
        itemStyle: { borderColor: theme.tooltipBg, borderWidth: 1 },
      }],
    }
  }

  const numericX = data.x.length > 0 && data.x.every(v => typeof v === 'number')
  const axisLine = { lineStyle: { color: theme.axis } }
  const axisLabel = { color: theme.text, fontFamily: theme.fontFamily, fontSize: theme.fontSize, hideOverlap: true }
  const valueAxis = { type: 'value', axisLine: { ...axisLine, show: false }, axisLabel, splitLine: { lineStyle: { color: theme.splitLine } } }
  const grid = { left: 8, right: 16, top: legend.show ? 32 : 16, bottom: 8, containLabel: true }

  if (kind === 'scatter') {
    const series = data.series.map(s => ({
      type: 'scatter',
      name: s.name,
      symbolSize: 6,
      large: s.data.length > ANIMATION_LIMIT,
      data: s.data.map((y, i) => [numericX ? data.x[i] : i, y]),
    }))
    const points = data.series.reduce((n, s) => n + s.data.length, 0)
    return {
      ...base,
      animation: points <= ANIMATION_LIMIT,
      tooltip: { ...tooltip, trigger: 'item' },
      legend,
      grid,
      xAxis: numericX
        ? { ...valueAxis, axisLine }
        : { type: 'category', data: data.x.map(String), axisLine, axisLabel, axisTick: { show: false } },
      yAxis: valueAxis,
      series,
    }
  }

  // bar / line / area
  const line = kind === 'line' || kind === 'area'
  const stack = config.stacked ? 'total' : undefined
  const n = data.x.length
  const style = (s: { name: string }) => ({
    type: line ? 'line' : 'bar',
    name: s.name,
    stack,
    ...(line ? { showSymbol: n <= 100, symbolSize: 4, smooth: false, lineStyle: { width: 2 } } : { barMaxWidth: 48 }),
    ...(kind === 'area' ? { areaStyle: { opacity: config.stacked ? 0.6 : 0.25 } } : {}),
    emphasis: { focus: 'series' },
  })

  let x: Array<string | number> = data.x
  let seriesData: unknown[][] = data.series.map(s => s.data)
  let xAxisType: 'category' | 'value' = 'category'
  if (line && n > MAX_POINTS) {
    const budget = Math.max(3, Math.floor(MAX_POINTS / Math.max(1, data.series.length)))
    if (numericX && !config.stacked) {
      // Each series on its own x values.
      xAxisType = 'value'
      seriesData = data.series.map(s => lttb(s.data.map((y, i) => [data.x[i] as number, finite(y)] as [number, number]), budget))
    }
    else {
      // Shared categories (and stacks need aligned points): keep the union of every series' picks.
      const xs = Array.from({ length: n }, (_, i) => i)
      const keep = new Set<number>()
      for (const s of data.series) for (const i of lttbIndices(xs, s.data, budget)) keep.add(i)
      const indices = [...keep].sort((a, b) => a - b)
      x = indices.map(i => data.x[i]!)
      seriesData = data.series.map(s => indices.map(i => s.data[i] ?? 0))
    }
  }
  const drawn = seriesData.reduce((sum, d) => sum + d.length, 0)

  return {
    ...base,
    animation: drawn <= ANIMATION_LIMIT,
    tooltip: { ...tooltip, trigger: 'axis', axisPointer: { type: line ? 'line' : 'shadow' } },
    legend,
    grid,
    xAxis: xAxisType === 'value'
      ? { ...valueAxis, axisLine, scale: true }
      : { type: 'category', data: x.map(String), boundaryGap: !line, axisLine, axisLabel, axisTick: { show: false } },
    yAxis: valueAxis,
    series: data.series.map((s, i) => ({ ...style(s), data: seriesData[i] })),
  }
}
