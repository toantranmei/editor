import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import DatabaseView from '../src/DatabaseView.vue'
import { createMemorySource, sampleDatabase, type MemorySource } from '../src/memory-source'
import type { Automation, DateValue } from '../src/types'

// The real chart needs a canvas.
vi.mock('@toantranmei/chart-block', () => ({ DatabaseChart: defineComponent({ render: () => h('div', { class: 'stub-chart' }) }) }))

const wrappers: VueWrapper[] = []
afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount()
  document.body.innerHTML = ''
  localStorage.clear()
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
/** Column menu → "Edit property" of a property (its settings); moved to the first columns so it is rendered. */
async function editProperty(wrapper: VueWrapper, source: MemorySource, id: string) {
  const v = source.views.value.find(x => x.id === 'v-table')!
  const visible = v.config.visible ?? source.props.value.map(p => p.id)
  source.upsertView({ ...v, config: { ...v.config, visible: [visible[0]!, id, ...visible.slice(1).filter(x => x !== id)] } })
  await settle()
  await wrapper.find(`.me-db-th[data-col-id="${id}"]`).trigger('click')
  await settle()
  popover().querySelector<HTMLElement>('[data-action="edit-property"]')!.click()
  await settle()
}
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
    // Filter changes are the viewer's draft (filter bar: Reset / Save for everyone) until saved.
    expect(source.views.value.find(v => v.id === 'v-table')!.config.filter).toBeUndefined()
    expect(wrapper.find('[data-filterbar] [data-draft-save]').exists()).toBe(true)
    await wrapper.find('[data-draft-save]').trigger('click')
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
    await wrapper.find('[data-draft-save]').trigger('click')
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
    expect(columns.map(c => c.attributes('data-group'))).toEqual(['s-todo', 's-doing', 's-done', ''])
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
    // Created at once (Notion); the formula is written in its settings.
    expect(document.body.querySelector('.me-db-popover')).toBeNull()
    await editProperty(wrapper, source, source.props.value.at(-1)!.id)
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

  it('feed: posts with properties and the page preview, Load more pages through the rows, click opens the row', async () => {
    const opened: string[] = []
    const init = sampleDatabase(25, { databaseId: 'db1' })
    const source = createMemorySource({ ...init, openRow: id => opened.push(id) })
    const wrapper = mount({ render: () => h(DatabaseView, { source, databaseId: 'db1', viewId: 'v-feed', locale: 'en' }) }, { attachTo: document.body })
    wrappers.push(wrapper)
    await settle()
    expect(wrapper.find('.me-db').attributes('data-view-type')).toBe('feed')
    let posts = wrapper.findAll('.me-db-post')
    expect(posts.length).toBe(10)
    expect(rowsCalls(source)[0]).toEqual({ offset: 0, limit: 10 })
    // Row 1 (index 0) has a preview in the sample; the request asked for the loaded ids only.
    const first = wrapper.find('.me-db-post[data-row-id="r1"]')
    expect(first.find('[data-preview-text]').text()).toContain('goals, scope and open questions')
    expect(source.log.find(l => l.method === 'rowPreview')!.args[0]).toHaveLength(10)
    expect(first.find('.me-db-post-props').exists()).toBe(true)
    // Created time is the meta line.
    expect(first.find('.me-db-post-meta').exists()).toBe(true)
    await wrapper.find('[data-load-more]').trigger('click')
    await settle()
    posts = wrapper.findAll('.me-db-post')
    expect(posts.length).toBe(20)
    expect(rowsCalls(source).at(-1)).toEqual({ offset: 10, limit: 10 })
    await wrapper.find('[data-load-more]').trigger('click')
    await settle()
    expect(wrapper.findAll('.me-db-post').length).toBe(25)
    expect(wrapper.find('[data-load-more]').exists()).toBe(false)
    await wrapper.find('.me-db-post[data-row-id="r2"] .me-db-post-title').trigger('click')
    expect(opened).toEqual(['r2'])
    // Turning the preview off hides it.
    source.upsertView({ ...source.views.value.find(v => v.id === 'v-feed')!, config: { card: { props: [] }, feed_preview: false } })
    await settle()
    expect(wrapper.find('[data-preview-text]').exists()).toBe(false)
  })

  it('dashboard: number and chart widgets with their own filter, add / edit / resize / move / remove widgets', async () => {
    const { source, wrapper } = await setup(40, 'v-dashboard')
    expect(wrapper.find('.me-db').attributes('data-view-type')).toBe('dashboard')
    const ids = () => wrapper.findAll('.me-db-widget').map(w => w.attributes('data-widget-id'))
    expect(ids()).toEqual(['w-count', 'w-open', 'w-status', 'w-priority'])
    const num = (id: string) => wrapper.find(`[data-widget-id="${id}"] [data-value]`).text()
    expect(num('w-count')).toBe('40')
    const open = source.all().filter(r => !r.values.done).reduce((n, r) => n + (r.values.estimate as number), 0)
    expect(num('w-open').replace(/\D/g, '')).toBe(String(open))
    // Chart widgets ask the source with their own config and filter.
    const chartCalls = source.log.filter(l => l.method === 'chart').map(l => l.args[1] as { widget?: string, filter?: unknown })
    expect(chartCalls.find(c => c.widget === 'w-priority')!.filter).toEqual({ and: [{ prop: 'priority', op: 'is', value: 'p-high' }] })
    expect(wrapper.find('[data-widget-id="w-status"]').attributes('data-span')).toBe('2')

    // The view's (toolbar) filter narrows every widget, on top of their own.
    ;(wrapper.findComponent(DatabaseView).vm as unknown as { db: { updateView: (p: object) => void } }).db.updateView({ filter: { and: [{ prop: 'done', op: 'is', value: true }] } })
    await settle()
    expect(num('w-count')).toBe(String(source.all().filter(r => r.values.done).length))
    expect(num('w-open')).toBe('0')

    // Add a number widget, then edit it in its popover.
    await wrapper.find('[data-add-widget]').trigger('click')
    await settle()
    popover().querySelector<HTMLElement>('[data-widget-kind="number"]')!.click()
    await settle()
    const view = () => source.views.value.find(v => v.id === 'v-dashboard')!
    const added = view().config.widgets!.at(-1)!
    expect(added).toMatchObject({ kind: 'number', fn: 'count' })
    const settings = popover().querySelector<HTMLElement>('[data-widget-settings]')!
    const title = settings.querySelector<HTMLInputElement>('[data-setting="title"]')!
    title.value = 'Budget'
    title.dispatchEvent(new Event('change'))
    await settle()
    const propSel = popover().querySelector<HTMLSelectElement>('[data-setting="prop"]')!
    propSel.value = 'budget'
    propSel.dispatchEvent(new Event('change'))
    await settle()
    const fnSel = popover().querySelector<HTMLSelectElement>('[data-setting="fn"]')!
    fnSel.value = 'max'
    fnSel.dispatchEvent(new Event('change'))
    await settle()
    const span = popover().querySelector<HTMLSelectElement>('[data-setting="span"]')!
    span.value = '2'
    span.dispatchEvent(new Event('change'))
    await settle()
    expect(view().config.widgets!.at(-1)).toMatchObject({ id: added.id, title: 'Budget', prop: 'budget', fn: 'max', span: 2 })
    // Its own filter, from the filter builder in the popover.
    popover().querySelector<HTMLElement>('[data-widget-settings] [data-add-filter]')!.click()
    await settle()
    expect(view().config.widgets!.at(-1)!.filter).toBeTruthy()
    popover().querySelector<HTMLElement>('[data-widget-remove]')!.click()
    await settle()
    expect(ids()).toEqual(['w-count', 'w-open', 'w-status', 'w-priority'])

    // Move later / earlier.
    await wrapper.find('[data-widget-id="w-count"] [data-widget-later]').trigger('click')
    await settle()
    expect(ids()).toEqual(['w-open', 'w-count', 'w-status', 'w-priority'])
    await wrapper.find('[data-widget-id="w-priority"] [data-widget-earlier]').trigger('click')
    await settle()
    expect(ids()).toEqual(['w-open', 'w-count', 'w-priority', 'w-status'])
  })

  it('drafts: the viewer\'s unsaved filter / sorts survive a reload (localStorage by default), Save / Reset clear them', async () => {
    type Exposed = { db: { updateView: (p: object) => void, draft: { value: unknown }, resetDraft: () => void, saveDraft: () => void } }
    const mountOnce = (options: object = {}) => {
      const source = createMemorySource(sampleDatabase(50, { databaseId: 'db1' }))
      const wrapper = mount({ render: () => h(DatabaseView, { source, databaseId: 'db1', viewId: 'v-table', locale: 'en', options: { userId: 'u1', ...options } }) }, { attachTo: document.body })
      wrappers.push(wrapper)
      return { source, wrapper, db: () => (wrapper.findComponent(DatabaseView).vm as unknown as Exposed).db }
    }
    const filter = { and: [{ prop: 'estimate', op: '>=', value: 7 }] }
    const first = mountOnce()
    await settle()
    first.db().updateView({ filter, sorts: [{ prop: 'estimate', dir: 'desc' }] })
    await settle()
    expect(JSON.parse(localStorage.getItem('mei-db-draft:u1:db1:v-table')!)).toEqual({ filter, sorts: [{ prop: 'estimate', dir: 'desc' }] })
    first.wrapper.unmount()

    // A new session: the draft is back, the rows query uses it, the saved view is untouched.
    const second = mountOnce()
    await settle()
    expect(second.db().draft.value).toEqual({ filter, sorts: [{ prop: 'estimate', dir: 'desc' }] })
    expect(second.wrapper.find('[data-draft-reset]').exists()).toBe(true)
    const q = second.source.log.filter(l => l.method === 'rows').at(-1)!.args[2] as { filter?: unknown }
    expect(q.filter).toEqual(filter)
    expect(second.source.views.value.find(v => v.id === 'v-table')!.config.filter).toBeUndefined()
    await second.wrapper.find('[data-draft-reset]').trigger('click')
    await settle()
    expect(localStorage.getItem('mei-db-draft:u1:db1:v-table')).toBeNull()

    // Save for everyone writes the view and clears the stored draft.
    second.db().updateView({ filter })
    await settle()
    expect(localStorage.getItem('mei-db-draft:u1:db1:v-table')).not.toBeNull()
    await second.wrapper.find('[data-draft-save]').trigger('click')
    await settle()
    expect(localStorage.getItem('mei-db-draft:u1:db1:v-table')).toBeNull()
    expect(second.source.views.value.find(v => v.id === 'v-table')!.config.filter).toEqual(filter)

    // A custom store is used instead; `false` keeps drafts in memory only.
    const calls: Array<[string, string, unknown]> = []
    const custom = mountOnce({ draftStore: { get: (id: string) => (calls.push(['get', id, null]), null), set: (id: string, d: unknown) => calls.push(['set', id, d]) } })
    await settle()
    custom.db().updateView({ sorts: [{ prop: 'due', dir: 'asc' }] })
    await settle()
    expect(calls[0]).toEqual(['get', 'v-table', null])
    expect(calls.at(-1)).toEqual(['set', 'v-table', { sorts: [{ prop: 'due', dir: 'asc' }] }])
    localStorage.clear()
    const off = mountOnce({ draftStore: false })
    await settle()
    off.db().updateView({ sorts: [{ prop: 'due', dir: 'asc' }] })
    await settle()
    expect(localStorage.length).toBe(0)
    expect(off.db().draft.value).toEqual({ sorts: [{ prop: 'due', dir: 'asc' }] })
  })
})

