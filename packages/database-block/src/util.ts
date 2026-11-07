import { isProxy, toRaw } from 'vue'
import type { DatabaseSource, FileValue, Prop, PropType, Row, View, ViewConfig, ViewType } from './types'

/** UUIDv7 (time-ordered), as the contract's ids: clients may create them. */
export function uuidv7(now = Date.now()): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let ts = now
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ts & 0xFF
    ts = Math.floor(ts / 256)
  }
  bytes[6] = (bytes[6]! & 0x0F) | 0x70
  bytes[8] = (bytes[8]! & 0x3F) | 0x80
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** A position string sorting after `last` (fractional-index style, append only). */
export function positionAfter(last: string | undefined): string {
  if (!last) return 'a0'
  const tail = last.charCodeAt(last.length - 1)
  // Bump the last character while it stays in [0-9A-Za-z]; otherwise extend.
  if (tail >= 48 && tail < 57) return last.slice(0, -1) + String.fromCharCode(tail + 1)
  if (tail === 57) return `${last.slice(0, -1)}A`
  if (tail >= 65 && tail < 90) return last.slice(0, -1) + String.fromCharCode(tail + 1)
  if (tail === 90) return `${last.slice(0, -1)}a`
  if (tail >= 97 && tail < 122) return last.slice(0, -1) + String.fromCharCode(tail + 1)
  return `${last}V`
}

export const byPosition = <T extends { position: string }>(a: T, b: T) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0)

/** Accent- and case-insensitive text, like the contract's `fold` matching. */
export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()

/** Types without a value a user edits (computed, or a button). */
export const READ_ONLY_TYPES: ReadonlySet<PropType> = new Set(['rollup', 'formula', 'created_time', 'last_edited_time', 'created_by', 'last_edited_by', 'unique_id', 'button'])
/** Types that hold no value at all: not filterable, sortable, groupable or calculable. */
export const VALUELESS_TYPES: ReadonlySet<PropType> = new Set(['button'])
export const isReadOnly = (type: PropType) => READ_ONLY_TYPES.has(type)
export const OPTION_TYPES: ReadonlySet<PropType> = new Set(['select', 'multi_select', 'status'])

/** Types a user can pick for a new property (title exists exactly once). */
export const CREATABLE_TYPES: PropType[] = [
  'text', 'number', 'select', 'multi_select', 'status', 'date', 'person', 'files', 'checkbox', 'url', 'email', 'phone',
  'relation', 'rollup', 'formula', 'created_time', 'last_edited_time', 'created_by', 'last_edited_by', 'unique_id', 'button',
]

/** Visible properties of a view, in column order. The title always comes first. */
export function visibleProps(view: View | undefined, props: Prop[]): Prop[] {
  const sorted = [...props].sort(byPosition)
  const title = sorted.find(p => p.type === 'title')
  const order = view?.config.visible
  const rest = order
    ? order.map(id => sorted.find(p => p.id === id)).filter((p): p is Prop => !!p && p.type !== 'title')
    : sorted.filter(p => p.type !== 'title')
  return title ? [title, ...rest] : rest
}

/** Ids for `config.visible` after showing / hiding / moving. */
export function visibleIds(view: View, props: Prop[]): string[] {
  return visibleProps(view, props).map(p => p.id)
}

/** Value of a cell: stored value, or the computed one for calculated types. */
export function cellValue(row: { values: Record<string, unknown>, computed?: Record<string, unknown> }, prop: Prop): unknown {
  if (isReadOnly(prop.type)) return row.computed?.[prop.id] ?? row.values[prop.id]
  return row.values[prop.id]
}

export const isEmptyValue = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)

/** Deep clone of plain JSON data. */
export const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)) as T)

/**
 * A deep copy of `v` without Vue proxies (plain objects and arrays copied, anything else such as a File kept as is).
 * Hosts may send what the block hands them to a worker (`postMessage`), and a reactive proxy can't be cloned there.
 */
export function plain<T>(v: T): T {
  const raw = isProxy(v) ? toRaw(v) : v
  if (Array.isArray(raw)) return raw.map(plain) as T
  if (raw && typeof raw === 'object' && (Object.getPrototypeOf(raw) === Object.prototype || Object.getPrototypeOf(raw) === null)) {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(raw)) out[k] = plain(x)
    return out as T
  }
  return raw
}

/** `source` whose every method gets plain arguments ({@link plain}): what the block's components hold may be reactive. */
export function plainArgs(source: DatabaseSource): DatabaseSource {
  const out = { ...source } as Record<string, unknown>
  for (const [key, fn] of Object.entries(source)) {
    if (typeof fn === 'function') out[key] = (...args: unknown[]) => (fn as (...a: unknown[]) => unknown).apply(source, args.map(plain))
  }
  return out as unknown as DatabaseSource
}

