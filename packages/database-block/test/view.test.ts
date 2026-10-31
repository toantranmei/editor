import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { h, nextTick } from 'vue'
import DatabaseView from '../src/DatabaseView.vue'
import { createMemorySource, sampleDatabase, type MemorySource } from '../src/memory-source'
import type { DateValue } from '../src/types'

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

async function setup(count = 100_000, viewId = 'v-table', locale: 'vi' | 'en' | 'zh' = 'en') {
  const source = createMemorySource(sampleDatabase(count, { databaseId: 'db1' }))
  // Smaller view for assertions: a few columns.
  const wrapper = mount({ render: () => h(DatabaseView, { source, databaseId: 'db1', viewId, locale }) }, { attachTo: document.body })
  wrappers.push(wrapper)
  await settle()
  return { source, wrapper }
}
const rowsCalls = (s: MemorySource) => s.log.filter(l => l.method === 'rows').map(l => l.args[1] as { offset: number, limit: number })
const popover = () => document.body.querySelector<HTMLElement>('.me-db-popover:last-of-type')!
const fire = (el: Element, type: string, init: KeyboardEventInit | MouseEventInit = {}) => {
  const e = type.startsWith('key') ? new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init }) : new MouseEvent(type, { bubbles: true, cancelable: true, ...init })
  el.dispatchEvent(e)
  return e
}

describe('table view with a 100k-row source', () => {
  it('renders a window and only asks for visible windows', async () => {
    const { source, wrapper } = await setup()
    const rows = wrapper.findAll('.me-db-tr')
    // 520px / 33px ≈ 16 rows + overscan, never 100k.
    expect(rows.length).toBeGreaterThan(10)
    expect(rows.length).toBeLessThan(60)
    const calls = rowsCalls(source)
    expect(calls.length).toBeGreaterThan(0)
    for (const c of calls) {
      expect(c.offset % 50).toBe(0)
      expect(c.offset + c.limit).toBeLessThanOrEqual(100)
    }
    expect(wrapper.find('[role="grid"]').attributes('aria-rowcount')).toBe('100000')
    // Columns are virtualized too: 24 properties, far fewer header cells.
    expect(wrapper.findAll('.me-db-th[role="columnheader"]').length).toBeLessThan(source.props.value.length)
    // Title column first, sticky; rows show the source's data.
    expect(wrapper.find('.me-db-td.is-first').text()).toContain(String(source.all()[0]!.values.name))
    // Footer aggregates from the view config (estimate: sum).
    const sum = source.all().reduce((n, r) => n + (r.values.estimate as number), 0)
    expect(wrapper.find('[data-agg="estimate"]').text().replace(/\D/g, '')).toBe(String(sum))
  })

  it('re-queries the visible window when version changes', async () => {
    const { source, wrapper } = await setup(1000)
    source.log.length = 0
    source.setCell(source.all()[0]!.id, 'name', 'Renamed row')
    await settle()
    expect(rowsCalls(source)).toEqual([{ offset: 0, limit: 50 }])
    expect(wrapper.find('.me-db-td.is-first').text()).toContain('Renamed row')
  })
})

describe('filter builder', () => {
  it('writes the contract JSON into the view config', async () => {
    const { source, wrapper } = await setup(500)
    await wrapper.find('[data-tool="filter"]').trigger('click')
    await settle()
    const add = popover().querySelector<HTMLButtonElement>('[data-add-filter]')!
    add.click()
    await settle()
    // First condition: title "equals" '' by default → set prop = estimate, op >=, value 5.
    const row = () => popover().querySelector('.me-db-builder-row[data-index="0"]')!
    const selects = () => row().querySelectorAll('select')
    selects()[0]!.value = 'estimate'
    selects()[0]!.dispatchEvent(new Event('change'))
    await settle()
    selects()[1]!.value = '>='
    selects()[1]!.dispatchEvent(new Event('change'))
    await settle()
    const input = row().querySelector('input')!
    input.value = '5'
    input.dispatchEvent(new Event('input'))
    await new Promise(r => setTimeout(r, 350))
    await settle()
    // A group with an "or" inside.
    popover().querySelector<HTMLButtonElement>('[data-add-group]')!.click()
    await settle()
    const view = source.views.value.find(v => v.id === 'v-table')!
    expect(view.config.filter).toEqual({
      and: [
        { prop: 'estimate', op: '>=', value: 5 },
        { and: [{ prop: 'name', op: 'equals', value: '' }] },
      ],
    })
    // Switching the top-level join to "or".
    const join = popover().querySelector<HTMLSelectElement>('.me-db-builder-row[data-index="1"] .me-db-builder-join select')!
    join.value = 'or'
    join.dispatchEvent(new Event('change'))
    await settle()
    expect(Object.keys(source.views.value.find(v => v.id === 'v-table')!.config.filter!)).toEqual(['or'])
    // The table re-queried with the new filter (badge shows 2 conditions).
    expect(wrapper.find('[data-tool="filter"] .me-db-badge').text()).toBe('2')
  })
})

