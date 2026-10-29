/**
 * `@toantranmei/database-block/memory`: an in-memory `DatabaseSource` that runs the contract's queries in JS
 * (filters, sorts, search, groups, aggregates, chart, pivot, a small formula language). For demos, tests and
 * prototyping — a real app runs these in its SQLite worker / on the server (`notes-core`).
 */
import { ref } from 'vue'
import type {
  ChartResult, DatabaseSource, DateValue, FilterCondition, FilterGroup, FilterNode, FormulaCheck, Group, Person,
  PivotResult, Prop, Row, RowQuery, View, ViewConfig,
} from './types'
import { byPosition, fold, isEmptyValue, uuidv7 } from './util'

export interface MemoryRow extends Row {
  created_time?: number
  created_by?: string
  last_edited_time?: number
  last_edited_by?: string
  unique_id?: number
}

export interface MemorySourceInit {
  databaseId?: string
  meta?: { title: string, icon?: string | null }
  props: Prop[]
  views: View[]
  rows?: MemoryRow[]
  people?: Person[]
  /** Other databases' rows for relation search: `{ [databaseId]: [{ id, title }] }`. */
  related?: Record<string, Array<{ id: string, title: string }>>
  /** Simulated latency of reads, ms (0: next microtask). */
  latency?: number
  /**
   * Apply row / cell writes this many ms later (then bump `version`), like a real source whose writes go through a
   * worker: `createRow` still returns the id at once. Default 0: applied synchronously.
   */
  writeDelay?: number
  /** Current user id for created_by / last_edited_by. */
  userId?: string
  canEditContent?: boolean
  canEditStructure?: boolean
  openRow?: (rowId: string) => void
}

export interface MemorySource extends DatabaseSource {
  /** All rows, in position order (for tests). */
  all: () => MemoryRow[]
  /** Calls made (for tests and the playground's request log). */
  log: Array<{ method: string, args: unknown[] }>
}

// ── Formula: a tiny expression language (subset of contract 1.4) ─────────────

type Tok = { t: 'num' | 'str' | 'id' | 'op' | 'p', v: string, at: number }

function tokenize(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]!
    if (/\s/.test(ch)) { i++; continue }
    if (/\d/.test(ch)) {
      const m = /^\d+(\.\d+)?/.exec(src.slice(i))!
      out.push({ t: 'num', v: m[0], at: i })
      i += m[0].length
      continue
    }
    if (ch === '"') {
      let j = i + 1
      let s = ''
      while (j < src.length && src[j] !== '"') s += src[j++]
      if (j >= src.length) throw formulaError('Unterminated string', i)
      out.push({ t: 'str', v: s, at: i })
      i = j + 1
      continue
    }
    if (/[A-Z_]/i.test(ch)) {
      const m = /^[A-Z_]\w*/i.exec(src.slice(i))!
      out.push({ t: 'id', v: m[0], at: i })
      i += m[0].length
      continue
    }
    const two = src.slice(i, i + 2)
    if (['==', '!=', '>=', '<='].includes(two)) {
      out.push({ t: 'op', v: two, at: i })
      i += 2
      continue
    }
    if ('+-*/%^<>'.includes(ch)) { out.push({ t: 'op', v: ch, at: i }); i++; continue }
    if ('(),'.includes(ch)) { out.push({ t: 'p', v: ch, at: i }); i++; continue }
    throw formulaError(`Unexpected "${ch}"`, i)
  }
  return out
}

class FormulaError extends Error {
  constructor(message: string, readonly position: number) {
    super(message)
  }
}
const formulaError = (m: string, at: number) => new FormulaError(m, at)

type Expr = (row: MemoryRow) => unknown
const FUNCS: Record<string, (...a: unknown[]) => unknown> = {
  length: s => String(s ?? '').length,
  upper: s => String(s ?? '').toUpperCase(),
  lower: s => String(s ?? '').toLowerCase(),
  trim: s => String(s ?? '').trim(),
  concat: (...a) => a.map(x => String(x ?? '')).join(''),
  contains: (s, t) => String(s ?? '').includes(String(t ?? '')),
  round: (n, d = 0) => Math.round(Number(n) * 10 ** Number(d)) / 10 ** Number(d),
  floor: n => Math.floor(Number(n)),
  ceil: n => Math.ceil(Number(n)),
  abs: n => Math.abs(Number(n)),
  sqrt: n => Math.sqrt(Number(n)),
  min: (...a) => Math.min(...a.map(Number)),
  max: (...a) => Math.max(...a.map(Number)),
  sum: (...a) => a.reduce((s: number, x) => s + Number(x ?? 0), 0),
  toNumber: s => Number(s),
  format: s => String(s ?? ''),
  empty: s => isEmptyValue(s),
  if: (c, a, b) => (c ? a : b),
  now: () => new Date().toISOString(),
  today: () => new Date().toISOString().slice(0, 10),
}

