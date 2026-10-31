/**
 * The only module that imports ECharts, per module (tree-shaken): the chart types and components the block uses,
 * canvas renderer. Loaded with `loadECharts()`, so pages without a chart never download it.
 */
import { BarChart, LineChart, PieChart, ScatterChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { type ECharts, init as initChart, use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'

export type { ECharts }

let registered = false

/** `echarts.init` with the block's modules registered (inside the call: the package is marked side-effect free). */
export function init(...args: Parameters<typeof initChart>): ECharts {
  if (!registered) {
    use([BarChart, LineChart, PieChart, ScatterChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])
    registered = true
  }
  return initChart(...args)
}