describe('button property', () => {
  it('runs its actions on the row after the confirmation, as one undo step, and is off without edit rights', async () => {
    const { source, wrapper } = await setup(20)
    source.upsertProp({
      id: 'btn',
      name: 'Finish',
      type: 'button',
      position: 'a05',
      config: { label: 'Mark done', actions: [
        { id: 'a1', type: 'show_confirm', message: 'Finish it?' },
        { id: 'a2', type: 'set_values', values: [{ prop: 'status', value: 's-done' }, { prop: 'due', dynamic: 'today' }, { prop: 'owner', dynamic: 'me' }] },
      ] },
    })
    await settle()
    const button = wrapper.find<HTMLButtonElement>('[data-row="0"] [data-button="btn"]')
    expect(button.text()).toBe('Mark done')
    const rowId = (await source.rows('v-table', { offset: 0, limit: 1 })).rows[0]!.id
    await button.trigger('click')
    await settle()
    const dialog = document.body.querySelector<HTMLElement>('[data-button-confirm]')!
    expect(dialog.textContent).toContain('Finish it?')
    expect(source.log.filter(l => l.method === 'setCell')).toHaveLength(0)
    dialog.querySelector<HTMLButtonElement>('[data-confirm]')!.click()
    await settle()
    const sets = source.log.filter(l => l.method === 'setCell').map(l => l.args)
    const d = new Date()
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    expect(sets).toEqual([[rowId, 'status', 's-done'], [rowId, 'due', { start: today }], [rowId, 'owner', ['u1']]])
    // One ⌘Z puts every value back.
    const db = (wrapper.findComponent(DatabaseView).vm as unknown as { db: { undo: () => void, canUndo: { value: boolean } } }).db
    db.undo()
    expect(db.canUndo.value).toBe(false)
    expect(source.log.filter(l => l.method === 'setCell')).toHaveLength(6)
    // Buttons are neither filterable nor calculable.
    expect(wrapper.find('[data-agg="btn"]').exists()).toBe(false)
    source.canEditContent.value = false
    await settle()
    expect(wrapper.find<HTMLButtonElement>('[data-row="0"] [data-button="btn"]').element.disabled).toBe(true)
  })

  it('is created from the property editor with a label and its steps', async () => {
    const { source, wrapper } = await setup(20)
    await wrapper.find('.me-db-add-col').trigger('click')
    await settle()
    popover().querySelector<HTMLElement>('[data-type="button"]')!.click()
    await settle()
    await editProperty(wrapper, source, source.props.value.at(-1)!.id)
    const label = popover().querySelector<HTMLInputElement>('[data-setting="button_label"]')!
    label.value = 'Ship'
    label.dispatchEvent(new Event('input'))
    await settle()
    const add = () => popover().querySelector<HTMLSelectElement>('[data-action-add]')!
    add().value = 'set_values'
    add().dispatchEvent(new Event('change'))
    await settle()
    popover().querySelector<HTMLElement>('[data-action-add-value]')!.click()
    await settle()
    add().value = 'open_url'
    add().dispatchEvent(new Event('change'))
    await settle()
    const url = popover().querySelector<HTMLInputElement>('[data-action-url]')!
    url.value = 'example.com'
    url.dispatchEvent(new Event('change'))
    await settle()
    popover().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'))
    await settle()
    const added = source.props.value.at(-1)!
    expect(added).toMatchObject({ type: 'button', config: { label: 'Ship', actions: [
      { type: 'set_values', values: [{ prop: 'name', value: null }] },
      { type: 'open_url', url: 'example.com' },
    ] } })
  })
})