/** Reads a numeric CSS length (px) of a token from an element, with a fallback. */
export function cssPx(el: Element | null | undefined, name: string, fallback: string): number {
  const raw = el && typeof getComputedStyle === 'function' ? getComputedStyle(el).getPropertyValue(name).trim() : ''
  const n = Number.parseFloat(raw || fallback)
  return Number.isFinite(n) ? n : Number.parseFloat(fallback)
}

/** Sensible starting config per view type, from the database's properties. */
export function viewDefaults(type: ViewType, props: Prop[]): ViewConfig {
  const first = (...types: string[]) => props.find(p => types.includes(p.type))?.id
  switch (type) {
    case 'board': {
      const g = first('status', 'select', 'person')
      return g ? { group_by: { prop: g }, card: { props: [] } } : { card: { props: [] } }
    }
    case 'calendar': return { date_prop: first('date', 'created_time') }
    case 'timeline': return { start_prop: first('date', 'created_time'), scale: 'day' }
    case 'gallery': return { cover: first('files'), size: 'm', card: { props: [] } }
    case 'list': return { card: { props: [] } }
    case 'feed': return { card: { props: [] } }
    case 'dashboard': return { widgets: [{ id: uuidv7(), kind: 'number', fn: 'count' }, { id: uuidv7(), kind: 'chart', ...viewDefaults('chart', props) }] }
    case 'chart': return { chart: 'bar', x: { prop: first('status', 'select', 'date') ?? props[0]?.id ?? '' }, y: [{ fn: 'count' }] }
    case 'pivot': return { rows: [first('status', 'select') ?? ''].filter(Boolean), cols: [], values: [{ fn: 'count' }], totals: true }
    default: return {}
  }
}

/**
 * Config after switching a view to another layout: keeps what both share (filter, sorts, open mode, widths, …) and
 * fills what the new layout needs from its defaults. A board needs a group; other layouts keep theirs.
 */
export function switchLayout(view: View, type: ViewType, props: Prop[]): ViewConfig {
  const defaults = viewDefaults(type, props)
  const next: ViewConfig = { ...defaults, ...view.config }
  if (type === 'board' && !view.config.group_by && defaults.group_by) next.group_by = defaults.group_by
  return next
}

/**
 * `config.visible` with `id` placed left / right of the column `next` (title excluded: it is always first). A
 * property that is not visible yet (just created) is added.
 */
export function placeColumn(view: View, props: Prop[], id: string, next: string, side: 'left' | 'right'): string[] {
  const titleId = props.find(p => p.type === 'title')?.id
  const ids = visibleIds(view, props).filter(x => x !== id && x !== titleId)
  const at = ids.indexOf(next)
  const index = at < 0 ? (next === titleId ? 0 : ids.length) : at + (side === 'right' ? 1 : 0)
  ids.splice(index, 0, id)
  return ids
}

/** First image of a files value (cover of board / gallery cards), or null. */
export function coverImage(value: unknown): string | null {
  if (!Array.isArray(value)) return null
  const img = (value as FileValue[]).find(f => !!f?.url && (/\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i.test(f.url) || f.url.startsWith('blob:') || f.url.startsWith('data:image')))
  return img?.url ?? null
}

/** Copies every writable value (not formulas, rollups, created_* …) of each row into a new row right after it. */
export function duplicateRows(db: { props: { value: Prop[] }, source: DatabaseSource }, rows: Row[]): void {
  const keep = new Set(db.props.value.filter(p => !isReadOnly(p.type)).map(p => p.id))
  for (const row of [...rows].reverse()) {
    const values = Object.fromEntries(Object.entries(row.values).filter(([k, v]) => keep.has(k) && v !== null && v !== undefined))
    db.source.createRow({ values, after: row.id })
  }
}

/** Property types a view can group by (Board: only those that make columns). */
export function groupableTypes(viewType: ViewType | undefined): PropType[] {
  return viewType === 'board'
    ? ['select', 'status', 'person', 'checkbox', 'multi_select']
    : ['select', 'status', 'multi_select', 'person', 'checkbox', 'text', 'url', 'email', 'phone', 'date', 'relation']
}

/** The row page's icon to show before its title in `view` (`show_page_icon`, default on), or null. */
export function pageIcon(view: View | undefined, row: Row | undefined): string | null {
  if (!row?.icon || view?.config.show_page_icon === false) return null
  return row.icon
}
/** An icon given as an image (URL / data URI) rather than an emoji. */
export const isImageIcon = (icon: string) => /^(https?:|data:|blob:|\/)/.test(icon)