function compileFormula(src: string, props: Prop[], selfId?: string): Expr {
  const toks = tokenize(src)
  let i = 0
  const peek = () => toks[i]
  const expect = (v: string) => {
    const t = toks[i]
    if (!t || t.v !== v) throw formulaError(`Expected "${v}"`, t?.at ?? src.length)
    i++
  }
  const prec: Record<string, number> = { '==': 1, '!=': 1, '>': 2, '>=': 2, '<': 2, '<=': 2, '+': 3, '-': 3, '*': 4, '/': 4, '%': 4, '^': 5 }
  const binary = (op: string, a: Expr, b: Expr): Expr => {
    switch (op) {
      case '+': return r => {
        const x = a(r)
        const y = b(r)
        return typeof x === 'string' || typeof y === 'string' ? `${x ?? ''}${y ?? ''}` : Number(x ?? 0) + Number(y ?? 0)
      }
      case '-': return r => Number(a(r) ?? 0) - Number(b(r) ?? 0)
      case '*': return r => Number(a(r) ?? 0) * Number(b(r) ?? 0)
      case '/': return r => Number(a(r) ?? 0) / Number(b(r) ?? 0)
      case '%': return r => Number(a(r) ?? 0) % Number(b(r) ?? 0)
      case '^': return r => Number(a(r) ?? 0) ** Number(b(r) ?? 0)
      case '==': return r => a(r) === b(r)
      case '!=': return r => a(r) !== b(r)
      case '>': return r => Number(a(r)) > Number(b(r))
      case '>=': return r => Number(a(r)) >= Number(b(r))
      case '<': return r => Number(a(r)) < Number(b(r))
      default: return r => Number(a(r)) <= Number(b(r))
    }
  }
  const parseExpr = (min = 0): Expr => {
    let left = parseUnary()
    for (;;) {
      const t = peek()
      if (!t || t.t !== 'op' || (prec[t.v] ?? 0) <= min - 1 || (prec[t.v] ?? 0) < min) break
      i++
      const p = prec[t.v]!
      const right = parseExpr(t.v === '^' ? p : p + 1)
      left = binary(t.v, left, right)
    }
    return left
  }
  const parseUnary = (): Expr => {
    const t = peek()
    if (t?.t === 'op' && t.v === '-') {
      i++
      const e = parseUnary()
      return r => -Number(e(r))
    }
    return parsePrimary()
  }
  const parsePrimary = (): Expr => {
    const t = toks[i++]
    if (!t) throw formulaError('Unexpected end of formula', src.length)
    if (t.t === 'num') {
      const n = Number(t.v)
      return () => n
    }
    if (t.t === 'str') return () => t.v
    if (t.t === 'p' && t.v === '(') {
      const e = parseExpr()
      expect(')')
      return e
    }
    if (t.t === 'id') {
      if (t.v === 'true' || t.v === 'false') {
        const b = t.v === 'true'
        return () => b
      }
      expect('(')
      const args: Expr[] = []
      if (peek()?.v !== ')') {
        for (;;) {
          args.push(parseExpr())
          if (peek()?.v === ',') { i++; continue }
          break
        }
      }
      expect(')')
      if (t.v === 'prop') {
        const nameTok = toks[i - 2]
        const name = nameTok?.t === 'str' ? nameTok.v : ''
        const prop = props.find(p => p.name === name || p.id === name)
        if (!prop) throw formulaError(`Unknown property "${name}"`, t.at)
        if (prop.id === selfId) throw formulaError('A formula cannot reference itself', t.at)
        return r => valueOf(r, prop, props)
      }
      const fn = FUNCS[t.v]
      if (!fn) throw formulaError(`Unknown function "${t.v}"`, t.at)
      return r => fn(...args.map(a => a(r)))
    }
    throw formulaError(`Unexpected "${t.v}"`, t.at)
  }
  const e = parseExpr()
  if (i < toks.length) throw formulaError(`Unexpected "${toks[i]!.v}"`, toks[i]!.at)
  return e
}

const formulaCache = new WeakMap<Prop, Expr | null>()
function valueOf(row: MemoryRow, prop: Prop, props: Prop[]): unknown {
  switch (prop.type) {
    case 'formula': {
      let fn = formulaCache.get(prop)
      if (fn === undefined) {
        try {
          fn = compileFormula(prop.config?.expression ?? '', props, prop.id)
        }
        catch {
          fn = null
        }
        formulaCache.set(prop, fn)
      }
      try {
        const v = fn?.(row)
        return typeof v === 'number' && !Number.isFinite(v) ? null : v ?? null
      }
      catch {
        return null
      }
    }
    case 'created_time': return row.created_time
    case 'last_edited_time': return row.last_edited_time
    case 'created_by': return row.created_by
    case 'last_edited_by': return row.last_edited_by
    case 'unique_id': return row.unique_id
    case 'rollup': return row.computed?.[prop.id] ?? null
    default: return row.values[prop.id]
  }
}

// ── Filters ──────────────────────────────────────────────────────────────────

const DAY = 86400000
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
function dateMs(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return v
  const s = typeof v === 'string' ? v : (v as DateValue).start
  if (!s) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  const t = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : new Date(s).getTime()
  return Number.isNaN(t) ? null : t
}
function dayMs(v: unknown): number | null {
  const t = dateMs(v)
  return t === null ? null : startOfDay(new Date(t))
}
function relativeRange(rel: string, now = new Date()): [number, number] {
  const today = startOfDay(now)
  const dow = (now.getDay() + 6) % 7
  const weekStart = today - dow * DAY
  const month = (offset: number) => [new Date(now.getFullYear(), now.getMonth() + offset, 1).getTime(), new Date(now.getFullYear(), now.getMonth() + offset + 1, 1).getTime() - 1] as [number, number]
  switch (rel) {
    case 'today': return [today, today + DAY - 1]
    case 'tomorrow': return [today + DAY, today + 2 * DAY - 1]
    case 'yesterday': return [today - DAY, today - 1]
    case 'this_week': return [weekStart, weekStart + 7 * DAY - 1]
    case 'past_week': return [today - 7 * DAY, today - 1]
    case 'next_week': return [today + DAY, today + 8 * DAY - 1]
    case 'this_month': return month(0)
    case 'past_month': return [today - 30 * DAY, today - 1]
    case 'next_month': return [today + DAY, today + 31 * DAY - 1]
    case 'past_year': return [today - 365 * DAY, today - 1]
    case 'next_year': return [today + DAY, today + 366 * DAY - 1]
    default: return [today, today + DAY - 1]
  }
}