describe('automations', () => {
  it('run after the triggering write in the same undo step, never re-trigger, and are edited in View settings', async () => {
    const { source, wrapper } = await setup(20)
    const db = (wrapper.findComponent(DatabaseView).vm as unknown as { db: { source: MemorySource, undo: () => void, createRow: (i?: object) => string } }).db
    const title = source.props.value.find(p => p.type === 'title')!
    const automations: Automation[] = [
      // Done → check "Done" and stamp the due date; setting status again from an action must not loop.
      { id: 'a1', enabled: true, trigger: { type: 'prop_changed', prop: 'status', condition: { prop: 'status', op: 'is', value: 's-done' } }, actions: [
        { id: 's1', type: 'set_values', values: [{ prop: 'done', value: true }, { prop: 'status', value: 's-done' }] },
      ] },
      { id: 'a2', enabled: true, trigger: { type: 'row_added' }, actions: [{ id: 's2', type: 'set_values', values: [{ prop: 'owner', dynamic: 'me' }] }] },
      { id: 'a3', enabled: false, trigger: { type: 'prop_changed' }, actions: [{ id: 's3', type: 'add_row', values: [] }] },
    ]
    source.upsertProp({ ...title, config: { ...title.config, automations } })
    await settle()
    const rowId = (await source.rows('v-table', { offset: 0, limit: 1 })).rows[0]!.id
    const sets = () => source.log.filter(l => l.method === 'setCell').map(l => l.args)
    db.source.setCell(rowId, 'status', 's-todo')
    expect(sets()).toEqual([[rowId, 'status', 's-todo']])
    await settle()
    db.source.setCell(rowId, 'status', 's-done')
    expect(sets().slice(1)).toEqual([[rowId, 'status', 's-done'], [rowId, 'done', true], [rowId, 'status', 's-done']])
    await settle()
    const id = db.createRow({})
    expect(sets().at(-1)).toEqual([id, 'owner', ['u1']])
    expect(source.log.filter(l => l.method === 'createRow')).toHaveLength(1)
    await settle()
    // Undo of the new row also drops the automation's write (one step).
    db.undo()
    db.undo()
    expect(sets().slice(-3)).toEqual([[rowId, 'status', 's-done'], [rowId, 'done', false], [rowId, 'status', 's-todo']])

    // View settings → Automations: add one, switch the trigger, add a step, turn it off.
    await wrapper.find('[data-tool="settings"]').trigger('click')
    await settle()
    const panel = () => popover().querySelector<HTMLElement>('[data-panel="automations"]')!
    popover().querySelector<HTMLElement>('[data-setting="automations"] summary')!.click()
    panel().querySelector<HTMLElement>('[data-automation-add]')!.click()
    await settle()
    const card = () => [...panel().querySelectorAll<HTMLElement>('[data-automation]')].at(-1)!
    const change = (el: HTMLInputElement | HTMLSelectElement, v: string) => {
      el.value = v
      el.dispatchEvent(new Event('change'))
    }
    change(card().querySelector<HTMLSelectElement>('[data-trigger-type]')!, 'prop_changed')
    await settle()
    change(card().querySelector<HTMLSelectElement>('[data-trigger-prop]')!, 'priority')
    await settle()
    card().querySelector<HTMLInputElement>('[data-trigger-condition]')!.click()
    await settle()
    change(card().querySelector<HTMLSelectElement>('[data-action-add]')!, 'add_row')
    await settle()
    // Buttons-only steps are not offered.
    expect([...card().querySelectorAll<HTMLOptionElement>('[data-action-add] option')].map(o => o.value)).toEqual(['', 'set_values', 'add_row'])
    card().querySelector<HTMLInputElement>('[data-automation-enabled]')!.click()
    await settle()
    const saved = source.props.value.find(p => p.type === 'title')!.config!.automations!
    expect(saved).toHaveLength(4)
    expect(saved[3]).toMatchObject({ enabled: false, trigger: { type: 'prop_changed', prop: 'priority', condition: { prop: 'priority', op: 'is', value: 'p-low' } }, actions: [{ type: 'add_row', values: [] }] })
  })
})

