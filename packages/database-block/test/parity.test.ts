import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick } from 'vue'
import DatabaseView from '../src/DatabaseView.vue'
import { createMemorySource, sampleDatabase } from '../src/memory-source'
import type { DatabaseBlockOptions } from '../src/types'
import { placeColumn, switchLayout } from '../src/util'

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
const popover = () => document.body.querySelector<HTMLElement>('.me-db-popover:last-of-type')!

async function setup(extra: Record<string, unknown> = {}, viewId = 'v-table', count = 40) {
  const opened: unknown[][] = []
  const source = createMemorySource(sampleDatabase(count, { databaseId: 'db1' }))
  const onOpenRow = vi.fn()
  const wrapper = mount({
    render: () => h(DatabaseView, { source, databaseId: 'db1', viewId, locale: 'en', onOpenRow, ...extra }),
  }, { attachTo: document.body })
  wrappers.push(wrapper)
  await settle()
  return { source, wrapper, opened, onOpenRow }
}
const view = (s: ReturnType<typeof createMemorySource>, id = 'v-table') => s.views.value.find(v => v.id === id)!

describe('title', () => {
  it('shows the source title inline and saves edits with setMeta', async () => {
    const { source, wrapper } = await setup()
    const input = wrapper.find<HTMLInputElement>('[data-db-title]')
    expect(input.element.value).toBe('Tasks')
    await input.trigger('focus')
    await input.setValue('Roadmap')
    await input.trigger('blur')
    expect(source.log.filter(l => l.method === 'setMeta').at(-1)!.args).toEqual([{ title: 'Roadmap' }])
    // A rename elsewhere shows up.
    source.setMeta({ title: 'From the host' })
    await settle()
    expect(input.element.value).toBe('From the host')
  })

  it('hides the block title on a full page unless showTitle is set', async () => {
    const { wrapper } = await setup({ full: true })
    expect(wrapper.find('[data-db-title]').exists()).toBe(false)
    const { wrapper: w2 } = await setup({ full: true, showTitle: true })
    expect(w2.find('[data-db-title]').exists()).toBe(true)
    const { wrapper: w3 } = await setup({ showTitle: false })
    expect(w3.find('[data-db-title]').exists()).toBe(false)
  })
})

describe('open modes', () => {
  it('passes the view mode to source.openRow and emits open-row', async () => {
    const { source, wrapper, onOpenRow } = await setup()
    const open = wrapper.find('.me-db-td.is-first .me-db-open')
    expect(open.attributes('data-open-mode')).toBe('side_peek')
    await open.trigger('click')
    expect(source.log.filter(l => l.method === 'openRow').at(-1)!.args).toEqual(['r1', 'side_peek'])
    expect(onOpenRow).toHaveBeenLastCalledWith('r1', 'side_peek', expect.anything())

    // "Open pages in" from the New menu.
    await wrapper.find('[data-tool="new-more"]').trigger('click')
    await settle()
    popover().querySelector<HTMLElement>('[data-open-mode="center_peek"]')!.click()
    await settle()
    expect(view(source).config.open_in).toBe('center_peek')
    await wrapper.find('.me-db-td.is-first .me-db-open').trigger('click')
    expect(source.log.filter(l => l.method === 'openRow').at(-1)!.args).toEqual(['r1', 'center_peek'])
    // Cmd / Ctrl-click asks for a full page.
    await wrapper.find('.me-db-td.is-first .me-db-open').trigger('click', { metaKey: true })
    expect(source.log.filter(l => l.method === 'openRow').at(-1)!.args).toEqual(['r1', 'full_page'])
  })

  it('calls options.openRow instead of the source when given', async () => {
    const openRow = vi.fn()
    const options: Partial<DatabaseBlockOptions> = { openRow }
    const { source, wrapper } = await setup({ options }, 'v-board')
    await wrapper.find('.me-db-card[data-row-id]').trigger('click')
    expect(openRow).toHaveBeenCalledWith('db1', expect.any(String), 'side_peek', expect.anything())
    expect(source.log.some(l => l.method === 'openRow')).toBe(false)
  })
})

