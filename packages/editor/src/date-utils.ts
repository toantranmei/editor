/**
 * Date mention values: local dates as `YYYY-MM-DD`, times as `HH:mm` (24h).
 * Formatting follows Notion's options (full, short, M/D/Y, D/M/Y, Y/M/D, relative).
 */
const pad = (n: number) => String(n).padStart(2, '0')

export type DateFormat = 'full' | 'short' | 'mdy' | 'dmy' | 'ymd' | 'relative'
export type TimeFormat = '12' | '24'
export const DATE_FORMATS: DateFormat[] = ['full', 'short', 'mdy', 'dmy', 'ymd', 'relative']

/** Everything a date mention stores (besides its id = start date). */
export interface DateValue {
  start: string
  end?: string | null
  time?: string | null
  endTime?: string | null
  format?: DateFormat | null
  timeFormat?: TimeFormat | null
  remind?: string | null
}

export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** `YYYY-MM-DD` → local Date (no timezone shift). */
export function parseIsoDate(id: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(id ?? '')
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
}

const dayDiff = (d: Date) => {
  const today = new Date()
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  const b = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((a - b) / 86_400_000)
}

export interface RelativeLabels { today: string, tomorrow: string, yesterday: string }

/** One date in the chosen format. */
export function formatDate(id: string, locale: string, format: DateFormat = 'relative', relative?: RelativeLabels): string {
  const d = parseIsoDate(id)
  if (!d) return id
  const dd = pad(d.getDate())
  const mm = pad(d.getMonth() + 1)
  const yyyy = d.getFullYear()
  switch (format) {
    case 'full': return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(d)
    case 'mdy': return `${mm}/${dd}/${yyyy}`
    case 'dmy': return `${dd}/${mm}/${yyyy}`
    case 'ymd': return `${yyyy}/${mm}/${dd}`
    case 'relative': {
      const diff = dayDiff(d)
      if (relative && diff === 0) return relative.today
      if (relative && diff === 1) return relative.tomorrow
      if (relative && diff === -1) return relative.yesterday
      return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: diff > -180 && diff < 180 && d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }).format(d)
    }
    default: return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(d)
  }
}

/** `HH:mm` → "2:30 PM" or "14:30". */
export function formatTime(time: string, locale: string, format: TimeFormat = '24'): string {
  const [h, m] = time.split(':').map(Number)
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return time
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', hour12: format === '12' }).format(new Date(2000, 0, 1, h, m))
}

/** The chip label: date (+ time), with "→ end" for ranges. */
export function formatDateValue(v: DateValue, locale: string, relative?: RelativeLabels): string {
  const one = (date: string, time?: string | null) => {
    const text = formatDate(date, locale, v.format ?? 'relative', relative)
    return time ? `${text} ${formatTime(time, locale, v.timeFormat ?? '24')}` : text
  }
  const start = one(v.start, v.time)
  return v.end ? `${start} → ${one(v.end, v.endTime ?? (v.time ? v.time : null))}` : start
}

/** Back-compat: short date only. */
export function formatMentionDate(id: string, locale: string): string {
  return formatDate(id, locale, 'short')
}

/** Parses what users type in the date box: 24/10/2026, 2026-10-24, 10/24/2026 (en), "Oct 24, 2026", 2026年10月24日. */
export function parseDateInput(text: string, locale: string): string | null {
  const t = text.trim()
  // Chinese: 2026年10月24日 / 10月24日
  let m = /^(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?$/.exec(t)
  if (m) return valid(m[1] ? Number(m[1]) : new Date().getFullYear(), Number(m[2]), Number(m[3]))
  m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(t)
  if (m) return valid(Number(m[1]), Number(m[2]), Number(m[3]))
  m = /^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?$/.exec(t)
  if (m) {
    const year = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : new Date().getFullYear()
    const [a, b] = [Number(m[1]), Number(m[2])]
    // en-US reads M/D, everyone else D/M.
    return locale.startsWith('en') ? valid(year, a, b) : valid(year, b, a)
  }
  const parsed = Date.parse(t)
  return Number.isNaN(parsed) ? null : isoDate(new Date(parsed))
}

function valid(y: number, mo: number, d: number): string | null {
  const date = new Date(y, mo - 1, d)
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d ? isoDate(date) : null
}

/** Parses "14:30", "9", "2:30 pm", "9am", "下午2:30", "14点" → `HH:mm`. */
export function parseTimeInput(text: string): string | null {
  const t = text.trim()
  // Chinese puts the period first: 上午 / 下午 / 晚上 9:30.
  const zh = /^(上午|早上|中午|下午|晚上)\s*/.exec(t)
  const m = /^(\d{1,2})(?:[:.h点時时](\d{2})?分?)?\s*(am|pm|sa|ch)?$/i.exec(zh ? t.slice(zh[0].length) : t)
  if (!m) return null
  let h = Number(m[1])
  const min = Number(m[2] ?? 0)
  const suffix = zh ? (zh[1] === '上午' || zh[1] === '早上' ? 'am' : zh[1] === '中午' ? (h < 11 ? 'pm' : undefined) : 'pm') : m[3]?.toLowerCase()
  if (suffix === 'pm' || suffix === 'ch') h = h % 12 + 12
  else if (suffix === 'am' || suffix === 'sa') h = h % 12
  return h < 24 && min < 60 ? `${pad(h)}:${pad(min)}` : null
}

// --- Reminders ------------------------------------------------------------------

/** Reminder presets (like Notion's). Date-only ones fire at 09:00. */
export const REMINDERS_DATE = ['none', 'day', '1d', '2d', '1w'] as const
export const REMINDERS_TIME = ['none', 'at', '5m', '10m', '15m', '30m', '1h', '2h', '1d', '2d'] as const

const OFFSET_MIN: Record<string, number> = { 'at': 0, 'day': 0, '5m': 5, '10m': 10, '15m': 15, '30m': 30, '1h': 60, '2h': 120, '1d': 1440, '2d': 2880, '1w': 10080 }

/** When the reminder should fire, or null without one. */
export function reminderTime(v: DateValue): Date | null {
  if (!v.remind || v.remind === 'none' || !(v.remind in OFFSET_MIN)) return null
  const d = parseIsoDate(v.start)
  if (!d) return null
  const [h, m] = (v.time ?? '09:00').split(':').map(Number)
  d.setHours(h ?? 9, m ?? 0, 0, 0)
  return new Date(d.getTime() - OFFSET_MIN[v.remind]! * 60_000)
}