function matchCondition(row: MemoryRow, c: FilterCondition, props: Map<string, Prop>, all: Prop[]): boolean {
  const prop = props.get(c.prop)
  if (!prop) return true
  const v = valueOf(row, prop, all)
  if (c.op === 'is_empty') return isEmptyValue(v)
  if (c.op === 'is_not_empty') return !isEmptyValue(v)
  const type = prop.type
  if (type === 'checkbox') return !!v === !!c.value
  if (type === 'number' || type === 'unique_id' || (type === 'formula' && typeof v === 'number') || type === 'rollup') {
    const n = typeof v === 'number' ? v : null
    const x = Number(c.value)
    if (c.value === null || c.value === undefined || c.value === '') return true
    if (n === null) return c.op === '!='
    switch (c.op) {
      case '=': return n === x
      case '!=': return n !== x
      case '>': return n > x
      case '>=': return n >= x
      case '<': return n < x
      case '<=': return n <= x
      default: return true
    }
  }
  if (type === 'select' || type === 'status') {
    const list = Array.isArray(c.value) ? c.value : [c.value]
    switch (c.op) {
      case 'is': return c.value === '' || c.value === undefined ? true : v === c.value
      case 'is_not': return v !== c.value
      case 'is_any_of': return !list.length || list.includes(v)
      case 'is_none_of': return !list.includes(v)
      default: return true
    }
  }
  if (type === 'multi_select' || type === 'person' || type === 'relation' || type === 'created_by' || type === 'last_edited_by') {
    const arr = (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]) as unknown[]
    const list = Array.isArray(c.value) ? c.value : [c.value]
    switch (c.op) {
      case 'contains': return c.value === '' || c.value === undefined ? true : arr.includes(c.value)
      case 'not_contains': return !arr.includes(c.value)
      case 'contains_any': return !list.length || list.some(x => arr.includes(x))
      case 'contains_all': return list.every(x => arr.includes(x))
      default: return true
    }
  }
  if (type === 'date' || type === 'created_time' || type === 'last_edited_time') {
    const d = dayMs(v)
    if (d === null) return false
    if (c.op === 'is_relative') {
      const [a, b] = relativeRange(String(c.value))
      return d >= a && d <= b
    }
    if (c.op === 'between') {
      const [a, b] = (Array.isArray(c.value) ? c.value : []).map(dayMs)
      return (a == null || d >= a) && (b == null || d <= b)
    }
    const x = dayMs(c.value)
    if (x === null) return true
    switch (c.op) {
      case 'is': return d === x
      case 'before': return d < x
      case 'after': return d > x
      case 'on_or_before': return d <= x
      case 'on_or_after': return d >= x
      default: return true
    }
  }
  // Text-like (title, text, url, email, phone, string formula), folded.
  const s = fold(v === null || v === undefined ? '' : String(v))
  const q = fold(String(c.value ?? ''))
  switch (c.op) {
    case 'equals': return s === q
    case 'not_equals': return s !== q
    case 'contains': return s.includes(q)
    case 'not_contains': return !s.includes(q)
    case 'starts_with': return s.startsWith(q)
    case 'ends_with': return s.endsWith(q)
    default: return true
  }
}

function matchNode(row: MemoryRow, node: FilterNode, props: Map<string, Prop>, all: Prop[]): boolean {
  if ('and' in node) return node.and.every(n => matchNode(row, n, props, all))
  if ('or' in node) return !node.or.length || node.or.some(n => matchNode(row, n, props, all))
  return matchCondition(row, node, props, all)
}

// ── Sorting / grouping helpers ───────────────────────────────────────────────

function sortKey(row: MemoryRow, prop: Prop, all: Prop[]): string | number | null {
  const v = valueOf(row, prop, all)
  if (isEmptyValue(v)) return null
  switch (prop.type) {
    case 'number': case 'unique_id': case 'created_time': case 'last_edited_time': return typeof v === 'number' ? v : Number(v)
    case 'checkbox': return v ? 1 : 0
    case 'date': return dateMs(v)
    case 'select': case 'status': {
      const i = (prop.config?.options ?? []).findIndex(o => o.id === v)
      return i < 0 ? null : i
    }
    case 'multi_select': {
      const names = (v as string[]).map(id => prop.config?.options?.find(o => o.id === id)?.name ?? '')
      return fold(names.join(','))
    }
    default: return typeof v === 'number' ? v : fold(Array.isArray(v) ? v.join(',') : String(v))
  }
}

function groupKeys(row: MemoryRow, prop: Prop, all: Prop[]): Array<string | null> {
  const v = valueOf(row, prop, all)
  if (prop.type === 'checkbox') return [v ? 'true' : 'false']
  if (isEmptyValue(v)) return [null]
  if (Array.isArray(v)) return v.map(String)
  if (prop.type === 'date') {
    const t = dateMs(v)
    return [t === null ? null : new Date(t).toISOString().slice(0, 7)]
  }
  return [String(v)]
}

