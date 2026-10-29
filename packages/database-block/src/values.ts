/**
 * Cell values: display text (cells, copy as TSV) and parsing typed text back into contract-typed JSON
 * (paste, typed number / date input).
 */
import type { DateDisplay, DateValue, FileValue, NumberFormat, OptionColor, Prop, SelectOption } from './types'
import { fold, isEmptyValue, uuidv7 } from './util'
import { PALETTE_NAMES } from '@toantranmei/editor'

export interface ValueContext {
  locale: string
  /** Names of people / related rows seen so far (from `people()` / `searchRows()`). */
  personName?: (id: string) => string | undefined
  rowTitle?: (id: string) => string | undefined
  now?: Date
}

const intlLocale = (locale: string) => (locale === 'vi' ? 'vi-VN' : locale === 'zh' ? 'zh-CN' : 'en-US')

export function formatNumber(n: number, config: Prop['config'], locale: string): string {
  const format = (config?.format ?? 'number') as NumberFormat
  const decimals = typeof config?.decimals === 'number' ? config.decimals : undefined
  const digits = decimals === undefined ? {} : { minimumFractionDigits: decimals, maximumFractionDigits: decimals }
  const loc = intlLocale(locale)
  if (format === 'currency') {
    try {
      return new Intl.NumberFormat(loc, { style: 'currency', currency: config?.currency || 'VND', ...digits }).format(n)
    }
    catch {
      return new Intl.NumberFormat(loc, digits).format(n)
    }
  }
  // Percent shows the stored number with a % sign (25 → 25%), like Notion.
  if (format === 'percent') return `${new Intl.NumberFormat(loc, digits).format(n)}%`
  return new Intl.NumberFormat(loc, { maximumFractionDigits: 20, ...digits }).format(n)
}

/** Parses a typed number: "1,234.5", "1.234,5" (vi), "25%", "$1,200", "1 000". */
export function parseNumber(text: string, locale = 'en'): number | null {
  let s = text.trim().replace(/[\s ]/g, '').replace(/[%$€£¥₫]|VND|USD|EUR/gi, '')
  if (!s) return null
  const comma = s.lastIndexOf(',')
  const dot = s.lastIndexOf('.')
  if (comma >= 0 && dot >= 0) {
    // The later separator is the decimal one.
    s = comma > dot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  }
  else if (comma >= 0) {
    // "1,5" in vi is a decimal; "1,234" with exactly 3 digits after is a thousands separator elsewhere.
    const after = s.length - comma - 1
    s = locale === 'vi' || after !== 3 || s.split(',').length === 1 ? s.replace(',', '.') : s.replace(/,/g, '')
    if (locale === 'vi' && s.split('.').length > 2) s = s.replace(/\./g, '')
  }
  else if (dot >= 0 && locale === 'vi' && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '')
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

// ── Dates ─────────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0')
/** Local calendar date as `YYYY-MM-DD`. */
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** `YYYY-MM-DD` or an RFC 3339 date-time → Date (local for plain dates). */
export function parseIso(s: string | undefined | null): Date | null {
  if (!s) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

export const hasTime = (s: string | undefined) => !!s && s.includes('T')

/** Day part (`YYYY-MM-DD`, local) of a date value bound. */
export const dayOf = (s: string) => (hasTime(s) ? isoDay(parseIso(s)!) : s.slice(0, 10))

export function formatDateString(s: string, display: DateDisplay | undefined, locale: string, now = new Date()): string {
  const d = parseIso(s)
  if (!d) return s
  const time = hasTime(s) ? ` ${pad(d.getHours())}:${pad(d.getMinutes())}` : ''
  const dd = pad(d.getDate())
  const mm = pad(d.getMonth() + 1)
  const yyyy = d.getFullYear()
  switch (display) {
    case 'mdy': return `${mm}/${dd}/${yyyy}${time}`
    case 'ymd': return `${yyyy}/${mm}/${dd}${time}`
    case 'relative': {
      const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000)
      try {
        return new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: 'auto' }).format(days, 'day') + time
      }
      catch {
        return `${dd}/${mm}/${yyyy}${time}`
      }
    }
    case 'dmy': return `${dd}/${mm}/${yyyy}${time}`
    default: {
      // Locale default: en → Oct 30, 2026; vi → 30/10/2026; zh → 2026/10/30.
      if (locale === 'en') return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d) + time
      if (locale === 'zh') return `${yyyy}/${mm}/${dd}${time}`
      return `${dd}/${mm}/${yyyy}${time}`
    }
  }
}

