import { describe, expect, it } from 'vitest'
import {
  defaultCondition, displayText, isLossyChange, navigate, normalizeFilter, opsFor, parseDateText, parseNumber,
  parseText, parseTsv, toTsv, valueInput, withOp, type Prop,
} from '../src'
import { createMemorySource, sampleDatabase } from '../src/memory-source'
import { RowStore } from '../src/row-store'
import { positionAfter, uuidv7 } from '../src/util'

const p = (type: Prop['type'], config?: Prop['config'], id = type): Prop => ({ id, name: id, type, position: 'a0', config })
const flush = () => new Promise(r => setTimeout(r, 0))

describe('filter operators (contract 1.3)', () => {
  it('offers the operators of each property type', () => {
    expect(opsFor(p('text'))).toEqual(['equals', 'not_equals', 'contains', 'not_contains', 'starts_with', 'ends_with', 'is_empty', 'is_not_empty'])
    expect(opsFor(p('title'))).toContain('starts_with')
    expect(opsFor(p('number'))).toEqual(['=', '!=', '>', '>=', '<', '<=', 'is_empty', 'is_not_empty'])
    expect(opsFor(p('select'))).toEqual(['is', 'is_not', 'is_any_of', 'is_none_of'])
    expect(opsFor(p('status'))).toEqual(['is', 'is_not', 'is_any_of', 'is_none_of'])
    for (const t of ['multi_select', 'person', 'relation'] as const) expect(opsFor(p(t))).toEqual(['contains', 'not_contains', 'contains_any', 'contains_all'])
    expect(opsFor(p('date'))).toEqual(['is', 'before', 'after', 'on_or_before', 'on_or_after', 'between', 'is_relative'])
    expect(opsFor(p('checkbox'))).toEqual(['is'])
    // Formula / rollup follow their result type.
    expect(opsFor(p('formula', { result_type: 'number' }))).toContain('>=')
    expect(opsFor(p('rollup', { fn: 'sum' }))).toContain('<')
    expect(opsFor(p('rollup', { fn: 'latest' }))).toContain('is_relative')
  })

  it('builds default conditions and keeps / resets values when the operator changes', () => {
    const sel = p('select', { options: [{ id: 'o1', name: 'A', color: 'red' }] })
    expect(defaultCondition(sel)).toEqual({ prop: 'select', op: 'is', value: 'o1' })
    expect(defaultCondition(p('checkbox'))).toEqual({ prop: 'checkbox', op: 'is', value: true })
    expect(withOp({ prop: 'select', op: 'is', value: 'o1' }, 'is_any_of', sel)).toEqual({ prop: 'select', op: 'is_any_of', value: [] })
    expect(withOp({ prop: 'text', op: 'contains', value: 'x' }, 'equals', p('text'))).toEqual({ prop: 'text', op: 'equals', value: 'x' })
    expect(withOp({ prop: 'text', op: 'contains', value: 'x' }, 'is_empty', p('text'))).toEqual({ prop: 'text', op: 'is_empty' })
    expect(valueInput(p('date'), 'is_relative')).toBe('relative')
    expect(valueInput(p('date'), 'between')).toBe('date_range')
  })

  it('normalizes away empty groups', () => {
    expect(normalizeFilter({ and: [] })).toBeUndefined()
    expect(normalizeFilter({ and: [{ or: [] }, { prop: 'a', op: 'equals', value: 'x' }] })).toEqual({ and: [{ prop: 'a', op: 'equals', value: 'x' }] })
  })
})

