import type { DbContext } from '../context'
import type { DateValue, Prop, Row } from '../types'
import { cellValue } from '../util'
import { dayOf, hasTime, isoDay, parseIso } from '../values'

/**
 * Rows whose date property overlaps `[start, end]` (days): the source's `rowsInRange` when it has one, otherwise the
 * first `rangeLimit` rows of the view, filtered here.
 */
export async function loadRange(db: DbContext, viewId: string, prop: Prop, start: string, end: string): Promise<Row[]> {
  if (db.source.rowsInRange) return db.source.rowsInRange(viewId, prop.id, start, end, db.query.value)
  const limit = db.options.rangeLimit ?? 2000
  const page = await db.source.rows(viewId, { offset: 0, limit }, db.query.value)
  return page.rows.filter((r) => {
    const v = cellValue(r, prop) as DateValue | undefined
    if (!v?.start) return false
    const s = dayOf(v.start)
    const e = v.end ? dayOf(v.end) : s
    return s <= end && e >= start
  })
}

function shiftBound(s: string, days: number): string {
  const d = parseIso(s)
  if (!d) return s
  d.setDate(d.getDate() + days)
  return hasTime(s) ? d.toISOString() : isoDay(d)
}

/** Moves a date value: start by `startDays`, end by `endDays` (a 1-day value gains an end when they differ). */
export function shiftDate(v: DateValue, startDays: number, endDays: number): DateValue {
  const start = shiftBound(v.start, startDays)
  if (v.end) {
    const end = shiftBound(v.end, endDays)
    return end > start ? { start, end } : { start }
  }
  if (startDays === endDays) return { start }
  const end = shiftBound(v.start, endDays)
  return end > start ? { start, end } : { start }
}
