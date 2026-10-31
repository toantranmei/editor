import { ChartColumn } from '@lucide/vue'
import { defineBlock } from '@toantranmei/editor'
import { ChartNode } from './node'
import type { ChartBlockOptions } from './types'

/**
 * Standalone chart for `<MeiEditor :blocks>`: `chartBlock` (or `chartBlock.configure({ messages, initial })`).
 * Slash menu: "Chart". ECharts loads only when a chart is on screen.
 */
export const chartBlock = defineBlock<ChartBlockOptions>({
  name: 'chart',
  defaults: { messages: null, initial: null },
  nodes: ['chart'],
  extensions: o => [ChartNode.configure(o)],
  items: () => [{
    id: 'chart',
    icon: ChartColumn,
    group: 'advanced',
    keywords: ['chart', 'graph', 'bar', 'line', 'pie', 'plot', 'csv', 'bieu do', 'biểu đồ', 'do thi', 'đồ thị', '图表', '柱状图', '折线图', '饼图'],
    insert: c => c.insertChart(),
  }],
  messages: {
    vi: { blocks: { chart: { title: 'Biểu đồ', description: 'Biểu đồ cột, đường, tròn… từ bảng dữ liệu hoặc CSV.' } } },
    en: { blocks: { chart: { title: 'Chart', description: 'Bar, line, pie… chart from a data table or CSV.' } } },
    zh: { blocks: { chart: { title: '图表', description: '由数据表或 CSV 生成柱状图、折线图、饼图等。' } } },
  },
})