describe('values', () => {
  it('parses numbers in vi / en notation', () => {
    expect(parseNumber('1.234,5', 'vi')).toBe(1234.5)
    expect(parseNumber('1,234.5', 'en')).toBe(1234.5)
    expect(parseNumber('25%', 'en')).toBe(25)
    expect(parseNumber('1,5', 'vi')).toBe(1.5)
    expect(parseNumber('abc', 'en')).toBeNull()
  })

  it('parses dates and ranges into contract values', () => {
    expect(parseDateText('30/10/2026', 'vi')).toEqual({ start: '2026-10-30' })
    expect(parseDateText('10/30/2026', 'en')).toEqual({ start: '2026-10-30' })
    expect(parseDateText('2026-10-30 → 2026-11-02', 'vi')).toEqual({ start: '2026-10-30', end: '2026-11-02' })
    expect(parseDateText('31/02/2026', 'vi')).toBeNull()
    expect(parseDateText('30/10/2026 09:30', 'vi')!.start).toMatch(/^2026-10-\d\dT\d\d:30:00.000Z$/)
  })

  it('parses pasted text per type, creating select options', () => {
    const ctx = { locale: 'en' }
    const sel = p('select', { options: [{ id: 'o1', name: 'Done', color: 'green' }] })
    expect(parseText(sel, 'done', ctx)).toEqual({ value: 'o1' })
    const created = parseText(sel, 'New one', ctx)
    expect(created.newOptions).toHaveLength(1)
    expect(created.value).toBe(created.newOptions![0]!.id)
    expect(parseText(sel, 'New one', ctx, false).value).toBeUndefined()
    const multi = parseText(p('multi_select', { options: [{ id: 'a', name: 'A', color: 'red' }] }), 'A, B', ctx)
    expect(multi.value).toEqual(['a', multi.newOptions![0]!.id])
    expect(parseText(p('checkbox'), 'true', ctx)).toEqual({ value: true })
    expect(parseText(p('number'), '1,200', ctx)).toEqual({ value: 1200 })
    expect(parseText(p('number'), 'x', ctx)).toEqual({ value: undefined })
    expect(parseText(p('text'), '', ctx)).toEqual({ value: null })
    expect(parseText(p('formula'), '3', ctx)).toEqual({ value: undefined })
  })

  it('formats display text (and copies it)', () => {
    const ctx = { locale: 'en', personName: (id: string) => (id === 'u1' ? 'Anh' : undefined) }
    expect(displayText(p('number', { format: 'currency', currency: 'USD' }), 1200, ctx)).toBe('$1,200.00')
    expect(displayText(p('number', { format: 'percent' }), 25, ctx)).toBe('25%')
    expect(displayText(p('person'), ['u1', 'u2'], ctx)).toBe('Anh, u2')
    expect(displayText(p('date', { format: 'ymd' }), { start: '2026-10-30', end: '2026-11-01' }, ctx)).toBe('2026/10/30 → 2026/11/01')
    expect(displayText(p('unique_id', { prefix: 'TASK' }), 7, ctx)).toBe('TASK-7')
  })

  it('knows lossy type changes', () => {
    expect(isLossyChange('text', 'url')).toBe(false)
    expect(isLossyChange('select', 'multi_select')).toBe(false)
    expect(isLossyChange('number', 'text')).toBe(false)
    expect(isLossyChange('multi_select', 'select')).toBe(true)
    expect(isLossyChange('text', 'number')).toBe(true)
  })
})

describe('TSV', () => {
  it('round-trips quoted cells with tabs and newlines', () => {
    const rows = [['a', 'b\tc'], ['line\nbreak', 'say "hi"']]
    expect(parseTsv(toTsv(rows))).toEqual(rows)
    expect(parseTsv('1\t2\r\n3\t4\r\n')).toEqual([['1', '2'], ['3', '4']])
  })
})

describe('grid navigation', () => {
  const bounds = { rows: 5, cols: 3, isRow: (i: number) => i !== 2 }
  const at = (row: number, col: number) => ({ anchor: { row, col }, focus: { row, col } })
  it('moves with arrows, skipping non-row items, and extends with Shift', () => {
    expect(navigate(at(1, 0), { key: 'ArrowDown' }, bounds)!.focus).toEqual({ row: 3, col: 0 })
    expect(navigate(at(0, 0), { key: 'ArrowUp' }, bounds)!.focus).toEqual({ row: 0, col: 0 })
    expect(navigate(at(0, 2), { key: 'ArrowRight' }, bounds)!.focus).toEqual({ row: 0, col: 2 })
    expect(navigate(at(0, 0), { key: 'ArrowDown', metaKey: true }, bounds)!.focus).toEqual({ row: 4, col: 0 })
    const ext = navigate(at(0, 0), { key: 'ArrowRight', shiftKey: true }, bounds)!
    expect(ext).toEqual({ anchor: { row: 0, col: 0 }, focus: { row: 0, col: 1 } })
  })
  it('Tab wraps to the next row, Shift-Tab to the previous one', () => {
    expect(navigate(at(0, 2), { key: 'Tab' }, bounds)!.focus).toEqual({ row: 1, col: 0 })
    expect(navigate(at(3, 0), { key: 'Tab', shiftKey: true }, bounds)!.focus).toEqual({ row: 1, col: 2 })
    expect(navigate(at(0, 0), { key: 'x' }, bounds)).toBeNull()
  })
})