describe('card previews and layout', () => {
  const withView = async (viewId: string, patch: Record<string, unknown>, drop?: 'rowPreview') => {
    const init = sampleDatabase(40, { databaseId: 'db1' })
    init.views = init.views.map(v => (v.id === viewId ? { ...v, config: { ...v.config, ...patch } } : v))
    const source = createMemorySource(init)
    if (drop) delete (source as Partial<MemorySource>)[drop]
    const wrapper = mount({ render: () => h(DatabaseView, { source, databaseId: 'db1', viewId, locale: 'en' }) }, { attachTo: document.body })
    wrappers.push(wrapper)
    await settle()
    return { source, wrapper }
  }

  it('gallery: page content shows the page text, page cover its cover, batched through rowPreview', async () => {
    const { source, wrapper } = await withView('v-gallery', { cover: 'page_content' })
    const card = wrapper.find('.me-db-card[data-row-id="r1"]')
    expect(card.find('.me-db-cover-text').text()).toContain('goals, scope')
    expect(wrapper.find('.me-db-card[data-row-id="r2"] .me-db-cover').attributes('data-cover')).toBe('empty')
    const calls = source.log.filter(l => l.method === 'rowPreview')
    expect(calls.length).toBe(1)
    expect((calls[0]!.args[0] as string[])).toContain('r1')

    const { wrapper: w2 } = await withView('v-gallery', { cover: 'page_cover' })
    expect(w2.find('.me-db-card[data-row-id="r1"] .me-db-cover-img').attributes('src')).toMatch(/^data:image\/svg/)
    expect(w2.find('.me-db-card[data-row-id="r3"] .me-db-cover').attributes('data-cover')).toBe('empty')
  })

  it('board: shows a preview only when there is one, compact layout wraps properties; no rowPreview: no preview', async () => {
    const { wrapper } = await withView('v-board', { card: { props: ['priority', 'owner', 'due'], cover: 'page_content', layout: 'compact' } })
    expect(wrapper.find('.me-db-card[data-row-id="r1"] .me-db-cover-text').exists()).toBe(true)
    expect(wrapper.find('.me-db-card[data-row-id="r2"] .me-db-cover').exists()).toBe(false)
    expect(wrapper.find('.me-db-card-props').classes()).toContain('is-compact')

    const { wrapper: w2 } = await withView('v-board', { card: { props: ['priority'], cover: 'page_cover' } }, 'rowPreview')
    expect(w2.findAll('.me-db-card[data-row-id]').length).toBeGreaterThan(0)
    expect(w2.find('.me-db-cover').exists()).toBe(false)
    expect(w2.find('.me-db-card-props').classes()).not.toContain('is-compact')
  })

  it('view options list Page cover / Page content and the card layout', async () => {
    const { source, wrapper } = await withView('v-board', {})
    await wrapper.find('[data-tool="settings"]').trigger('click')
    await settle()
    const select = popover().querySelector<HTMLSelectElement>('[data-setting="cover"]')!
    expect([...select.options].map(o => o.value).slice(0, 3)).toEqual(['', 'page_cover', 'page_content'])
    select.value = 'page_content'
    select.dispatchEvent(new Event('change'))
    const layout = popover().querySelector<HTMLSelectElement>('[data-setting="card_layout"]')!
    layout.value = 'compact'
    layout.dispatchEvent(new Event('change'))
    await settle()
    expect(source.views.value.find(v => v.id === 'v-board')!.config.card).toMatchObject({ cover: 'page_content', layout: 'compact' })
  })
})

