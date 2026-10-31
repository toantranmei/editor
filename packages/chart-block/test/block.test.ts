import { Editor, EditorContent, type JSONContent } from '@tiptap/vue-3'
import { createExtensions, text } from '@toantranmei/editor'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick } from 'vue'
import { CHART_NODE, chartBlock, DatabaseChart, messages, SAMPLE_TABLE } from '../src'

const chartInstance = { setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() }
const init = vi.fn(() => chartInstance)
vi.mock('../src/echarts-setup', () => ({ init }))

const editors: Editor[] = []
const wrappers: VueWrapper[] = []
afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount()
  for (const e of editors.splice(0)) e.destroy()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

function setup(content?: JSONContent, locale: 'vi' | 'en' | 'zh' = 'en', editable = true) {
  const editor = new Editor({
    extensions: createExtensions({ blocks: [text, chartBlock], locale }),
    content: content ?? { type: 'doc', content: [{ type: 'paragraph' }] },
    editable,
  })
  editors.push(editor)
  const wrapper = mount({ render: () => h(EditorContent, { editor }) }, { attachTo: document.body })
  wrappers.push(wrapper)
  return { editor, wrapper }
}

const chartDoc: JSONContent = {
  type: 'doc',
  content: [{
    type: CHART_NODE,
    attrs: {
      data: { columns: ['k', 'v'], rows: [['a', 1], ['b', 2]] },
      config: { chart: 'line', x: { prop: 'k' }, y: [{ prop: 'v', fn: 'sum' }], stacked: false },
    },
  }],
}

describe('chart block', () => {
  it('is a block definition with a slash item and vi/en/zh strings', () => {
    expect(chartBlock.nodes).toEqual([CHART_NODE])
    expect(chartBlock.items.map(i => i.id)).toEqual(['chart'])
    expect(chartBlock.items[0]!.keywords).toEqual(expect.arrayContaining(['chart', 'biểu đồ', '图表']))
    expect(chartBlock.messages?.vi?.blocks?.chart?.title).toBe('Biểu đồ')
    expect(chartBlock.messages?.zh?.blocks?.chart?.title).toBe('图表')
    expect(messages.zh.edit).toBe('编辑数据')
  })

  it('insertChart adds a sample chart; JSON round-trips', () => {
    const { editor } = setup()
    expect(editor.commands.insertChart()).toBe(true)
    const node = editor.getJSON().content!.find(n => n.type === CHART_NODE)!
    expect(node.attrs!.data).toEqual(SAMPLE_TABLE)
    expect(node.attrs!.config.chart).toBe('bar')
    const again = setup(editor.getJSON()).editor
    expect(again.getJSON()).toEqual(editor.getJSON())
  })

  it('round-trips HTML (data and config as JSON attributes, table for readers)', () => {
    const { editor } = setup(chartDoc)
    const html = editor.getHTML()
    expect(html).toContain('data-type="chart"')
    expect(html).toContain('<td>a</td>')
    const parsed = setup().editor
    parsed.commands.setContent(html)
    const node = parsed.getJSON().content!.find(n => n.type === CHART_NODE)!
    expect(node.attrs!.data).toEqual(chartDoc.content![0]!.attrs!.data)
    expect(node.attrs!.config).toEqual(chartDoc.content![0]!.attrs!.config)
  })

  it('node view loads ECharts lazily and draws the table', async () => {
    const { wrapper } = setup(chartDoc)
    await flushPromises()
    await nextTick()
    expect(init).toHaveBeenCalledTimes(1)
    const option = chartInstance.setOption.mock.calls.at(-1)![0] as any
    expect(option.series[0]).toMatchObject({ type: 'line', name: 'v', data: [1, 2] })
    expect(option.xAxis.data).toEqual(['a', 'b'])
    expect(wrapper.find('.me-chart').exists()).toBe(true)
  })

  it('editing cells, config and CSV paste update the node attrs', async () => {
    const { editor, wrapper } = setup(chartDoc)
    await flushPromises()
    await wrapper.find('.me-chart-toggle').trigger('click')
    const cell = wrapper.findAll('input.me-chart-cell').find(i => i.attributes('aria-label') === 'Row 2, column v')!
    await cell.setValue('42')
    const attrs = () => editor.getJSON().content![0]!.attrs!
    expect(attrs().data.rows[1]).toEqual(['b', 42])

    await wrapper.find('select.me-chart-select').setValue('pie')
    expect(attrs().config.chart).toBe('pie')

    const buttons = () => wrapper.findAll('button')
    await buttons().find(b => b.text() === 'Paste CSV')!.trigger('click')
    await wrapper.find('textarea').setValue('City,Pop,Area\nHanoi,8,3359\nHue,1,265')
    await buttons().find(b => b.text() === 'Apply')!.trigger('click')
    expect(attrs().data).toEqual({ columns: ['City', 'Pop', 'Area'], rows: [['Hanoi', 8, 3359], ['Hue', 1, 265]] })
    expect(attrs().config).toMatchObject({ x: { prop: 'City' }, y: [{ prop: 'Pop', fn: 'sum' }, { prop: 'Area', fn: 'sum' }] })

    await buttons().find(b => b.text() === 'Add row')!.trigger('click')
    expect(attrs().data.rows).toHaveLength(3)
  })

  it('pasting tab-separated cells into a cell fills and grows the grid', async () => {
    const { editor, wrapper } = setup(chartDoc)
    await flushPromises()
    await wrapper.find('.me-chart-toggle').trigger('click')
    const cell = wrapper.findAll('input.me-chart-cell').find(i => i.attributes('aria-label') === 'Row 2, column k')!
    const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
    Object.defineProperty(event, 'clipboardData', { value: { getData: () => 'x\t9\textra\ny\t10' } })
    cell.element.dispatchEvent(event)
    await nextTick()
    const data = editor.getJSON().content![0]!.attrs!.data
    expect(data.columns).toHaveLength(3)
    expect(data.rows).toEqual([['a', 1, ''], ['x', 9, 'extra'], ['y', 10, '']])
  })

  it('read-only editor has no edit toggle; zh strings', async () => {
    const { wrapper } = setup(chartDoc, 'zh', false)
    await flushPromises()
    expect(wrapper.find('.me-chart-toggle').exists()).toBe(false)
  })
})

describe('DatabaseChart', () => {
  it('shows the empty text without loading ECharts, then draws when data arrives; disposes', async () => {
    const w = mount(DatabaseChart, { props: { data: { x: [], series: [] }, config: { chart: 'bar', x: { prop: 'p' }, y: [{ fn: 'count' }] }, emptyText: 'Nothing' }, attachTo: document.body })
    await flushPromises()
    expect(w.text()).toContain('Nothing')
    expect(init).not.toHaveBeenCalled()
    await w.setProps({ data: { x: ['a'], series: [{ name: 'n', data: [3] }] } })
    await flushPromises()
    expect(init).toHaveBeenCalledTimes(1)
    expect((chartInstance.setOption.mock.calls.at(-1)![0] as any).series[0].data).toEqual([3])
    await w.setProps({ config: { chart: 'pie', x: { prop: 'p' }, y: [{ fn: 'count' }] } })
    expect((chartInstance.setOption.mock.calls.at(-1)![0] as any).series[0].type).toBe('pie')
    w.unmount()
    expect(chartInstance.dispose).toHaveBeenCalled()
  })
})