export function formatDateValue(v: DateValue, prop: Prop, locale: string, now?: Date): string {
  const display = prop.config?.format as DateDisplay | undefined
  const start = formatDateString(v.start, display, locale, now)
  return v.end ? `${start} → ${formatDateString(v.end, display, locale, now)}` : start
}

/** Parses typed / pasted dates: ISO, `30/10/2026`, `10/30/2026` (en), `2026/10/30`, optional `HH:mm`, ranges with `→`. */
export function parseDateText(text: string, locale = 'vi'): DateValue | null {
  const parts = text.split(/\s*(?:→|->|–|—|\s-\s)\s*/).filter(Boolean)
  if (!parts.length || parts.length > 2) return null
  const bounds = parts.map(p => parseOneDate(p.trim(), locale))
  if (bounds.some(b => !b)) return null
  return bounds[1] ? { start: bounds[0]!, end: bounds[1] } : { start: bounds[0]! }
}

function parseOneDate(s: string, locale: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(s)) return parseIso(s) ? s : null
  const m = /^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})(?:[ T,]+(\d{1,2}):(\d{2}))?$/.exec(s)
  if (!m) return null
  let [y, mo, d] = [0, 0, 0]
  const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (m[1]!.length === 4) [y, mo, d] = [a, b, c]
  else if (locale === 'en') [y, mo, d] = [c, a, b]
  else [y, mo, d] = [c, b, a]
  if (y < 100) y += 2000
  const date = new Date(y, mo - 1, d)
  if (date.getMonth() !== mo - 1 || date.getDate() !== d) return null
  if (m[4] !== undefined) {
    date.setHours(Number(m[4]), Number(m[5]))
    return date.toISOString()
  }
  return isoDay(date)
}

// ── Options ───────────────────────────────────────────────────────────────────

export const optionsOf = (prop: Prop): SelectOption[] => prop.config?.options ?? []
export const optionById = (prop: Prop, id: unknown) => optionsOf(prop).find(o => o.id === id)

/** Next palette color for a new option (round robin, like Notion). */
export function nextColor(options: SelectOption[]): OptionColor {
  const colors = PALETTE_NAMES as readonly OptionColor[]
  return colors[options.length % colors.length]!
}

export const newOption = (name: string, options: SelectOption[]): SelectOption => ({ id: uuidv7(), name, color: nextColor(options) })

// ── Display text ──────────────────────────────────────────────────────────────

/** Plain text of a value: what a cell shows in text form and what copy puts on the clipboard. */
export function displayText(prop: Prop, value: unknown, ctx: ValueContext): string {
  if (isEmptyValue(value)) return ''
  switch (prop.type) {
    case 'number':
      return typeof value === 'number' ? formatNumber(value, prop.config, ctx.locale) : String(value)
    case 'select':
    case 'status':
      return optionById(prop, value)?.name ?? ''
    case 'multi_select':
      return (Array.isArray(value) ? value : []).map(id => optionById(prop, id)?.name).filter(Boolean).join(', ')
    case 'date':
    case 'created_time':
    case 'last_edited_time': {
      if (typeof value === 'number') return formatDateString(new Date(value).toISOString(), prop.config?.format as DateDisplay, ctx.locale, ctx.now)
      if (typeof value === 'string') return formatDateString(value, prop.config?.format as DateDisplay, ctx.locale, ctx.now)
      return formatDateValue(value as DateValue, prop, ctx.locale, ctx.now)
    }
    case 'person':
    case 'created_by':
    case 'last_edited_by': {
      const ids = Array.isArray(value) ? value : [value]
      return ids.map(id => ctx.personName?.(String(id)) ?? String(id)).join(', ')
    }
    case 'relation':
      return (Array.isArray(value) ? value : []).map(id => ctx.rowTitle?.(String(id)) ?? String(id)).join(', ')
    case 'files':
      return (Array.isArray(value) ? value as FileValue[] : []).map(f => f.url || f.name).join(', ')
    case 'checkbox':
      return value ? 'true' : 'false'
    case 'unique_id':
      return prop.config?.prefix ? `${prop.config.prefix}-${value}` : String(value)
    default:
      if (typeof value === 'object') return Array.isArray(value) ? value.map(String).join(', ') : JSON.stringify(value)
      return String(value)
  }
}

