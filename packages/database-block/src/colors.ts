/**
 * Conditional colors of a view (`config.colors`, Notion's "Conditional color"): ordered rules, each a filter
 * condition, a palette color and a scope (the whole row / card, or only that property's cell). The first rule
 * that matches a row colors it; cell rules apply per property.
 */
import { matchCondition } from './match'
import type { ColorRule, Prop, Row } from './types'
import { cellValue } from './util'

export interface RowColors { row?: string, cells: Record<string, string> }
const NONE: RowColors = { cells: {} }

export function colorsOf(rules: ColorRule[] | undefined, props: Prop[], row: Row): RowColors {
  if (!rules?.length) return NONE
  const map = new Map(props.map(p => [p.id, p]))
  const out: RowColors = { cells: {} }
  for (const rule of rules) {
    if (rule.color === 'default' || !map.has(rule.condition.prop)) continue
    if (rule.scope === 'prop' && out.cells[rule.condition.prop]) continue
    if (rule.scope !== 'prop' && out.row) continue
    if (!matchCondition(row, rule.condition, map, cellValue)) continue
    if (rule.scope === 'prop') out.cells[rule.condition.prop] = rule.color
    else out.row = rule.color
  }
  return out
}