function groupLabel(prop: Prop, key: string | null, people: Person[], titles: (id: string) => string | undefined): string {
  if (key === null) return ''
  if (prop.type === 'checkbox') return key === 'true' ? '✓' : '✗'
  const opt = prop.config?.options?.find(o => o.id === key)
  if (opt) return opt.name
  if (prop.type === 'person' || prop.type === 'created_by' || prop.type === 'last_edited_by') return people.find(p => p.id === key)?.name ?? key
  if (prop.type === 'relation') return titles(key) ?? key
  return key
}

function aggregateValues(values: unknown[], fn: string, prop: Prop): number | string | null {
  const nonEmpty = values.filter(v => !isEmptyValue(v))
  const nums = nonEmpty.map(v => (typeof v === 'number' ? v : prop.type === 'date' || prop.type.endsWith('_time') ? dateMs(v) : Number(v))).filter((n): n is number => n !== null && Number.isFinite(n))
  const total = values.length
  switch (fn) {
    case 'count': return total
    case 'count_values': return nonEmpty.reduce((s: number, v) => s + (Array.isArray(v) ? v.length : 1), 0)
    case 'count_empty': return total - nonEmpty.length
    case 'count_not_empty': return nonEmpty.length
    case 'percent_empty': return total ? Math.round(((total - nonEmpty.length) / total) * 1000) / 10 : 0
    case 'percent_not_empty': return total ? Math.round((nonEmpty.length / total) * 1000) / 10 : 0
    case 'unique': return new Set(nonEmpty.flatMap(v => (Array.isArray(v) ? v : [v])).map(v => JSON.stringify(v))).size
    case 'checked': return values.filter(Boolean).length
    case 'unchecked': return values.filter(v => !v).length
    case 'percent_checked': return total ? Math.round((values.filter(Boolean).length / total) * 1000) / 10 : 0
    case 'sum': return nums.reduce((s, n) => s + n, 0)
    case 'avg': return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : null
    case 'min': return nums.length ? nums.reduce((a, b) => Math.min(a, b)) : null
    case 'max': return nums.length ? nums.reduce((a, b) => Math.max(a, b)) : null
    case 'median': {
      if (!nums.length) return null
      const s = [...nums].sort((a, b) => a - b)
      const mid = Math.floor(s.length / 2)
      return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
    }
    case 'range': return nums.length ? nums.reduce((a, b) => Math.max(a, b)) - nums.reduce((a, b) => Math.min(a, b)) : null
    case 'earliest': return nums.length ? new Date(nums.reduce((a, b) => Math.min(a, b))).toISOString().slice(0, 10) : null
    case 'latest': return nums.length ? new Date(nums.reduce((a, b) => Math.max(a, b))).toISOString().slice(0, 10) : null
    default: return null
  }
}

