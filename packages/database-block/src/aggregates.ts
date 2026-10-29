import { resultType } from './filters'
import type { AggregateFn, Prop } from './types'
import { formatDateString, formatNumber } from './values'

const COMMON: AggregateFn[] = ['count', 'count_values', 'count_empty', 'count_not_empty', 'percent_empty', 'percent_not_empty', 'unique']

/** Footer calculations offered for a property. */
export function aggregatesFor(prop: Prop): AggregateFn[] {
  const type = resultType(prop)
  if (type === 'checkbox') return ['count', 'checked', 'unchecked', 'percent_checked']
  if (type === 'number' || type === 'unique_id') return [...COMMON, 'sum', 'avg', 'min', 'max', 'median', 'range']
  if (type === 'date' || type === 'created_time' || type === 'last_edited_time') return [...COMMON, 'earliest', 'latest', 'range']
  return COMMON
}

/** Text of an aggregate result, formatted like the column's values. */
export function formatAggregate(prop: Prop, fn: string, value: number | string | null, locale: string): string {
  if (value === null || value === undefined) return '–'
  if (typeof value === 'string') return /^\d{4}-\d{2}-\d{2}/.test(value) ? formatDateString(value, undefined, locale) : value
  if (fn.startsWith('percent')) return `${formatNumber(Math.round(value * 10) / 10, { format: 'number' }, locale)}%`
  if (['sum', 'avg', 'min', 'max', 'median'].includes(fn) && resultType(prop) === 'number') {
    const config = fn === 'avg' && prop.config?.decimals === undefined ? { ...prop.config, decimals: 2 } : prop.config
    return formatNumber(value, config, locale)
  }
  if (fn === 'range' && (prop.type === 'date' || prop.type.endsWith('_time'))) return `${Math.round(value / 86400000)}d`
  return formatNumber(value, { format: 'number' }, locale)
}
