import type { Prop, PropType, View } from './types'

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

export const READ_ONLY_TYPES: ReadonlySet<PropType> = new Set(['rollup', 'formula', 'created_time', 'last_edited_time', 'created_by', 'last_edited_by', 'unique_id'])
export const isReadOnly = (type: PropType) => READ_ONLY_TYPES.has(type)
export const OPTION_TYPES: ReadonlySet<PropType> = new Set(['select', 'multi_select', 'status'])

/** Types a user can pick for a new property (title exists exactly once). */
export const CREATABLE_TYPES: PropType[] = [
  'text', 'number', 'select', 'multi_select', 'status', 'date', 'person', 'files', 'checkbox', 'url', 'email', 'phone',
  'relation', 'rollup', 'formula', 'created_time', 'last_edited_time', 'created_by', 'last_edited_by', 'unique_id',
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

/** Reads a numeric CSS length (px) of a token from an element, with a fallback. */
export function cssPx(el: Element | null | undefined, name: string, fallback: string): number {
  const raw = el && typeof getComputedStyle === 'function' ? getComputedStyle(el).getPropertyValue(name).trim() : ''
  const n = Number.parseFloat(raw || fallback)
  return Number.isFinite(n) ? n : Number.parseFloat(fallback)
}
