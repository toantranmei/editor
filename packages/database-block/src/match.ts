/**
 * Filter conditions (contract 1.3) evaluated in JS on rows: the memory source's queries and the block's
 * conditional colors. `get` reads a property's value of a row (formulas, rollups, created_* included).
 */
import type { DateValue, FilterCondition, FilterNode, Prop, Row } from './types'
import { fold, isEmptyValue } from './util'

export type ValueGetter<R extends Row = Row> = (row: R, prop: Prop) => unknown

// ── Filters ──────────────────────────────────────────────────────────────────

export const DAY = 86400000
export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
export function dateMs(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return v
  const s = typeof v === 'string' ? v : (v as DateValue).start
  if (!s) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  const t = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : new Date(s).getTime()
  return Number.isNaN(t) ? null : t
}
export function dayMs(v: unknown): number | null {
  const t = dateMs(v)
  return t === null ? null : startOfDay(new Date(t))
}
export function relativeRange(rel: string, now = new Date()): [number, number] {
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

export function matchCondition<R extends Row>(row: R, c: FilterCondition, props: Map<string, Prop>, get: ValueGetter<R>): boolean {
  const prop = props.get(c.prop)
  if (!prop) return true
  const v = get(row, prop)
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

export function matchNode<R extends Row>(row: R, node: FilterNode, props: Map<string, Prop>, get: ValueGetter<R>): boolean {
  if ('and' in node) return node.and.every(n => matchNode(row, n, props, get))
  if ('or' in node) return !node.or.length || node.or.some(n => matchNode(row, n, props, get))
  return matchCondition(row, node, props, get)
}

