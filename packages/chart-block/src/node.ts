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
    const base = blockNodeView(ChartView)
    // The toolbar and the data editor own their events and DOM selection: otherwise a click there becomes a
    // NodeSelection of the chart and typing replaces the block. The chart itself still selects the block on click.
    return ((props: Parameters<typeof base>[0]) => {
      const view = base(props) as ReturnType<typeof base> & {
        dom: HTMLElement
        stopEvent: (e: Event) => boolean
        ignoreMutation: (m: MutationRecord | { type: 'selection', target: globalThis.Node }) => boolean
      }
      const inside = (node: globalThis.Node | null | undefined) => {
        const el = node && (node.nodeType === 1 ? node as globalThis.Element : node.parentElement)
        return !!el && view.dom.contains(el) && !!el.closest('.me-chart-bar, .me-chart-editor')
      }
      const stop = view.stopEvent?.bind(view)
      view.stopEvent = (event: Event) => (event.type !== 'mousemove' && inside(event.target as globalThis.Node | null)) || !!stop?.(event)
      const ignore = view.ignoreMutation?.bind(view)
      view.ignoreMutation = mutation => inside(mutation.target) || (ignore ? ignore(mutation) : mutation.type !== 'selection')
      return view
    }) as typeof base
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
