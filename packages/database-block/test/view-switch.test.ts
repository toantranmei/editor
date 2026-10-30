import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import DatabaseView from '../src/DatabaseView.vue'
import { createMemorySource, sampleDatabase } from '../src/memory-source'

// The real chart needs a canvas; only what the view asks the source matters here.
vi.mock('@toantranmei/chart-block', () => ({ DatabaseChart: defineComponent({ render: () => h('div', { class: 'stub-chart' }) }) }))

const wrappers: VueWrapper[] = []
afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount()
  document.body.innerHTML = ''
})

const settle = async () => {
  for (let i = 0; i < 4; i++) {
    await flushPromises()
    await new Promise(r => setTimeout(r, 0))
    await nextTick()
  }
}

// KS-BUG-12: on a tab switch the old chart / pivot view's watcher fired with the new view (no
// axes) before it unmounted, so the source was asked for a chart / pivot of a table view.
describe('switching away from chart / pivot views', () => {
  it('never asks the source for a chart or pivot of a view without that config', async () => {
    const source = createMemorySource(sampleDatabase(50, { databaseId: 'db1' }))
    const viewId = ref('v-chart')
    const wrapper = mount({ render: () => h(DatabaseView, { 'source': source, 'databaseId': 'db1', 'viewId': viewId.value, 'locale': 'en', 'onUpdate:viewId': (id: string) => (viewId.value = id) }) }, { attachTo: document.body })
    wrappers.push(wrapper)
    await settle()
    // Like a user: click the tabs.
    for (const id of ['v-table', 'v-pivot', 'v-table', 'v-chart', 'v-pivot', 'v-board']) {
      await wrapper.find(`.me-db-tab[data-view-id="${id}"]`).trigger('click')
      await settle()
      expect(wrapper.find('.me-db-tab.is-active').attributes('data-view-id')).toBe(id)
    }
    const views = new Map(source.views.value.map(v => [v.id, v]))
    const asked = source.log.filter(l => l.method === 'chart' || l.method === 'pivot').map(l => [l.method, views.get(l.args[0] as string)?.type])
    expect(asked.length).toBeGreaterThan(0)
    for (const [method, type] of asked) expect(type, `${method} asked for a ${type} view`).toBe(method)
  })

  it('a chart without an x axis is not queried', async () => {
    const source = createMemorySource(sampleDatabase(10, { databaseId: 'db1' }))
    const chart = source.views.value.find(v => v.id === 'v-chart')!
    chart.config = { ...chart.config, x: undefined }
    const wrapper = mount({ render: () => h(DatabaseView, { source, databaseId: 'db1', viewId: 'v-chart', locale: 'en' }) }, { attachTo: document.body })
    wrappers.push(wrapper)
    await settle()
    expect(wrapper.text()).not.toContain('Loading')
    expect(source.log.filter(l => l.method === 'chart')).toHaveLength(0)
  })

  it('a pivot without rows and columns still shows the grand total', async () => {
    const source = createMemorySource(sampleDatabase(10, { databaseId: 'db1' }))
    const pivot = source.views.value.find(v => v.id === 'v-pivot')!
    pivot.config = { ...pivot.config, rows: [], cols: [] }
    const wrapper = mount({ render: () => h(DatabaseView, { source, databaseId: 'db1', viewId: 'v-pivot', locale: 'en' }) }, { attachTo: document.body })
    wrappers.push(wrapper)
    await settle()
    expect(source.log.filter(l => l.method === 'pivot')).toHaveLength(1)
    expect(wrapper.find('.me-db-pivot-table').exists()).toBe(true)
  })

  it('a source that refuses a pivot without rows / columns gives the empty state, not an error', async () => {
    const source = createMemorySource(sampleDatabase(10, { databaseId: 'db1' }))
    const pivot = source.views.value.find(v => v.id === 'v-pivot')!
    pivot.config = { ...pivot.config, rows: [], cols: [] }
    source.pivot = async () => {
      throw new Error('View is missing rows/cols')
    }
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const wrapper = mount({ render: () => h(DatabaseView, { source, databaseId: 'db1', viewId: 'v-pivot', locale: 'en' }) }, { attachTo: document.body })
    wrappers.push(wrapper)
    await settle()
    expect(wrapper.text()).not.toContain('Loading')
    expect(error.mock.calls.flat().join(' ')).not.toContain('missing rows/cols')
    error.mockRestore()
  })
})