describe('page icons', () => {
  it('table, list, board and gallery show the row icon before the title; Show page icon off hides it', async () => {
    const { source, wrapper } = await setup(30)
    const first = wrapper.find('.me-db-tr[data-row="0"] .me-db-td.is-first')
    expect(first.find('.me-db-row-icon').text()).toBe('📄')
    expect(wrapper.find('.me-db-tr[data-row="1"] .me-db-td.is-first .me-db-row-icon').exists()).toBe(false)
    for (const id of ['v-list', 'v-board', 'v-gallery']) {
      const { wrapper: w } = await setup(30, id)
      expect(w.find('[data-row-id="r1"] .me-db-row-icon').text()).toBe('📄')
      expect(w.find('[data-row-id="r4"] .me-db-row-icon').text()).toBe('🚀')
    }
    await wrapper.find('[data-tool="settings"]').trigger('click')
    await settle()
    const toggle = popover().querySelector<HTMLInputElement>('[data-setting="show_page_icon"]')!
    expect(toggle.checked).toBe(true)
    toggle.checked = false
    toggle.dispatchEvent(new Event('change'))
    await settle()
    expect(source.views.value.find(v => v.id === 'v-table')!.config.show_page_icon).toBe(false)
    expect(wrapper.find('.me-db-row-icon').exists()).toBe(false)
  })
})

describe('view tab icon and Display as', () => {
  it('sets an icon from the tab menu, shows icon only, removes the icon', async () => {
    const { source, wrapper } = await setup(10)
    const openMenu = async () => {
      await wrapper.find('.me-db-tab.is-active').trigger('click')
      await settle()
    }
    await openMenu()
    popover().querySelector<HTMLElement>('[data-pick-icon="🔥"]')!.click()
    await settle()
    expect(source.views.value.find(v => v.id === 'v-table')!.config.icon).toBe('🔥')
    expect(wrapper.find('.me-db-tab.is-active .me-db-row-icon').text()).toBe('🔥')
    popover().querySelector<HTMLElement>('[data-tab-display="icon"]')!.click()
    await settle()
    const tab = wrapper.find('.me-db-tab.is-active')
    expect(tab.classes()).toContain('is-icon-only')
    expect(tab.find('.me-db-tab-name').exists()).toBe(false)
    expect(tab.attributes('title')).toBe('Table')
    // Typed emoji.
    const input = popover().querySelector<HTMLInputElement>('[data-view-icon]')!
    input.value = '🧭'
    input.dispatchEvent(new Event('input'))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await settle()
    expect(source.views.value.find(v => v.id === 'v-table')!.config.icon).toBe('🧭')
    popover().querySelector<HTMLElement>('[data-remove-view-icon]')!.click()
    popover().querySelector<HTMLElement>('[data-tab-display="name"]')!.click()
    await settle()
    const config = source.views.value.find(v => v.id === 'v-table')!.config
    expect('icon' in config || 'tab_display' in config).toBe(false)
    expect(wrapper.find('.me-db-tab.is-active .me-db-tab-name').text()).toBe('Table')
  })
})