function bucketOf(v: unknown, bucket: string | undefined): string | null {
  const t = dateMs(v)
  if (t === null) return null
  const d = new Date(t)
  const pad = (n: number) => String(n).padStart(2, '0')
  switch (bucket) {
    case 'year': return String(d.getFullYear())
    case 'month': return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
    case 'week': {
      const monday = new Date(startOfDay(d) - ((d.getDay() + 6) % 7) * DAY)
      return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`
    }
    default: return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }
}

// ── The source ───────────────────────────────────────────────────────────────

export function createMemorySource(init: MemorySourceInit): MemorySource {
  const databaseId = init.databaseId ?? uuidv7()
  const meta = ref(init.meta ?? { title: '', icon: null })
  const props = ref<Prop[]>(init.props)
  const views = ref<View[]>(init.views)
  const version = ref(0)
  const canEditContent = ref(init.canEditContent ?? true)
  const canEditStructure = ref(init.canEditStructure ?? true)
  const people = init.people ?? []
  const userId = init.userId ?? people[0]?.id ?? 'me'
  const log: MemorySource['log'] = []

  // Rows in position order; `order` is a numeric twin of `position` for cheap moves.
  let rows: MemoryRow[] = [...(init.rows ?? [])].sort(byPosition)
  const byId = new Map(rows.map(r => [r.id, r]))
  let uniqueId = rows.reduce((m, r) => Math.max(m, r.unique_id ?? 0), 0)

  const wait = <T>(v: T): Promise<T> => (init.latency ? new Promise(r => setTimeout(r, init.latency, v)) : Promise.resolve(v))
  const viewOf = (id: string) => views.value.find(v => v.id === id) ?? views.value[0]
  const titleProp = () => props.value.find(p => p.type === 'title')
  const titleOf = (r: MemoryRow) => String(r.values[titleProp()?.id ?? ''] ?? '')
  const titleById = (id: string) => {
    const r = byId.get(id)
    if (r) return titleOf(r)
    for (const list of Object.values(init.related ?? {})) {
      const x = list.find(i => i.id === id)
      if (x) return x.title
    }
    return undefined
  }

  // Filtered + sorted id lists, cached per (view config, search, data version).
  let cache = new Map<string, MemoryRow[]>()
  let cacheVersion = -1
  function query(viewId: string, q?: RowQuery, override?: Partial<ViewConfig>): MemoryRow[] {
    const view = viewOf(viewId)
    const config = { ...view?.config, ...override }
    const key = JSON.stringify([viewId, config.filter, config.sorts, q?.search ?? '', props.value.length])
    if (cacheVersion !== version.value) {
      cache = new Map()
      cacheVersion = version.value
    }
    const hit = cache.get(key)
    if (hit) return hit
    const all = props.value
    const map = new Map(all.map(p => [p.id, p]))
    let list = rows
    if (config.filter) list = list.filter(r => matchNode(r, config.filter as FilterGroup, map, all))
    const search = fold(q?.search?.trim() ?? '')
    if (search) {
      const textProps = all.filter(p => ['title', 'text', 'url', 'email', 'phone'].includes(p.type))
      list = list.filter(r => textProps.some(p => fold(String(r.values[p.id] ?? '')).includes(search)))
    }
    const sorts = (config.sorts ?? []).map(s => ({ s, prop: map.get(s.prop) })).filter(x => x.prop)
    if (sorts.length) {
      const keyed = list.map(r => ({ r, k: sorts.map(x => sortKey(r, x.prop!, all)) }))
      keyed.sort((a, b) => {
        for (let i = 0; i < sorts.length; i++) {
          const x = a.k[i]
          const y = b.k[i]
          if (x === y) continue
          // Empty values last, whatever the direction (like Notion).
          if (x === null || x === undefined) return 1
          if (y === null || y === undefined) return -1
          const c = x < y ? -1 : 1
          return sorts[i]!.s.dir === 'desc' ? -c : c
        }
        return 0
      })
      list = keyed.map(x => x.r)
    }
    cache.set(key, list)
    return list
  }

  function groupsOf(viewId: string, q?: RowQuery): Map<string | null, MemoryRow[]> {
    const view = viewOf(viewId)
    const prop = props.value.find(p => p.id === view?.config.group_by?.prop)
    const out = new Map<string | null, MemoryRow[]>()
    if (!prop) return out
    // Every option is a group, even when empty (so boards show all columns).
    for (const o of prop.config?.options ?? []) out.set(o.id, [])
    if (prop.type === 'checkbox') {
      out.set('true', [])
      out.set('false', [])
    }
    for (const r of query(viewId, q)) {
      for (const k of groupKeys(r, prop, props.value)) {
        let list = out.get(k)
        if (!list) out.set(k, (list = []))
        list.push(r)
      }
    }
    if (!out.has(null)) out.set(null, [])
    // "No value" first, like Notion.
    const nulls = out.get(null)!
    out.delete(null)
    return new Map([[null, nulls], ...out])
  }

  const page = (list: MemoryRow[], w: { offset: number, limit: number }) => ({
    rows: list.slice(w.offset, w.offset + w.limit).map(r => ({ ...r, computed: computedOf(r) })),
    total: list.length,
  })
  function computedOf(r: MemoryRow): Record<string, unknown> | undefined {
    const calc = props.value.filter(p => ['formula', 'rollup', 'created_time', 'last_edited_time', 'created_by', 'last_edited_by', 'unique_id'].includes(p.type))
    if (!calc.length) return r.computed
    const out: Record<string, unknown> = { ...r.computed }
    for (const p of calc) out[p.id] = valueOf(r, p, props.value)
    return out
  }
  const touch = (r: MemoryRow) => {
    r.last_edited_time = Date.now()
    r.last_edited_by = userId
  }
  const bump = () => version.value++
  /** Runs a row / cell write now, or after `writeDelay` (pending writes keep their order). */
  const apply = (fn: () => void) => (init.writeDelay ? void setTimeout(fn, init.writeDelay) : fn())
  const record = (method: string, args: unknown[]) => log.push({ method, args })

  const source: MemorySource = {
    meta, props, views, version, canEditContent, canEditStructure, log,
    all: () => rows,

    async rows(viewId, w, q) {
      record('rows', [viewId, w, q])
      return wait(page(query(viewId, q), w))
    },
    async groups(viewId, q) {
      record('groups', [viewId, q])
      const view = viewOf(viewId)
      const prop = props.value.find(p => p.id === view?.config.group_by?.prop)
      const groups: Group[] = []
      if (prop) for (const [key, list] of groupsOf(viewId, q)) groups.push({ key, label: groupLabel(prop, key, people, titleById), count: list.length })
      return wait(groups)
    },
    async rowsInGroup(viewId, key, w, q) {
      record('rowsInGroup', [viewId, key, w, q])
      return wait(page(groupsOf(viewId, q).get(key) ?? [], w))
    },
    async aggregate(viewId, propId, fn, q) {
      record('aggregate', [viewId, propId, fn, q])
      const prop = props.value.find(p => p.id === propId)
      if (!prop) return wait(null)
      return wait(aggregateValues(query(viewId, q).map(r => valueOf(r, prop, props.value)), fn, prop))
    },
    async chart(viewId): Promise<ChartResult> {
      record('chart', [viewId])
      const view = viewOf(viewId)
      const c = view?.config ?? {}
      const all = props.value
      const xProp = all.find(p => p.id === c.x?.prop)
      if (!xProp) return wait({ x: [], series: [] })
      const ys = c.y?.length ? c.y : [{ fn: 'count' as const }]
      const seriesProp = all.find(p => p.id === c.series)
      const isDate = ['date', 'created_time', 'last_edited_time'].includes(xProp.type)
      const xKey = (r: MemoryRow): string[] => {
        const v = valueOf(r, xProp, all)
        if (isDate) {
          const b = bucketOf(v, c.x?.bucket)
          return b ? [b] : []
        }
        return groupKeys(r, xProp, all).map(k => (k === null ? '' : groupLabel(xProp, k, people, titleById)))
      }
      const cells = new Map<string, Map<string, MemoryRow[]>>()
      const seriesNames = new Set<string>()
      for (const r of query(viewId)) {
        const sKeys = seriesProp ? groupKeys(r, seriesProp, all).map(k => (k === null ? '' : groupLabel(seriesProp, k, people, titleById))) : ['']
        for (const x of xKey(r)) {
          let m = cells.get(x)
          if (!m) cells.set(x, (m = new Map()))
          for (const s of sKeys) {
            seriesNames.add(s)
            let list = m.get(s)
            if (!list) m.set(s, (list = []))
            list.push(r)
          }
        }
      }
      let xs = [...cells.keys()]
      if (isDate || xProp.type === 'number') xs.sort()
      else if (xProp.config?.options) {
        const order = xProp.config.options.map(o => o.name)
        xs.sort((a, b) => order.indexOf(a) - order.indexOf(b))
      }
      xs = xs.slice(0, 5000)
      const series: ChartResult['series'] = []
      for (const y of ys) {
        const yProp = all.find(p => p.id === y.prop)
        for (const s of seriesNames) {
          const name = [seriesProp ? s : '', ys.length > 1 || !seriesProp ? (yProp ? `${y.fn}(${yProp.name})` : y.fn) : ''].filter(Boolean).join(' · ')
          series.push({
            name,
            data: xs.map((x) => {
              const list = cells.get(x)?.get(s) ?? []
              if (y.fn === 'count' || !yProp) return list.length
              return Number(aggregateValues(list.map(r => valueOf(r, yProp, all)), y.fn, yProp) ?? 0)
            }),
          })
        }
      }
      return wait({ x: xs, series })
    },
    async pivot(viewId): Promise<PivotResult> {
      record('pivot', [viewId])
      const view = viewOf(viewId)
      const c = view?.config ?? {}
      const all = props.value
      const rowProps = (c.rows ?? []).map(id => all.find(p => p.id === id)).filter((p): p is Prop => !!p)
      const colProps = (c.cols ?? []).map(id => all.find(p => p.id === id)).filter((p): p is Prop => !!p)
      const value = c.values?.[0] ?? { fn: 'count' }
      const valueProp = all.find(p => p.id === value.prop)
      const label = (p: Prop, r: MemoryRow) => {
        const k = groupKeys(r, p, all)[0] ?? null
        return k === null ? '' : groupLabel(p, k, people, titleById)
      }
      const rowKeys = new Map<string, string[]>()
      const colKeys = new Map<string, string[]>()
      const buckets = new Map<string, MemoryRow[]>()
      const list = query(viewId)
      for (const r of list) {
        const rk = rowProps.map(p => label(p, r))
        const ck = colProps.map(p => label(p, r))
        const rs = JSON.stringify(rk)
        const cs = JSON.stringify(ck)
        rowKeys.set(rs, rk)
        colKeys.set(cs, ck)
        const k = `${rs}|${cs}`
        let b = buckets.get(k)
        if (!b) buckets.set(k, (b = []))
        b.push(r)
      }
      const cmp = (a: string[], b: string[]) => (a.join('\u0000') < b.join('\u0000') ? -1 : 1)
      const R = [...rowKeys.entries()].sort((a, b) => cmp(a[1], b[1]))
      const C = [...colKeys.entries()].sort((a, b) => cmp(a[1], b[1]))
      const calc = (rs: MemoryRow[]) => {
        if (value.fn === 'count' || !valueProp) return rs.length
        const v = aggregateValues(rs.map(r => valueOf(r, valueProp, all)), value.fn, valueProp)
        return typeof v === 'number' ? v : null
      }
      const cells = R.map(([rs]) => C.map(([cs]) => {
        const b = buckets.get(`${rs}|${cs}`)
        return b ? calc(b) : null
      }))
      const result: PivotResult = { rows: R.map(r => r[1]), cols: C.map(c => c[1]), cells }
      if (c.totals !== false) {
        result.totals = {
          rows: R.map(([rs]) => calc(list.filter(r => JSON.stringify(rowProps.map(p => label(p, r))) === rs))),
          cols: C.map(([cs]) => calc(list.filter(r => JSON.stringify(colProps.map(p => label(p, r))) === cs))),
          grand: calc(list),
        }
      }
      return wait(result)
    },
    async rowsInRange(viewId, propId, start, end, q) {
      record('rowsInRange', [viewId, propId, start, end, q])
      const prop = props.value.find(p => p.id === propId)
      if (!prop) return wait([])
      const a = dayMs(start)!
      const b = dayMs(end)!
      return wait(query(viewId, q).filter((r) => {
        const v = valueOf(r, prop, props.value) as DateValue | undefined
        const s = dayMs(v)
        if (s === null) return false
        const e = dayMs(v?.end) ?? s
        return s <= b && e >= a
      }).slice(0, 5000).map(r => ({ ...r, computed: computedOf(r) })))
    },

    setCell(rowId, propId, value) {
      record('setCell', [rowId, propId, value])
      apply(() => {
        const r = byId.get(rowId)
        if (!r) return
        r.values = { ...r.values }
        if (value === null || value === undefined) delete r.values[propId]
        else r.values[propId] = value
        touch(r)
        bump()
      })
    },
    createRow(initRow) {
      record('createRow', [initRow])
      const id = uuidv7()
      apply(() => {
        const at = initRow?.after === undefined || initRow.after === null ? -1 : rows.findIndex(r => r.id === initRow.after)
        const insertAt = initRow?.after === null ? 0 : at < 0 ? rows.length : at + 1
        const now = Date.now()
        const row: MemoryRow = {
          id,
          position: '',
          values: { ...initRow?.values },
          created_time: now,
          created_by: userId,
          last_edited_time: now,
          last_edited_by: userId,
          unique_id: ++uniqueId,
        }
        // `after: undefined` appends; `after: null` puts it first.
        rows = [...rows.slice(0, initRow?.after === undefined ? rows.length : insertAt), row, ...rows.slice(initRow?.after === undefined ? rows.length : insertAt)]
        renumber()
        byId.set(id, row)
        bump()
      })
      return id
    },
    deleteRows(ids) {
      record('deleteRows', [ids])
      apply(() => {
        const set = new Set(ids)
        rows = rows.filter(r => !set.has(r.id))
        ids.forEach(id => byId.delete(id))
        bump()
      })
    },
    moveRow(rowId, after, before) {
      record('moveRow', [rowId, after, before])
      apply(() => {
        const row = byId.get(rowId)
        if (!row) return
        const rest = rows.filter(r => r.id !== rowId)
        let at = after ? rest.findIndex(r => r.id === after) + 1 : before ? rest.findIndex(r => r.id === before) : 0
        if (at < 0) at = rest.length
        rows = [...rest.slice(0, at), row, ...rest.slice(at)]
        renumber()
        bump()
      })
    },
    upsertProp(prop) {
      record('upsertProp', [prop])
      const i = props.value.findIndex(p => p.id === prop.id)
      props.value = i < 0 ? [...props.value, prop] : props.value.map(p => (p.id === prop.id ? prop : p))
      bump()
    },
    deleteProp(id) {
      record('deleteProp', [id])
      props.value = props.value.filter(p => p.id !== id)
      bump()
    },
    upsertView(view) {
      record('upsertView', [view])
      const i = views.value.findIndex(v => v.id === view.id)
      views.value = i < 0 ? [...views.value, view] : views.value.map(v => (v.id === view.id ? view : v))
      // Rows depend on the view's filter / sort: caches are per config, so no version bump needed.
    },
    deleteView(id) {
      record('deleteView', [id])
      views.value = views.value.filter(v => v.id !== id)
    },
    setMeta(m) {
      record('setMeta', [m])
      meta.value = { ...meta.value, ...m, title: m.title ?? meta.value.title }
    },
    openRow(rowId) {
      record('openRow', [rowId])
      init.openRow?.(rowId)
    },
    async searchRows(dbId, q) {
      record('searchRows', [dbId, q])
      const f = fold(q)
      const list = dbId === databaseId ? rows.map(r => ({ id: r.id, title: titleOf(r) })) : init.related?.[dbId] ?? []
      return wait(list.filter(r => fold(r.title).includes(f)).slice(0, 20))
    },
    async people(q) {
      record('people', [q])
      const f = fold(q)
      return wait(people.filter(p => fold(p.name).includes(f)))
    },
    async upload(file) {
      record('upload', [file.name])
      const url = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : `memory://${file.name}`
      return wait({ id: uuidv7(), name: file.name, url })
    },
    validateFormula(expression): FormulaCheck {
      try {
        const fn = compileFormula(expression, props.value)
        const sample = rows[0]
        const v = sample ? fn(sample) : undefined
        const type = typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'boolean' : 'string'
        return { ok: true, type }
      }
      catch (error) {
        return error instanceof FormulaError
          ? { ok: false, error: error.message, position: error.position, code: 'formula_syntax' }
          : { ok: false, error: String(error) }
      }
    },
  }

  function renumber() {
    // Positions stay sortable strings: zero-padded base-36 indices.
    rows.forEach((r, i) => (r.position = `a${i.toString(36).padStart(5, '0')}`))
  }
  if (rows.some(r => !r.position)) renumber()

  return source
}

