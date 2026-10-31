export type EChartsModule = typeof import('./echarts-setup')

let loading: Promise<EChartsModule> | null = null

/** Loads ECharts once (a separate chunk). */
export function loadECharts(): Promise<EChartsModule> {
  loading ??= import('./echarts-setup').catch((error) => {
    loading = null
    throw error
  })
  return loading
}
