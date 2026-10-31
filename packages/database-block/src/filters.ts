/**
 * Filter model of the contract (1.3): operators per property type, default conditions and the JSON the
 * builder writes into `view.config.filter`.
 */
import type { FilterCondition, FilterGroup, FilterNode, FilterOp, Prop, PropType, RelativeDate } from './types'

export const TEXT_OPS: FilterOp[] = ['equals', 'not_equals', 'contains', 'not_contains', 'starts_with', 'ends_with', 'is_empty', 'is_not_empty']
export const NUMBER_OPS: FilterOp[] = ['=', '!=', '>', '>=', '<', '<=', 'is_empty', 'is_not_empty']
export const SELECT_OPS: FilterOp[] = ['is', 'is_not', 'is_any_of', 'is_none_of']
export const LIST_OPS: FilterOp[] = ['contains', 'not_contains', 'contains_any', 'contains_all']
export const DATE_OPS: FilterOp[] = ['is', 'before', 'after', 'on_or_before', 'on_or_after', 'between', 'is_relative']
export const CHECKBOX_OPS: FilterOp[] = ['is']

export const RELATIVE_DATES: RelativeDate[] = [
  'today', 'tomorrow', 'yesterday', 'this_week', 'past_week', 'next_week', 'this_month', 'past_month', 'next_month', 'past_year', 'next_year',
]

/** Filter family of a property: formula / rollup follow their result type. */
export function filterKind(prop: Prop): 'text' | 'number' | 'select' | 'list' | 'date' | 'checkbox' {
  const type = resultType(prop)
  switch (type) {
    case 'number': case 'unique_id': return 'number'
    case 'select': case 'status': return 'select'
    case 'multi_select': case 'person': case 'relation': case 'files': case 'created_by': case 'last_edited_by': return 'list'
    case 'date': case 'created_time': case 'last_edited_time': return 'date'
    case 'checkbox': return 'checkbox'
    default: return 'text'
  }
}

/**
 * Type a formula / rollup produces. Formulas may carry `config.result_type` (set from `validateFormula`);
 * numeric rollups (`count`, `sum`, …) are numbers, date rollups are dates.
 */
export function resultType(prop: Prop): PropType {
  if (prop.type === 'formula') {
    const t = prop.config?.result_type
    return t === 'number' ? 'number' : t === 'boolean' ? 'checkbox' : t === 'date' ? 'date' : 'text'
  }
  if (prop.type === 'rollup') {
    const fn = prop.config?.fn
    if (fn === 'earliest' || fn === 'latest') return 'date'
    if (fn === 'show_original' || fn === undefined) return 'text'
    return 'number'
  }
  return prop.type
}

export function opsFor(prop: Prop): FilterOp[] {
  return {
    text: TEXT_OPS,
    number: NUMBER_OPS,
    select: SELECT_OPS,
    list: LIST_OPS,
    date: DATE_OPS,
    checkbox: CHECKBOX_OPS,
  }[filterKind(prop)]
}

/** What the value editor of a condition looks like. */
export type ValueInput = 'none' | 'text' | 'number' | 'option' | 'options' | 'date' | 'date_range' | 'relative' | 'bool' | 'list'

export function valueInput(prop: Prop, op: FilterOp): ValueInput {
  if (op === 'is_empty' || op === 'is_not_empty') return 'none'
  const kind = filterKind(prop)
  switch (kind) {
    case 'number': return 'number'
    case 'select': return op === 'is_any_of' || op === 'is_none_of' ? 'options' : 'option'
    case 'list': {
      const hasOptions = prop.type === 'multi_select'
      if (op === 'contains_any' || op === 'contains_all') return hasOptions ? 'options' : 'list'
      return hasOptions ? 'option' : 'text'
    }
    case 'date': return op === 'between' ? 'date_range' : op === 'is_relative' ? 'relative' : 'date'
    case 'checkbox': return 'bool'
    default: return 'text'
  }
}

/** Value to start a condition with (and to reset to when the operator changes the value shape). */
export function defaultValue(prop: Prop, op: FilterOp): unknown {
  switch (valueInput(prop, op)) {
    case 'none': return undefined
    case 'number': return null
    case 'options': case 'list': return []
    case 'option': return prop.config?.options?.[0]?.id ?? ''
    case 'date': return ''
    case 'date_range': return ['', '']
    case 'relative': return 'today'
    case 'bool': return true
    default: return ''
  }
}

export function defaultCondition(prop: Prop): FilterCondition {
  const op = opsFor(prop)[0]!
  const value = defaultValue(prop, op)
  return value === undefined ? { prop: prop.id, op } : { prop: prop.id, op, value }
}

/** Changes the operator, keeping the value when its shape still fits. */
export function withOp(cond: FilterCondition, op: FilterOp, prop: Prop): FilterCondition {
  const before = valueInput(prop, cond.op)
  const after = valueInput(prop, op)
  if (after === 'none') return { prop: cond.prop, op }
  return { prop: cond.prop, op, value: before === after ? cond.value : defaultValue(prop, op) }
}

export const isGroup = (n: FilterNode): n is FilterGroup => 'and' in n || 'or' in n
export const groupMode = (g: FilterGroup): 'and' | 'or' => ('or' in g ? 'or' : 'and')
export const groupItems = (g: FilterGroup): FilterNode[] => ('or' in g ? g.or : g.and)
export const makeGroup = (mode: 'and' | 'or', items: FilterNode[]): FilterGroup => (mode === 'or' ? { or: items } : { and: items })

/** Number of conditions (for the toolbar badge). */
export function countConditions(n: FilterNode | undefined): number {
  if (!n) return 0
  return isGroup(n) ? groupItems(n).reduce((s, c) => s + countConditions(c), 0) : 1
}

/** Drops empty groups; returns `undefined` when nothing is left (no filter in the config). */
export function normalizeFilter(group: FilterGroup | undefined): FilterGroup | undefined {
  if (!group) return undefined
  const clean = (g: FilterGroup): FilterGroup | null => {
    const items = groupItems(g)
      .map(n => (isGroup(n) ? clean(n) : n))
      .filter((n): n is FilterNode => n !== null)
    return items.length ? makeGroup(groupMode(g), items) : null
  }
  return clean(group) ?? undefined
}

/** Props a filter condition can target. */
export const filterableProps = (props: Prop[]) => props.filter(p => p.type !== 'files')