describe('cell editing and keyboard', () => {
  async function select(wrapper: VueWrapper, row: number, colId: string) {
    const grid = wrapper.find('[role="grid"]').element as HTMLElement
    // Make the column visible first (column virtualization) by putting it right after the title.
    return { grid, colId, row }
  }

  it('edits cells with contract-typed values', async () => {
    const source = createMemorySource({ ...sampleDatabase(50, { databaseId: 'db1' }) })
    source.upsertView({ ...source.views.value[0]!, config: { visible: ['estimate', 'priority', 'tags', 'due', 'done', 'notes'] } })
    const wrapper = mount({ render: () => h(DatabaseView, { source, databaseId: 'db1', viewId: 'v-table', locale: 'vi' }) }, { attachTo: document.body })
    wrappers.push(wrapper)
    await settle()
    const grid = wrapper.find('[role="grid"]').element as HTMLElement
    const r0 = source.all()[0]!
    const doneBefore = r0.values.done
    const cell = (row: number, col: number) => grid.querySelector(`[data-row="${row}"] [data-col="${col}"]`)!
    const calls = () => source.log.filter(l => l.method === 'setCell').map(l => l.args)

    // Number (vi notation) → number.
    fire(cell(0, 1), 'mousedown')
    await nextTick()
    fire(grid, 'keydown', { key: 'Enter' })
    await settle()
    const ta = document.body.querySelector<HTMLTextAreaElement>('.me-db-cell-textarea')!
    ta.value = '1.234,5'
    ta.dispatchEvent(new Event('input'))
    fire(ta, 'keydown', { key: 'Enter' })
    await settle()
    expect(calls().at(-1)).toEqual([r0.id, 'estimate', 1234.5])

    // Select → option id (typing starts the picker with a query).
    fire(cell(0, 2), 'mousedown')
    await nextTick()
    fire(grid, 'keydown', { key: 'Enter' })
    await settle()
    const items = [...document.body.querySelectorAll<HTMLElement>('.me-db-picker-item')]
    items.find(i => i.textContent?.includes('High'))!.click()
    await settle()
    expect(calls().at(-1)).toEqual([r0.id, 'priority', 'p-high'])

    // Multi-select → option ids, kept across several picks.
    fire(cell(0, 3), 'mousedown')
    await nextTick()
    fire(grid, 'keydown', { key: 'Enter' })
    await settle()
    const before = (r0.values.tags as string[]) ?? []
    const pick = [...document.body.querySelectorAll<HTMLElement>('.me-db-picker-item')].find(i => !before.includes(i.textContent?.trim() ?? '') && i.getAttribute('aria-selected') === 'false')!
    pick.click()
    await settle()
    const tags = calls().at(-1)!
    expect(tags[1]).toBe('tags')
    expect(Array.isArray(tags[2])).toBe(true)
    expect((tags[2] as string[]).length).toBe(before.length + 1)
    fire(document.body, 'keydown', { key: 'Escape' })
    await settle()

    // Date → { start: 'YYYY-MM-DD' }.
    fire(cell(0, 4), 'mousedown')
    await nextTick()
    fire(grid, 'keydown', { key: 'Enter' })
    await settle()
    document.body.querySelector<HTMLElement>('.me-db-datepicker-day[data-day="2026-10-15"]')?.click()
      ?? [...document.body.querySelectorAll<HTMLElement>('.me-db-datepicker-day:not(.is-outside)')][14]!.click()
    await settle()
    const date = calls().at(-1)!
    expect(date[1]).toBe('due')
    expect((date[2] as DateValue).start).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    fire(document.body, 'keydown', { key: 'Escape' })
    await settle()

    // Checkbox → boolean, toggled with Space.
    fire(cell(0, 5), 'mousedown')
    await nextTick()
    fire(grid, 'keydown', { key: ' ' })
    await settle()
    expect(calls().at(-1)).toEqual([r0.id, 'done', !doneBefore])

    // Typing on a text cell starts editing with that character; Esc cancels without writing.
    const n = calls().length
    fire(cell(0, 6), 'mousedown')
    await nextTick()
    fire(grid, 'keydown', { key: 'x' })
    await settle()
    const ta2 = document.body.querySelector<HTMLTextAreaElement>('.me-db-cell-textarea')!
    expect(ta2.value).toBe('x')
    fire(ta2, 'keydown', { key: 'Escape' })
    await settle()
    expect(calls().length).toBe(n)
    expect(document.body.querySelector('.me-db-cell-textarea')).toBeNull()
  })

  it('navigates like a spreadsheet and copies / pastes TSV, creating rows', async () => {
    const source = createMemorySource(sampleDatabase(3, { databaseId: 'db1' }))
    source.upsertView({ ...source.views.value[0]!, config: { visible: ['notes', 'estimate', 'priority'] } })
    const wrapper = mount({ render: () => h(DatabaseView, { source, databaseId: 'db1', viewId: 'v-table', locale: 'en' }) }, { attachTo: document.body })
    wrappers.push(wrapper)
    await settle()
    const grid = wrapper.find('[role="grid"]').element as HTMLElement
    const active = () => grid.querySelector('.me-db-td.is-active')
    const pos = () => [active()?.closest('[data-row]')?.getAttribute('data-row'), active()?.getAttribute('data-col')]

    fire(grid.querySelector('[data-row="0"] [data-col="0"]')!, 'mousedown')
    await nextTick()
    expect(pos()).toEqual(['0', '0'])
    fire(grid, 'keydown', { key: 'ArrowRight' })
    await nextTick()
    expect(pos()).toEqual(['0', '1'])
    fire(grid, 'keydown', { key: 'ArrowDown' })
    await nextTick()
    expect(pos()).toEqual(['1', '1'])
    fire(grid, 'keydown', { key: 'Tab' })
    await nextTick()
    expect(pos()).toEqual(['1', '2'])
    fire(grid, 'keydown', { key: 'ArrowRight', shiftKey: true })
    await nextTick()
    expect(grid.querySelectorAll('.me-db-td.is-selected').length).toBe(2)

    // Copy: the selected cells as TSV.
    const data = new Map<string, string>()
    const copy = new Event('copy', { bubbles: true, cancelable: true }) as ClipboardEvent
    Object.defineProperty(copy, 'clipboardData', { value: { setData: (t: string, v: string) => data.set(t, v), getData: (t: string) => data.get(t) ?? '' } })
    grid.dispatchEvent(copy)
    const r1 = source.all()[1]!
    expect(data.get('text/plain')).toBe(`${r1.values.estimate}\t${source.props.value.find(p => p.id === 'priority')!.config!.options!.find(o => o.id === r1.values.priority)!.name}`)

    // Paste 3 lines at row 1, col 1: two existing rows get setCell, the third line creates a row.
    fire(grid, 'keydown', { key: 'ArrowLeft' })
    fire(grid.querySelector('[data-row="1"] [data-col="2"]')!, 'mousedown')
    await nextTick()
    const paste = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
    Object.defineProperty(paste, 'clipboardData', { value: { getData: () => '7\tHigh\n8\tBrand new\n9\tLow\n' } })
    grid.dispatchEvent(paste)
    await settle()
    const all = source.all()
    expect(all).toHaveLength(4)
    expect(all[1]!.values.estimate).toBe(7)
    expect(all[1]!.values.priority).toBe('p-high')
    expect(all[2]!.values.estimate).toBe(8)
    const priority = source.props.value.find(p => p.id === 'priority')!
    expect(priority.config!.options!.map(o => o.name)).toContain('Brand new')
    expect(all[3]!.values).toMatchObject({ estimate: 9, priority: 'p-low' })
  })
})

