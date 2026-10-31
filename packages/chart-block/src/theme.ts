import { componentTokens, primitiveTokens } from '@toantranmei/editor'
import type { ChartTheme } from './types'

const SERIES_KEYS = ['series1', 'series2', 'series3', 'series4', 'series5', 'series6', 'series7', 'series8', 'series9'] as const
type ChartTokenKey = keyof typeof componentTokens.chart

const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
const cssVar = (key: ChartTokenKey) => `--me-chart-${kebab(key)}`

/** Light-mode literal for a token that references another one (canvas can't use `var()`). */
function fallback(key: ChartTokenKey): string {
  const value: string = componentTokens.chart[key]
  const palette = /palette-(\w+)-text/.exec(value)?.[1] as keyof typeof primitiveTokens.tint | undefined
  if (palette && palette in primitiveTokens.tint) return primitiveTokens.tint[palette].lightText
  if (!value.startsWith('var(')) return value
  if (key === 'title' || key === 'tooltipText') return primitiveTokens.gray[800]
  if (key === 'text') return primitiveTokens.gray[500]
  if (key === 'axis' || key === 'splitLine' || key === 'tooltipBorder') return primitiveTokens.gray[200]
  if (key === 'tooltipBg') return primitiveTokens.white
  if (key === 'fontSize') return primitiveTokens.fontSize.xs
  if (key === 'fontFamily') return primitiveTokens.fontFamily.sans
  return primitiveTokens.gray[500]
}

/** Chart colors and fonts from the `--me-chart-*` tokens on `el` (follows light / dark and app overrides). */
export function readChartTheme(el?: Element | null): ChartTheme {
  const style = el && typeof getComputedStyle === 'function' ? getComputedStyle(el) : null
  const read = (key: ChartTokenKey) => style?.getPropertyValue(cssVar(key)).trim() || fallback(key)
  return {
    series: SERIES_KEYS.map(read),
    text: read('text'),
    title: read('title'),
    axis: read('axis'),
    splitLine: read('splitLine'),
    tooltipBg: read('tooltipBg'),
    tooltipText: read('tooltipText'),
    tooltipBorder: read('tooltipBorder'),
    fontSize: Number.parseFloat(read('fontSize')) || 12,
    fontFamily: read('fontFamily'),
  }
}