// ── Parsing pasted text ───────────────────────────────────────────────────────

export interface ParsedValue {
  value: unknown
  /** Options to add to the property first (select / multi-select / status names that didn't exist). */
  newOptions?: SelectOption[]
}

/**
 * Pasted / typed text → contract-typed value. `undefined` value: nothing to write (read-only type or unparsable).
 * Empty text clears the cell (`null`).
 */
export function parseText(prop: Prop, text: string, ctx: ValueContext, allowNewOptions = true): ParsedValue {
  const s = text.trim()
  if (!s) return { value: null }
  switch (prop.type) {
    case 'title': case 'text': case 'url': case 'email': case 'phone':
      return { value: prop.type === 'title' || prop.type === 'text' ? text : s }
    case 'number': {
      const n = parseNumber(s, ctx.locale)
      return { value: n === null ? undefined : n }
    }
    case 'checkbox':
      return { value: /^(true|yes|1|x|✓|✔|có|是|checked|on)$/i.test(s) }
    case 'date':
      return { value: parseDateText(s, ctx.locale) ?? undefined }
    case 'select': case 'status': {
      const found = findOption(prop, s)
      if (found) return { value: found.id }
      if (!allowNewOptions || prop.type === 'status') return { value: undefined }
      const opt = newOption(s, optionsOf(prop))
      return { value: opt.id, newOptions: [opt] }
    }
    case 'multi_select': {
      const options = [...optionsOf(prop)]
      const created: SelectOption[] = []
      const ids: string[] = []
      for (const name of s.split(/\s*[,;]\s*/).filter(Boolean)) {
        const found = options.find(o => fold(o.name) === fold(name))
        if (found) ids.push(found.id)
        else if (allowNewOptions) {
          const opt = newOption(name, options)
          options.push(opt)
          created.push(opt)
          ids.push(opt.id)
        }
      }
      return created.length ? { value: ids, newOptions: created } : { value: ids }
    }
    case 'person': case 'relation': {
      // Pasted names can't be resolved synchronously: keep ids that look like ids.
      const ids = s.split(/\s*,\s*/).filter(Boolean)
      return { value: ids }
    }
    case 'files':
      return { value: s.split(/\s*,\s*/).filter(Boolean).map(url => ({ id: uuidv7(), name: url.split('/').pop() || url, url })) }
    default:
      return { value: undefined }
  }
}

const findOption = (prop: Prop, name: string) => optionsOf(prop).find(o => fold(o.name) === fold(name))

/** True when converting a property's values from one type to another can lose data. */
export function isLossyChange(from: Prop['type'], to: Prop['type']): boolean {
  if (from === to) return false
  const textLike = new Set(['title', 'text', 'url', 'email', 'phone'])
  if (textLike.has(from) && textLike.has(to)) return false
  // Anything renders to text; select → multi-select keeps every value.
  if (to === 'text') return false
  if (from === 'select' && to === 'multi_select') return false
  if (from === 'select' && to === 'status') return false
  if (from === 'status' && to === 'select') return false
  return true
}