describe('sub-items in list and board, nested or flattened', () => {
  async function withSubs(viewId: string, display?: 'flat') {
    const init = sampleDatabase(30, { databaseId: 'db1' })
    init.props = [...init.props, { id: 'parent', name: 'Parent item', type: 'relation', position: 'b0', config: { database_id: 'db1', limit: 1 } }]
    for (const r of init.rows!) {
      if (r.id === 'r2' || r.id === 'r3') r.values.parent = ['r1']
      if (r.id === 'r4') r.values.parent = ['r2']
    }
    init.views = init.views.map(v => (v.id === viewId ? { ...v, config: { ...v.config, sub_items: 'parent', sub_items_display: display } } : v))
    const source = createMemorySource(init)
    const wrapper = mount({ render: () => h(DatabaseView, { source, databaseId: 'db1', viewId, locale: 'en' }) }, { attachTo: document.body })
    wrappers.push(wrapper)
    await settle()
    const name = (id: string) => String(source.all().find(r => r.id === id)!.values.name)
    return { source, wrapper, name }
  }
  const listIds = (w: VueWrapper) => w.findAll('.me-db-list-row').map(b => b.attributes('data-row-id'))

  it('list nested: parents only, ▸ shows sub-items under their parent, at any depth', async () => {
    const { wrapper } = await withSubs('v-list')
    expect(listIds(wrapper).slice(0, 3)).toEqual(['r1', 'r5', 'r6'])
    const toggle = wrapper.find('.me-db-list-item:first-child [data-subtoggle]')
    expect(toggle.exists()).toBe(true)
    await toggle.trigger('click')
    await settle()
    expect(listIds(wrapper).slice(0, 4)).toEqual(['r1', 'r2', 'r3', 'r5'])
    expect(wrapper.findAll('.me-db-list-item.is-child').length).toBe(2)
    // r2 has a sub-item of its own.
    const r2 = wrapper.findAll('.me-db-list-item.is-child').find(i => i.find('[data-row-id="r2"]').exists())!
    await r2.find('[data-subtoggle]').trigger('click')
    await settle()
    expect(listIds(wrapper).slice(0, 5)).toEqual(['r1', 'r2', 'r4', 'r3', 'r5'])
  })

  it('list flattened: every row, sub-items name their parent', async () => {
    const { wrapper, name } = await withSubs('v-list', 'flat')
    expect(listIds(wrapper).slice(0, 4)).toEqual(['r1', 'r2', 'r3', 'r4'])
    expect(wrapper.find('[data-subtoggle]').exists()).toBe(false)
    const r2 = wrapper.find('.me-db-list-row[data-row-id="r2"]')
    expect(r2.find('.me-db-parent-label').text()).toBe(name('r1'))
    expect(wrapper.find('.me-db-list-row[data-row-id="r1"] .me-db-parent-label').exists()).toBe(false)
  })

  it('board nested: parent cards show "N sub-items", opening it lists them; sub-items have no card', async () => {
    const { wrapper, source } = await withSubs('v-board')
    expect(wrapper.find('.me-db-card[data-row-id="r2"]').exists()).toBe(false)
    const subs = wrapper.find('[data-subs-of="r1"]')
    expect(subs.find('[data-subs-toggle]').text()).toBe('2 sub-items')
    expect(subs.findAll('.me-db-card-sub').length).toBe(0)
    await subs.find('[data-subs-toggle]').trigger('click')
    await settle()
    const items = wrapper.findAll('[data-subs-of="r1"] .me-db-card-sub')
    expect(items.map(i => i.attributes('data-sub-row-id'))).toEqual(['r2', 'r3'])
    await items[0]!.trigger('click')
    expect(source.log.filter(l => l.method === 'openRow').at(-1)!.args[0]).toBe('r2')
  })

  it('table flattened: no ▸, sub-items name their parent; view options switch the display', async () => {
    const { wrapper, source, name } = await withSubs('v-table', 'flat')
    expect(wrapper.find('[data-subtoggle]').exists()).toBe(false)
    expect(wrapper.find('.me-db-tr[data-row="1"] .me-db-td.is-first .me-db-parent-label').text()).toBe(name('r1'))
    await wrapper.find('[data-tool="settings"]').trigger('click')
    await settle()
    const select = popover().querySelector<HTMLSelectElement>('[data-setting="sub_items_display"]')!
    expect(select.value).toBe('flat')
    select.value = 'nested'
    select.dispatchEvent(new Event('change'))
    await settle()
    expect(source.views.value.find(v => v.id === 'v-table')!.config.sub_items_display).toBeUndefined()
    expect(wrapper.find('[data-subtoggle]').exists()).toBe(true)
  })
})

describe('a host that posts every call to a worker (structured clone)', () => {
  /** Like a host that sends each call over postMessage: a Vue proxy in an argument throws DataCloneError. */
  function cloning(source: MemorySource): MemorySource {
    const out = { ...source } as MemorySource
    for (const [key, fn] of Object.entries(source)) {
      if (typeof fn === 'function') (out as unknown as Record<string, unknown>)[key] = (...args: unknown[]) => (fn as (...a: unknown[]) => unknown)(...args.map(a => structuredClone(a)))
    }
    return out
  }

  for (const type of ['select', 'multi_select', 'status'] as const) {
    it(`adds a ${type} property`, async () => {
      const source = cloning(createMemorySource(sampleDatabase(20, { databaseId: 'db1' })))
      const errors: unknown[] = []
      const wrapper = mount({ render: () => h(DatabaseView, { source, databaseId: 'db1', viewId: 'v-table', locale: 'en', onError: (e: unknown) => errors.push(e) }) }, { attachTo: document.body })
      wrappers.push(wrapper)
      await settle()
      await wrapper.find('.me-db-add-col').trigger('click')
      await settle()
      popover().querySelector<HTMLElement>(`[data-type="${type}"]`)!.click()
      await settle()
      const added = source.props.value.at(-1)!
      expect(added.type).toBe(type)
      expect(errors).toEqual([])
    })
  }
})