// ── Sample data (playground, benchmarks) ─────────────────────────────────────

const WORDS = ['Kế hoạch', 'Thiết kế', 'Báo cáo', 'Roadmap', 'Sprint', 'Launch', 'Review', 'Audit', 'Migration', 'Onboarding', 'Research', 'Hiring', 'Budget', 'Landing page', 'Release', 'Bugfix', 'Workshop', 'Dashboard']
const AREAS = ['Q4', 'mobile', 'web', 'API', 'billing', 'search', 'notes', 'editor', 'sync', 'infra']

/** A task database with `count` deterministic rows and one view of each type. */
export function sampleDatabase(count: number, options: { databaseId?: string, seed?: number } = {}): MemorySourceInit {
  let seed = options.seed ?? 42
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
  const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)]!
  const people: Person[] = [
    { id: 'u1', name: 'Trần Minh Anh' },
    { id: 'u2', name: 'Nguyễn Hoàng Long' },
    { id: 'u3', name: 'Lê Thu Hà' },
    { id: 'u4', name: 'Phạm Quốc Bảo' },
    { id: 'u5', name: 'Wang Lei' },
  ]
  const status = [
    { id: 's-todo', name: 'Not started', color: 'gray' as const },
    { id: 's-doing', name: 'In progress', color: 'blue' as const },
    { id: 's-done', name: 'Done', color: 'green' as const },
  ]
  const priority = [
    { id: 'p-low', name: 'Low', color: 'gray' as const },
    { id: 'p-med', name: 'Medium', color: 'yellow' as const },
    { id: 'p-high', name: 'High', color: 'red' as const },
  ]
  const tags = AREAS.map((name, i) => ({ id: `t-${name}`, name, color: (['blue', 'green', 'orange', 'purple', 'pink', 'brown', 'red', 'yellow', 'gray', 'blue'] as const)[i]! }))
  const props: Prop[] = [
    { id: 'name', name: 'Name', type: 'title', position: 'a0' },
    { id: 'status', name: 'Status', type: 'status', position: 'a1', config: { options: status, groups: [{ id: 'g-todo', name: 'To-do', option_ids: ['s-todo'] }, { id: 'g-prog', name: 'In progress', option_ids: ['s-doing'] }, { id: 'g-done', name: 'Complete', option_ids: ['s-done'] }] } },
    { id: 'priority', name: 'Priority', type: 'select', position: 'a2', config: { options: priority } },
    { id: 'tags', name: 'Tags', type: 'multi_select', position: 'a3', config: { options: tags } },
    { id: 'owner', name: 'Owner', type: 'person', position: 'a4' },
    { id: 'due', name: 'Due', type: 'date', position: 'a5', config: { format: 'dmy' } },
    { id: 'estimate', name: 'Estimate', type: 'number', position: 'a6', config: { format: 'number', decimals: 0 } },
    { id: 'budget', name: 'Budget', type: 'number', position: 'a7', config: { format: 'currency', currency: 'VND' } },
    { id: 'done', name: 'Done', type: 'checkbox', position: 'a8' },
    { id: 'link', name: 'Link', type: 'url', position: 'a9' },
    { id: 'email', name: 'Email', type: 'email', position: 'aA' },
    { id: 'notes', name: 'Notes', type: 'text', position: 'aB' },
    { id: 'cost', name: 'Cost / point', type: 'formula', position: 'aC', config: { expression: 'round(prop("Budget") / prop("Estimate"))', result_type: 'number' } },
    { id: 'files', name: 'Files', type: 'files', position: 'aD' },
    { id: 'created', name: 'Created', type: 'created_time', position: 'aE' },
    { id: 'uid', name: 'ID', type: 'unique_id', position: 'aF', config: { prefix: 'TASK' } },
  ]
  for (let i = 0; i < 8; i++) props.push({ id: `extra${i}`, name: `Field ${i + 1}`, type: i % 2 ? 'number' : 'text', position: `aG${i}` })

  const base = new Date(2026, 9, 1).getTime()
  const rows: MemoryRow[] = Array.from({ length: count }, (_, i) => {
    const start = base + Math.floor(rnd() * 120 - 30) * DAY
    const d = new Date(start)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const len = Math.floor(rnd() * 6)
    const e = new Date(start + len * DAY)
    const endIso = `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, '0')}-${String(e.getDate()).padStart(2, '0')}`
    const values: Record<string, unknown> = {
      name: `${pick(WORDS)} ${pick(AREAS)} #${i + 1}`,
      status: pick(status).id,
      priority: pick(priority).id,
      tags: [pick(tags).id, ...(rnd() > 0.6 ? [pick(tags).id] : [])].filter((v, j, a) => a.indexOf(v) === j),
      owner: [pick(people).id],
      due: len ? { start: iso, end: endIso } : { start: iso },
      estimate: 1 + Math.floor(rnd() * 13),
      budget: Math.round(rnd() * 500) * 100000,
      done: rnd() > 0.7,
      notes: rnd() > 0.5 ? 'Ghi chú ngắn' : '',
    }
    if (rnd() > 0.8) values.link = `https://example.com/${i}`
    if (rnd() > 0.85) values.email = `user${i}@example.com`
    for (let k = 0; k < 8; k++) values[`extra${k}`] = k % 2 ? Math.floor(rnd() * 1000) : `v${Math.floor(rnd() * 100)}`
    return {
      id: `r${i + 1}`,
      position: `a${i.toString(36).padStart(5, '0')}`,
      values,
      created_time: base - Math.floor(rnd() * 90) * DAY,
      created_by: pick(people).id,
      last_edited_time: base,
      last_edited_by: pick(people).id,
      unique_id: i + 1,
    }
  })

  const views: View[] = [
    { id: 'v-table', name: 'Table', type: 'table', position: 'a0', config: { aggregates: { estimate: 'sum', budget: 'avg' } } },
    { id: 'v-board', name: 'Board', type: 'board', position: 'a1', config: { group_by: { prop: 'status' }, card: { props: ['priority', 'owner', 'due'] } } },
    { id: 'v-calendar', name: 'Calendar', type: 'calendar', position: 'a2', config: { date_prop: 'due' } },
    { id: 'v-timeline', name: 'Timeline', type: 'timeline', position: 'a3', config: { start_prop: 'due', scale: 'day' } },
    { id: 'v-gallery', name: 'Gallery', type: 'gallery', position: 'a4', config: { cover: 'files', size: 'm', card: { props: ['status', 'tags'] } } },
    { id: 'v-list', name: 'List', type: 'list', position: 'a5', config: { card: { props: ['status', 'due'] } } },
    { id: 'v-chart', name: 'Chart', type: 'chart', position: 'a6', config: { chart: 'bar', x: { prop: 'status' }, y: [{ fn: 'count' }], series: 'priority', stacked: true } },
    { id: 'v-pivot', name: 'Pivot', type: 'pivot', position: 'a7', config: { rows: ['status'], cols: ['priority'], values: [{ prop: 'estimate', fn: 'sum' }], totals: true } },
  ]
  return { databaseId: options.databaseId, meta: { title: 'Tasks', icon: '✅' }, props, views, rows, people }
}
