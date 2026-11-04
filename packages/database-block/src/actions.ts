/**
 * Buttons and automations (Notion's button property and database automations): resolving action values, running a
 * list of actions on a row, and matching automation triggers. UI-free; `context.ts` wires it to the write path.
 */
import { matchCondition } from './match'
import type { ActionValue, Automation, DbAction, DbActionType, Prop, PropType, Row } from './types'
import { isReadOnly, uuidv7 } from './util'

/** Where actions write and what they may ask of the UI. */
export interface ActionEnv {
  props: Prop[]
  setCell: (rowId: string, propId: string, value: unknown) => void
  /** Creates a row in this database (property defaults applied by the caller). */
  createRow: (values: Record<string, unknown>) => string
  currentUserId?: string | null
  now?: Date
  /** `show_confirm`: resolves to false to stop. Without it the steps run unasked. */
  confirm?: (message: string) => Promise<boolean> | boolean
  openUrl?: (url: string) => void
  openRow?: (rowId: string) => void
}

/** Types an action can write (not computed ones, not files, not buttons). */
export const ACTION_VALUE_TYPES: ReadonlySet<PropType> = new Set([
  'title', 'text', 'number', 'select', 'multi_select', 'status', 'date', 'person', 'checkbox', 'url', 'email', 'phone', 'relation',
])
export const actionWritable = (p: Prop) => ACTION_VALUE_TYPES.has(p.type) && !isReadOnly(p.type)

export const BUTTON_ACTIONS: DbActionType[] = ['set_values', 'add_row', 'open_url', 'show_confirm']
export const AUTOMATION_ACTIONS: DbActionType[] = ['set_values', 'add_row']

export function newAction(type: DbActionType): DbAction {
  const id = uuidv7()
  switch (type) {
    case 'set_values': return { id, type, values: [] }
    case 'add_row': return { id, type, values: [] }
    case 'open_url': return { id, type, url: '' }
    case 'show_confirm': return { id, type }
  }
}

const pad = (n: number) => String(n).padStart(2, '0')
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Value an action writes into `prop`; `undefined` = skip (e.g. "Me" without a known user). */
export function resolveValue(spec: ActionValue, prop: Prop, env: Pick<ActionEnv, 'currentUserId' | 'now'>): unknown {
  const now = env.now ?? new Date()
  switch (spec.dynamic) {
    case 'today': return { start: localDay(now) }
    case 'now': return { start: now.toISOString() }
    case 'me': {
      return env.currentUserId && prop.type === 'person' ? [env.currentUserId] : undefined
    }
    default: return spec.value === undefined || spec.value === '' ? null : spec.value
  }
}

/** Resolved `{ propId: value }` of an action's values (unknown / unwritable properties skipped). */
export function resolveValues(specs: ActionValue[], env: Pick<ActionEnv, 'props' | 'currentUserId' | 'now'>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const spec of specs) {
    const prop = env.props.find(p => p.id === spec.prop)
    if (!prop || !actionWritable(prop)) continue
    const v = resolveValue(spec, prop, env)
    if (v !== undefined) out[prop.id] = v
  }
  return out
}

/** A URL to open: http(s) / mailto / tel as given, anything else without a scheme gets `https://`; unsafe → null. */
export function safeUrl(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null
  if (/^(https?:|mailto:|tel:)/i.test(s)) return s
  if (/^[a-z][a-z\d+.-]*:/i.test(s)) return null
  return `https://${s}`
}

/**
 * Runs `actions` in order on `row` (null: no row, e.g. a button outside a row). Stops at a `show_confirm` the user
 * declines. Writes before the first `confirm` happen synchronously (same undo step as the caller's write).
 */
export async function runActions(actions: DbAction[], row: Row | null, env: ActionEnv): Promise<void> {
  for (const a of actions) {
    switch (a.type) {
      case 'show_confirm':
        if (env.confirm && !(await env.confirm(a.message ?? ''))) return
        break
      case 'set_values': {
        if (!row) break
        for (const [prop, value] of Object.entries(resolveValues(a.values, env))) env.setCell(row.id, prop, value)
        break
      }
      case 'add_row': {
        const id = env.createRow(resolveValues(a.values, env))
        if (a.open) env.openRow?.(id)
        break
      }
      case 'open_url': {
        const raw = a.prop ? (row ? row.values[a.prop] : undefined) : a.url
        const url = typeof raw === 'string' ? safeUrl(raw) : null
        if (url) env.openUrl?.(url)
        break
      }
    }
  }
}

/** Synchronous run for automations (no confirm, no URL, no opening): every write lands in the triggering step. */
export function runActionsNow(actions: DbAction[], row: Row | null, env: ActionEnv): void {
  void runActions(actions.filter(a => AUTOMATION_ACTIONS.includes(a.type)).map(a => (a.type === 'add_row' ? { ...a, open: false } : a)), row, { ...env, confirm: undefined, openUrl: undefined, openRow: undefined })
}

export type TriggerEvent =
  | { type: 'row_added', rowId: string }
  | { type: 'prop_changed', rowId: string, propId: string, value: unknown }

/** Enabled automations that `event` starts. */
export function triggered(list: Automation[], event: TriggerEvent, props: Prop[]): Automation[] {
  return list.filter((a) => {
    if (!a.enabled || a.trigger.type !== event.type) return false
    if (a.trigger.type === 'row_added' || event.type !== 'prop_changed') return true
    const t = a.trigger
    if (t.prop && t.prop !== event.propId) return false
    if (!t.prop || !t.condition) return true
    const prop = props.find(p => p.id === t.prop)
    if (!prop) return false
    const row: Row = { id: event.rowId, position: '', values: { [prop.id]: event.value } }
    return matchCondition(row, { ...t.condition, prop: prop.id }, new Map([[prop.id, prop]]), (r, p) => r.values[p.id])
  })
}