describe('"+" in the table header (Notion)', () => {
  it('opens over the header with the name and the types in groups; picking one creates the property and closes', async () => {
    const { source, wrapper } = await setup(20)
    const count = source.props.value.length
    await wrapper.find('.me-db-add-col').trigger('click')
    await settle()
    await new Promise(r => setTimeout(r, 0))
    const menu = popover().querySelector<HTMLElement>('[data-new-prop]')!
    // Basic, advanced and automatic types, no Save: nothing is created until a type is picked.
    expect(menu.querySelectorAll('.me-db-new-prop-types').length).toBe(3)
    expect([...menu.querySelectorAll('.me-db-new-prop-types')[0]!.querySelectorAll('[data-type]')].map(b => b.getAttribute('data-type')).slice(0, 3)).toEqual(['text', 'number', 'select'])
    expect(popover().querySelector('button[type="submit"]')).toBeNull()
    const name = menu.querySelector<HTMLInputElement>('[data-prop-name]')!
    expect(document.activeElement).toBe(name)
    name.value = 'Priority'
    name.dispatchEvent(new Event('input'))
    await settle()
    expect(source.props.value.length).toBe(count)

    menu.querySelector<HTMLElement>('[data-type="select"]')!.click()
    await settle()
    const added = source.props.value.at(-1)!
    expect(source.props.value.length).toBe(count + 1)
    expect(added).toMatchObject({ name: 'Priority', type: 'select' })
    expect(document.body.querySelector('.me-db-popover')).toBeNull()
  })

  it('names the property after its type when no name is typed', async () => {
    const { source, wrapper } = await setup(20)
    await wrapper.find('.me-db-add-col').trigger('click')
    await settle()
    popover().querySelector<HTMLElement>('[data-type="date"]')!.click()
    await settle()
    expect(source.props.value.at(-1)).toMatchObject({ name: 'Date', type: 'date' })
  })

  it('Enter in the name creates a text property; Escape creates nothing', async () => {
    const { source, wrapper } = await setup(20)
    const count = source.props.value.length
    await wrapper.find('.me-db-add-col').trigger('click')
    await settle()
    popover().querySelector<HTMLElement>('[data-prop-name]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await settle()
    expect(document.body.querySelector('.me-db-popover')).toBeNull()
    expect(source.props.value.length).toBe(count)

    await wrapper.find('.me-db-add-col').trigger('click')
    await settle()
    const name = popover().querySelector<HTMLInputElement>('[data-prop-name]')!
    name.value = 'Notes'
    name.dispatchEvent(new Event('input'))
    name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await settle()
    expect(source.props.value.at(-1)).toMatchObject({ name: 'Notes', type: 'text' })
    expect(document.body.querySelector('.me-db-popover')).toBeNull()
  })
})

describe('options of select and status (Notion\'s Edit property and option menu)', () => {
  const optionsOf = (s: MemorySource, id: string) => s.props.value.find(p => p.id === id)!.config!
  async function openEditProperty(wrapper: VueWrapper, col: string) {
    await wrapper.find(`.me-db-th[data-col-id="${col}"]`).trigger('click')
    await settle()
    popover().querySelector<HTMLElement>('[data-action="edit-property"]')!.click()
    await settle()
    // The header menu stays open; the options open beside it.
    expect(document.body.querySelectorAll('.me-db-popover').length).toBe(2)
    return popover().querySelector<HTMLElement>('[data-options-menu]')!
  }

  it('select: options as tags, add one, sort, and its menu renames / recolors / deletes', async () => {
    const { source, wrapper } = await setup(20)
    const menu = await openEditProperty(wrapper, 'priority')
    expect([...menu.querySelectorAll('[data-option] .me-db-tag')].map(t => t.textContent)).toEqual(['Low', 'Medium', 'High'])
    expect(menu.querySelector('input')).toBeNull() // tags, not text fields
    // + Add an option → field; Enter adds and keeps it open.
    menu.querySelector<HTMLElement>('[data-add-option]')!.click()
    await settle()
    const draft = popover().querySelector<HTMLInputElement>('[data-option-draft]')!
    draft.value = 'Urgent'
    draft.dispatchEvent(new Event('input'))
    draft.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await settle()
    expect(optionsOf(source, 'priority').options!.map(o => o.name)).toEqual(['Low', 'Medium', 'High', 'Urgent'])
    expect(popover().querySelector('[data-option-draft]')).not.toBeNull()
    // Sort  Manual › → Alphabetical.
    popover().querySelector<HTMLElement>('[data-option-sort]')!.click()
    await settle()
    popover().querySelector<HTMLElement>('[data-sort="asc"]')!.click()
    await settle()
    expect(optionsOf(source, 'priority').option_sort).toBe('asc')
    expect(optionsOf(source, 'priority').options!.map(o => o.name)).toEqual(['High', 'Low', 'Medium', 'Urgent'])
    // Option menu: rename, color, delete.
    const urgent = optionsOf(source, 'priority').options!.find(o => o.name === 'Urgent')!.id
    document.body.querySelector<HTMLElement>(`[data-options-menu] [data-option="${urgent}"]`)!.click()
    await settle()
    const name = popover().querySelector<HTMLInputElement>('[data-option-name]')!
    expect(name.value).toBe('Urgent')
    name.value = 'ASAP'
    name.dispatchEvent(new Event('input'))
    name.dispatchEvent(new Event('blur'))
    await settle()
    popover().querySelector<HTMLElement>('[data-color-choice="purple"]')!.click()
    await settle()
    expect(optionsOf(source, 'priority').options!.find(o => o.id === urgent)).toMatchObject({ name: 'ASAP', color: 'purple' })
    popover().querySelector<HTMLElement>('[data-action="delete-option"]')!.click()
    await settle()
    expect(optionsOf(source, 'priority').options!.some(o => o.id === urgent)).toBe(false)
  })

  it('status: options under their groups, default marked, + per group, set as default and move to a group', async () => {
    const { source, wrapper } = await setup(20)
    const menu = await openEditProperty(wrapper, 'status')
    const groups = [...menu.querySelectorAll<HTMLElement>('[data-group]')]
    expect(groups.map(g => g.querySelector('.me-menu-label')!.textContent)).toEqual(['To-do', 'In progress', 'Complete'])
    // + of "In progress".
    groups[1]!.querySelector<HTMLElement>('[data-add-to-group]')!.click()
    await settle()
    const draft = popover().querySelector<HTMLInputElement>('[data-option-draft]')!
    draft.value = 'Review'
    draft.dispatchEvent(new Event('input'))
    draft.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await settle()
    const review = optionsOf(source, 'status').options!.find(o => o.name === 'Review')!.id
    expect(optionsOf(source, 'status').groups!.find(g => g.id === 'g-prog')!.option_ids).toContain(review)
    // Its menu: Set as default, Group › Complete.
    document.body.querySelector<HTMLElement>(`[data-options-menu] [data-option="${review}"]`)!.click()
    await settle()
    popover().querySelector<HTMLElement>('[data-action="set-default"]')!.click()
    await settle()
    expect(optionsOf(source, 'status').default_option_id).toBe(review)
    expect(document.body.querySelector(`[data-options-menu] [data-option="${review}"] [data-default]`)).not.toBeNull()
    document.body.querySelector<HTMLElement>(`[data-option-menu="${review}"] [data-action="move-group"]`)!.click()
    await settle()
    popover().querySelector<HTMLElement>('[data-group-choice="g-done"]')!.click()
    await settle()
    expect(optionsOf(source, 'status').groups!.find(g => g.id === 'g-done')!.option_ids).toContain(review)
    expect(optionsOf(source, 'status').groups!.find(g => g.id === 'g-prog')!.option_ids).not.toContain(review)
  })
})

describe('column menu', () => {
  it('focuses the name field when it opens, the caret after the name (Notion)', async () => {
    const { wrapper } = await setup(20)
    await wrapper.find('.me-db-th[data-col-id="priority"]').trigger('click')
    await settle()
    const input = popover().querySelector<HTMLInputElement>('[data-prop-name]')!
    expect(document.activeElement).toBe(input)
    expect(input.selectionStart).toBe('Priority'.length)
    expect(input.selectionEnd).toBe('Priority'.length)
  })
})

describe('row drag (Notion: pointer, a see-through copy, one line where it lands)', () => {
  const ptr = (target: EventTarget, type: string, x: number, y: number) =>
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y }))
  const frame = () => new Promise(r => requestAnimationFrame(() => r(null)))
  async function start(wrapper: VueWrapper) {
    const T = (await import('@toantranmei/editor')).componentTokens.database
    const row = Number.parseFloat(T.rowHeight)
    const header = Number.parseFloat(T.headerHeight)
    const handle = wrapper.find('.me-db-tr[data-row="0"] .me-db-row-handle').element
    ptr(handle, 'pointerdown', 10, header + row / 2)
    return { row, header, handle }
  }

  it('moves the row after the one under the pointer, with a copy and one line while dragging', async () => {
    const { source, wrapper } = await setup(20)
    const before = source.all().slice(0, 4).map(r => r.id)
    const { row, header } = await start(wrapper)
    // Past row 3's middle → after row 3.
    ptr(window, 'pointermove', 14, header + 3 * row + row * 0.75)
    await frame()
    await settle()
    expect(document.body.querySelector('.me-db-row-ghost')).not.toBeNull()
    expect(wrapper.findAll('.me-db-drop-line')).toHaveLength(1)
    expect(wrapper.find('.me-db-tr[data-row="0"]').classes()).toContain('is-dragging')
    ptr(window, 'pointerup', 14, header + 3 * row + row * 0.75)
    await settle()
    const moves = source.log.filter(l => l.method === 'moveRow')
    expect(moves.at(-1)!.args).toEqual([before[0], before[3], before[4] ?? source.all()[4]!.id])
    expect(document.body.querySelector('.me-db-row-ghost')).toBeNull()
    expect(wrapper.find('.me-db-drop-line').exists()).toBe(false)
    expect(document.body.querySelector('.me-db-popover')).toBeNull() // the drag's click didn't open the row menu
  })

  it('Escape cancels; a click without moving opens the row menu', async () => {
    const { source, wrapper } = await setup(20)
    const { row, header, handle } = await start(wrapper)
    ptr(window, 'pointermove', 14, header + 3 * row)
    await frame()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    ptr(window, 'pointerup', 14, header + 3 * row)
    await settle()
    expect(source.log.some(l => l.method === 'moveRow')).toBe(false)
    expect(document.body.querySelector('.me-db-row-ghost')).toBeNull()
    await new Promise(r => setTimeout(r, 0))
    ptr(handle, 'pointerdown', 10, header + row / 2)
    ptr(window, 'pointerup', 10, header + row / 2)
    ;(handle as HTMLElement).click()
    await settle()
    expect(document.body.querySelector('.me-db-popover')).not.toBeNull()
  })
})