describe('toolbar and view options', () => {
  it('switches layout from View options and keeps shared config', async () => {
    const { source, wrapper } = await setup()
    await wrapper.find('[data-tool="settings"]').trigger('click')
    await settle()
    popover().querySelector<HTMLElement>('[data-layout="board"]')!.click()
    await settle()
    const v = view(source)
    expect(v.type).toBe('board')
    expect(v.config.group_by?.prop).toBe('status')
    expect(v.config.aggregates).toEqual({ estimate: 'sum', budget: 'avg' })
    expect(wrapper.find('.me-db').attributes('data-view-type')).toBe('board')
  })

  it('New adds to the top from its menu', async () => {
    const { source, wrapper } = await setup()
    await wrapper.find('[data-tool="new-more"]').trigger('click')
    await settle()
    popover().querySelector<HTMLElement>('[data-new="top"]')!.click()
    await settle()
    expect(source.log.filter(l => l.method === 'createRow').at(-1)!.args[0]).toMatchObject({ after: null })
    expect(source.all()[0]!.values.name).toBeUndefined()
  })
})

describe('table columns', () => {
  const openMenu = async (wrapper: VueWrapper, id: string) => {
    await wrapper.find(`.me-db-th[data-col-id="${id}"]`).trigger('click')
    await settle()
    return popover()
  }

  it('freezes, wraps, duplicates and inserts columns from the header menu', async () => {
    const { source, wrapper } = await setup()
    // Default: the title is frozen.
    expect(wrapper.findAll('.me-db-th.is-frozen')).toHaveLength(1)
    ;(await openMenu(wrapper, 'status')).querySelector<HTMLElement>('[data-action="freeze"]')!.click()
    await settle()
    expect(view(source).config.freeze).toBe(2)
    expect(wrapper.findAll('.me-db-th.is-frozen')).toHaveLength(2)

    ;(await openMenu(wrapper, 'status')).querySelector<HTMLElement>('[data-action="wrap"]')!.click()
    await settle()
    expect(view(source).config.wraps).toEqual({ status: true })
    expect(wrapper.find('.me-db-table').classes()).toContain('is-wrap')
    expect(wrapper.find('.me-db-td.is-wrap').exists()).toBe(true)

    ;(await openMenu(wrapper, 'status')).querySelector<HTMLElement>('[data-action="duplicate"]')!.click()
    await settle()
    const copy = source.props.value.at(-1)!
    expect(copy).toMatchObject({ name: 'Status (copy)', type: 'status' })
    expect(view(source).config.visible!.slice(0, 2)).toEqual(['status', copy.id])

    ;(await openMenu(wrapper, 'status')).querySelector<HTMLElement>('[data-action="insert-left"]')!.click()
    await settle()
    popover().querySelector<HTMLElement>('[data-type="number"]')!.click()
    await settle()
    popover().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'))
    await settle()
    const added = source.props.value.at(-1)!
    expect(added.type).toBe('number')
    expect(view(source).config.visible!.slice(0, 3)).toEqual([added.id, 'status', copy.id])
  })

  it('checks a range with Shift-click and deletes the selection', async () => {
    const { source, wrapper } = await setup()
    const check = (i: number) => wrapper.find(`[data-row="${i}"] .me-db-row-check`)
    await check(1).trigger('click')
    await check(4).trigger('click', { shiftKey: true })
    expect(wrapper.find('.me-db-selection-bar').text()).toContain('4 selected')
    await wrapper.find('[data-bulk="delete"]').trigger('click')
    expect(source.log.filter(l => l.method === 'deleteRows').at(-1)!.args[0]).toEqual(['r2', 'r3', 'r4', 'r5'])
  })
})

describe('helpers', () => {
  it('places a column next to another and switches layouts', () => {
    const props = sampleDatabase(1, { databaseId: 'db' }).props
    const v = { id: 'v', name: 'T', type: 'table' as const, position: 'a0', config: { visible: ['status', 'priority'] } }
    expect(placeColumn(v, props, 'x', 'status', 'right')).toEqual(['status', 'x', 'priority'])
    expect(placeColumn(v, props, 'x', 'status', 'left')).toEqual(['x', 'status', 'priority'])
    expect(placeColumn(v, props, 'x', 'name', 'right')).toEqual(['x', 'status', 'priority'])
    expect(switchLayout({ ...v, config: { sorts: [{ prop: 'due', dir: 'asc' }] } }, 'calendar', props)).toEqual({ date_prop: 'due', sorts: [{ prop: 'due', dir: 'asc' }] })
  })
})
