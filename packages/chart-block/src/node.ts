import { mergeAttributes, Node } from '@tiptap/core'
import { blockNodeView } from '@toantranmei/editor'
import ChartView from './ChartView.vue'
import { clone, normalizeConfig, normalizeTable, SAMPLE_CONFIG, SAMPLE_TABLE } from './defaults'
import type { ChartBlockOptions, ChartConfig, ChartTable } from './types'

export const CHART_NODE = 'chart'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    chart: {
      /** Inserts a chart block (default: the `initial` option, else a sample table). */
      insertChart: (attrs?: { data?: ChartTable, config?: ChartConfig }) => ReturnType
    }
  }
}

const json = (name: string, normalize: (v: unknown) => unknown, fallback: unknown) => ({
  default: fallback,
  parseHTML: (el: HTMLElement) => {
    const raw = el.getAttribute(name)
    if (!raw) return clone(fallback)
    try {
      return normalize(JSON.parse(raw))
    }
    catch {
      return clone(fallback)
    }
  },
  renderHTML: (attrs: Record<string, any>) => ({ [name]: JSON.stringify(attrs[name === 'data-chart-data' ? 'data' : 'config']) }),
})

/** Standalone chart: `{ data: { columns, rows }, config }` (contract 1.7), edited in place. */
export const ChartNode = Node.create<ChartBlockOptions>({
  name: CHART_NODE,
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addOptions: () => ({ messages: null, initial: null }),

  addAttributes() {
    return {
      data: json('data-chart-data', normalizeTable, SAMPLE_TABLE),
      config: json('data-chart-config', normalizeConfig, SAMPLE_CONFIG),
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="chart"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    // Read-only HTML: the table itself, so exports keep the numbers.
    const table = normalizeTable(node.attrs.data)
    return ['div', mergeAttributes({ 'data-type': 'chart', 'class': 'me-chart-block' }, HTMLAttributes), ['table', {},
      ['thead', {}, ['tr', {}, ...table.columns.map(c => ['th', {}, c])]],
      ['tbody', {}, ...table.rows.map(r => ['tr', {}, ...r.map(c => ['td', {}, String(c)])])],
    ]]
  },

  renderText({ node }) {
    const table = normalizeTable(node.attrs.data)
    return [table.columns, ...table.rows].map(r => r.join('\t')).join('\n')
  },

  addNodeView() {
    return blockNodeView(ChartView)
  },

  addCommands() {
    return {
      insertChart: attrs => ({ commands }) => {
        const initial = this.options.initial ?? { data: SAMPLE_TABLE, config: SAMPLE_CONFIG }
        return commands.insertContent({
          type: CHART_NODE,
          attrs: { data: clone(attrs?.data ?? initial.data), config: clone(attrs?.config ?? initial.config) },
        })
      },
    }
  },
})