describe('util', () => {
  it('makes v7 uuids and ordered positions', () => {
    expect(uuidv7()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    let pos = 'a0'
    for (let i = 0; i < 80; i++) {
      const next = positionAfter(pos)
      expect(next > pos).toBe(true)
      pos = next
    }
  })
})

describe('memory source queries', () => {
  const src = () => createMemorySource(sampleDatabase(2000))
  it('filters, sorts and searches', async () => {
    const s = src()
    s.upsertView({ ...s.views.value[0]!, config: { filter: { and: [{ prop: 'estimate', op: '>=', value: 10 }, { or: [{ prop: 'priority', op: 'is', value: 'p-high' }, { prop: 'done', op: 'is', value: true }] }] }, sorts: [{ prop: 'estimate', dir: 'desc' }] } })
    const { rows, total } = await s.rows('v-table', { offset: 0, limit: 5000 })
    expect(total).toBe(rows.length)
    expect(rows.every(r => (r.values.estimate as number) >= 10 && (r.values.priority === 'p-high' || r.values.done === true))).toBe(true)
    expect(rows.map(r => r.values.estimate as number)).toEqual([...rows.map(r => r.values.estimate as number)].sort((a, b) => b - a))
    const found = await s.rows('v-table', { offset: 0, limit: 10 }, { search: 'roadmap' })
    expect(found.rows.every(r => String(r.values.name).toLowerCase().includes('roadmap'))).toBe(true)
  })

  it('groups, aggregates, charts and pivots', async () => {
    const s = src()
    const groups = await s.groups('v-board')
    expect(groups.map(g => g.key)).toEqual([null, 's-todo', 's-doing', 's-done'])
    expect(groups.reduce((n, g) => n + g.count, 0)).toBe(2000)
    const inGroup = await s.rowsInGroup('v-board', 's-done', { offset: 0, limit: 10 })
    expect(inGroup.rows.every(r => r.values.status === 's-done')).toBe(true)
    expect(await s.aggregate('v-table', 'estimate', 'count')).toBe(2000)
    const sum = await s.aggregate('v-table', 'estimate', 'sum')
    expect(sum).toBe(s.all().reduce((n, r) => n + (r.values.estimate as number), 0))
    const chart = await s.chart('v-chart')
    expect(chart.x).toEqual(['Not started', 'In progress', 'Done'])
    expect(chart.series.map(x => x.name).sort()).toEqual(['High', 'Low', 'Medium'])
    const pivot = await s.pivot('v-pivot')
    expect(pivot.totals!.grand).toBe(sum)
    expect(pivot.cells.length).toBe(pivot.rows.length)
  })

  it('checks formulas', () => {
    const s = src()
    expect(s.validateFormula!('prop("Budget") / prop("Estimate")')).toEqual({ ok: true, type: 'number' })
    const bad = s.validateFormula!('prop("Nope") +') as { ok: false, error: string, position: number }
    expect(bad.ok).toBe(false)
    expect(bad.error).toMatch(/Unknown property|Unexpected/)
  })
})

describe('RowStore', () => {
  it('requests only chunk-aligned windows of what is visible, and re-requests them when version changes', async () => {
    const s = createMemorySource(sampleDatabase(10_000))
    const store = new RowStore({ source: s, viewId: 'v-table', pageSize: 50, throttle: 0 })
    await flush()
    const windows = () => s.log.filter(l => l.method === 'rows').map(l => l.args[1])
    expect(windows()).toEqual([{ offset: 0, limit: 50 }])
    expect(store.itemCount()).toBe(10_000)

    s.log.length = 0
    store.ensureItems(5000, 5030)
    await flush()
    expect(windows()).toEqual([{ offset: 5000, limit: 50 }])
    expect(store.rowAt(0, 5010)?.id).toBe(s.all()[5010]!.id)

    // Overlapping range across a chunk boundary: only the missing chunk.
    s.log.length = 0
    store.ensureItems(5040, 5060)
    await flush()
    expect(windows()).toEqual([{ offset: 5050, limit: 50 }])

    // A write bumps `version`: only the visible windows are fetched again.
    s.log.length = 0
    s.setCell(s.all()[5045]!.id, 'name', 'Changed')
    await store.refresh()
    await flush()
    expect(windows()).toEqual([{ offset: 5000, limit: 100 }])
    expect(store.rowAt(0, 5045)?.values.name).toBe('Changed')
    store.destroy()
  })
})