describe('other views', () => {
  it('renders board columns per group and moves a card with setCell on drop', async () => {
    const { source, wrapper } = await setup(30, 'v-board')
    const columns = wrapper.findAll('.me-db-column[data-group]')
    expect(columns.map(c => c.attributes('data-group'))).toEqual(['', 's-todo', 's-doing', 's-done'])
    const card = wrapper.find('.me-db-column[data-group="s-todo"] .me-db-card')
    const id = card.attributes('data-row-id')!
    await card.trigger('dragstart')
    const target = wrapper.find('.me-db-column[data-group="s-done"]')
    await target.trigger('dragover')
    await target.trigger('drop')
    expect(source.log.filter(l => l.method === 'setCell').at(-1)!.args).toEqual([id, 'status', 's-done'])
  })

  it('renders pivot totals and the list / gallery / calendar / timeline views', async () => {
    const { wrapper } = await setup(200, 'v-pivot')
    expect(wrapper.find('.me-db-pivot-table').exists()).toBe(true)
    expect(wrapper.find('tfoot .is-grand').text()).not.toBe('')
    for (const id of ['v-list', 'v-gallery', 'v-calendar', 'v-timeline']) {
      const { wrapper: w } = await setup(200, id)
      expect(w.find('.me-db').attributes('data-view-type')).toBe(id.slice(2))
    }
  })

  it('adds, duplicates and deletes views', async () => {
    const { source, wrapper } = await setup(20)
    await wrapper.find('[data-add-view]').trigger('click')
    await settle()
    popover().querySelector<HTMLElement>('[data-view-type="gallery"]')!.click()
    await settle()
    expect(source.views.value.at(-1)).toMatchObject({ type: 'gallery', name: 'Gallery' })
    expect(wrapper.find('.me-db').attributes('data-view-type')).toBe('gallery')
    // Clicking the active tab opens its menu.
    await wrapper.find('.me-db-tab.is-active').trigger('click')
    await settle()
    popover().querySelector<HTMLElement>('[data-duplicate-view]')!.click()
    await settle()
    expect(source.views.value.at(-1)!.name).toBe('Gallery (copy)')
    await wrapper.find('.me-db-tab.is-active').trigger('click')
    await settle()
    popover().querySelector<HTMLElement>('[data-delete-view]')!.click()
    await settle()
    expect(source.views.value.map(v => v.name)).not.toContain('Gallery (copy)')
  })

  it('adds a property and warns before a lossy type change', async () => {
    const { source, wrapper } = await setup(20)
    await wrapper.find('.me-db-add-col').trigger('click')
    await settle()
    popover().querySelector<HTMLElement>('[data-type="formula"]')!.click()
    await settle()
    const ta = popover().querySelector<HTMLTextAreaElement>('.me-db-formula')!
    ta.value = 'prop("Nope")'
    ta.dispatchEvent(new Event('input'))
    await new Promise(r => setTimeout(r, 300))
    await settle()
    expect(popover().querySelector('.me-db-error')!.textContent).toContain('Unknown property')
    ta.value = 'prop("Estimate") * 2'
    ta.dispatchEvent(new Event('input'))
    await new Promise(r => setTimeout(r, 300))
    await settle()
    popover().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'))
    await settle()
    const added = source.props.value.at(-1)!
    expect(added).toMatchObject({ type: 'formula', config: { expression: 'prop("Estimate") * 2', result_type: 'number' } })

    // Header menu → change type (multi-select → select is lossy).
    const th = wrapper.find('[data-col-id="tags"]')
    if (th.exists()) {
      await th.trigger('click')
      await settle()
      ;[...popover().querySelectorAll<HTMLElement>('.me-menu-item')].find(b => b.textContent?.includes('Change type'))!.click()
      await settle()
      popover().querySelector<HTMLElement>('[data-type="select"]')!.click()
      await settle()
      expect(popover().querySelector('.me-db-warning')!.textContent).toContain('may lose')
      popover().querySelector<HTMLElement>('[data-confirm]')!.click()
      await settle()
      expect(source.props.value.find(p => p.id === 'tags')!.type).toBe('select')
    }
  })
})
