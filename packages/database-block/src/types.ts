/**
 * Data shapes of the notes database contract (24-notes-contracts.md, section 1.2 / 1.3 / 1.7).
 * The block is UI only: every read and write goes through the app's `DatabaseSource`.
 */
import type { LocaleName, PaletteName } from '@toantranmei/editor'
import type { Ref } from 'vue'
import type { DatabaseMessages } from './messages'

// ── 1.2 Property ──────────────────────────────────────────────────────────────

export type PropType =
  | 'title' | 'text' | 'number' | 'select' | 'multi_select' | 'status' | 'date' | 'person' | 'files' | 'checkbox'
  | 'url' | 'email' | 'phone' | 'relation' | 'rollup' | 'formula'
  | 'created_time' | 'last_edited_time' | 'created_by' | 'last_edited_by' | 'unique_id'

/** Option color: an editor palette name (`default` = no color). */
export type OptionColor = PaletteName | 'default'
export interface SelectOption { id: string, name: string, color: OptionColor }
export interface StatusGroup { id: string, name: string, option_ids: string[] }

export type NumberFormat = 'number' | 'percent' | 'currency'
export type RollupFn =
  | 'count' | 'count_values' | 'sum' | 'avg' | 'min' | 'max' | 'median' | 'percent_checked' | 'show_original'
  | 'earliest' | 'latest' | 'range'

export interface PropConfig {
  /** number: NumberFormat; date: DateDisplay (the contract uses `format` for both). */
  format?: NumberFormat | DateDisplay
  currency?: string
  decimals?: number
  /** select / multi_select / status */
  options?: SelectOption[]
  /** status */
  groups?: StatusGroup[]
  /** date */
  time?: boolean
  /** relation */
  database_id?: string
  two_way_prop_id?: string
  /** rollup */
  relation_prop_id?: string
  target_prop_id?: string
  fn?: RollupFn
  /** formula */
  expression?: string
  /** unique_id */
  prefix?: string
  [key: string]: unknown
}

export type DateDisplay = 'dmy' | 'mdy' | 'ymd' | 'relative'

export interface Prop {
  id: string
  name: string
  type: PropType
  config?: PropConfig
  position: string
}

/** Cell values (JSON) per type. */
export interface DateValue { start: string, end?: string }
export interface FileValue { id: string, name: string, url: string }

// ── 1.3 View ──────────────────────────────────────────────────────────────────

export type ViewType = 'table' | 'board' | 'calendar' | 'timeline' | 'gallery' | 'list' | 'chart' | 'pivot'

export type TextOp = 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'starts_with' | 'ends_with' | 'is_empty' | 'is_not_empty'
export type NumberOp = '=' | '!=' | '>' | '>=' | '<' | '<=' | 'is_empty' | 'is_not_empty'
export type SelectOp = 'is' | 'is_not' | 'is_any_of' | 'is_none_of'
export type ListOp = 'contains' | 'not_contains' | 'contains_any' | 'contains_all'
export type DateOp = 'is' | 'before' | 'after' | 'on_or_before' | 'on_or_after' | 'between' | 'is_relative'
export type FilterOp = TextOp | NumberOp | SelectOp | ListOp | DateOp

export type RelativeDate =
  | 'today' | 'tomorrow' | 'yesterday' | 'this_week' | 'past_week' | 'next_week' | 'this_month' | 'past_month'
  | 'next_month' | 'past_year' | 'next_year'

export interface FilterCondition { prop: string, op: FilterOp, value?: unknown }
export type FilterGroup = { and: FilterNode[] } | { or: FilterNode[] }
export type FilterNode = FilterCondition | FilterGroup

export interface Sort { prop: string, dir: 'asc' | 'desc' }
export interface GroupBy { prop: string, hide_empty?: boolean, order?: string[] }

export type AggregateFn =
  | 'count' | 'count_values' | 'count_empty' | 'count_not_empty' | 'percent_empty' | 'percent_not_empty' | 'unique'
  | 'sum' | 'avg' | 'min' | 'max' | 'median' | 'range' | 'earliest' | 'latest' | 'checked' | 'unchecked'
  | 'percent_checked'

export type ChartKind = 'bar' | 'line' | 'area' | 'pie' | 'donut' | 'scatter'
export type ValueFn = 'count' | 'sum' | 'avg' | 'min' | 'max'

export interface ViewConfig {
  filter?: FilterGroup
  sorts?: Sort[]
  group_by?: GroupBy
  /** Visible property ids, in column order. Missing: every property, by position. */
  visible?: string[]
  widths?: Record<string, number>
  wrap?: boolean
  aggregates?: Record<string, AggregateFn | string>
  /** board */
  card?: { cover?: string, props?: string[] }
  /** calendar */
  date_prop?: string
  /** timeline */
  start_prop?: string
  end_prop?: string
  scale?: 'day' | 'week' | 'month'
  /** gallery (and board's `card.cover`) */
  cover?: string
  size?: 's' | 'm' | 'l'
  /** chart */
  chart?: ChartKind
  x?: { prop: string, bucket?: 'day' | 'week' | 'month' | 'year' }
  y?: Array<{ prop?: string, fn: ValueFn }>
  series?: string
  stacked?: boolean
  /** pivot */
  rows?: string[]
  cols?: string[]
  values?: Array<{ prop?: string, fn: string }>
  totals?: boolean
  [key: string]: unknown
}

export interface View {
  id: string
  name: string
  type: ViewType
  position: string
  config: ViewConfig
}

// ── 1.7 Source ────────────────────────────────────────────────────────────────

export interface Row {
  id: string
  position: string
  values: Record<string, unknown>
  /** formula / rollup / created_* / unique_id results. */
  computed?: Record<string, unknown>
}

export interface RowWindow { offset: number, limit: number }
export interface RowPage { rows: Row[], total: number }
export interface Group { key: string | null, label: string, count: number }
export interface ChartResult { x: Array<string | number>, series: Array<{ name: string, data: number[] }> }
export interface PivotResult {
  rows: string[][]
  cols: string[][]
  cells: (number | null)[][]
  totals?: { rows?: (number | null)[], cols?: (number | null)[], grand?: number | null }
}
export interface Person { id: string, name: string, avatar?: string }

/**
 * Transient query options this block adds (not part of a view's saved config): the toolbar search box.
 * Optional third argument of `rows` / `groups` / `rowsInGroup` / `aggregate`; sources may ignore it.
 */
export interface RowQuery { search?: string }

/** Result of the optional `validateFormula`. */
export type FormulaCheck = { ok: true, type?: 'number' | 'string' | 'boolean' | 'date' } | { ok: false, error: string, position?: number, code?: string }

export interface DatabaseSource {
  meta: Ref<{ title: string, icon?: string | null } | undefined>
  props: Ref<Prop[]>
  views: Ref<View[]>
  version: Ref<number>
  canEditContent: Ref<boolean>
  canEditStructure: Ref<boolean>

  rows: (viewId: string, window: RowWindow, query?: RowQuery) => Promise<RowPage>
  groups: (viewId: string, query?: RowQuery) => Promise<Group[]>
  rowsInGroup: (viewId: string, key: string | null, window: RowWindow, query?: RowQuery) => Promise<RowPage>
  aggregate: (viewId: string, propId: string, fn: string, query?: RowQuery) => Promise<number | string | null>
  chart: (viewId: string) => Promise<ChartResult>
  pivot: (viewId: string) => Promise<PivotResult>
  sql?: (query: string) => Promise<{ columns: string[], rows: unknown[][] } | { error: string }>

  setCell: (rowId: string, propId: string, value: unknown) => void
  createRow: (init?: { values?: Record<string, unknown>, after?: string | null }) => string
  deleteRows: (ids: string[]) => void
  moveRow: (rowId: string, after: string | null, before: string | null) => void
  upsertProp: (prop: Prop) => void
  deleteProp: (id: string) => void
  upsertView: (view: View) => void
  deleteView: (id: string) => void
  setMeta: (meta: { title?: string, icon?: string | null }) => void
  openRow: (rowId: string) => void
  searchRows: (databaseId: string, query: string) => Promise<Array<{ id: string, title: string }>>
  people: (query: string) => Promise<Person[]>
  upload?: (file: File) => Promise<FileValue>

  // ── Additions of this block (optional) ──
  /** Checks a formula while it is typed in the property editor. */
  validateFormula?: (expression: string) => Promise<FormulaCheck> | FormulaCheck
  /**
   * Rows of the view whose `propId` date range overlaps `[start, end]` (ISO dates, inclusive), for calendar and
   * timeline. Without it those views read the first `rangeLimit` rows of the view and filter them here.
   */
  rowsInRange?: (viewId: string, propId: string, start: string, end: string, query?: RowQuery) => Promise<Row[]>
}

// ── Block options ─────────────────────────────────────────────────────────────

export type DatabaseKind = 'inline' | 'full_page'

export interface DatabaseBlockOptions {
  /** The app's data adapter for a database (may resolve asynchronously; cached per id by the block). */
  source: ((databaseId: string) => DatabaseSource | Promise<DatabaseSource>) | null
  /** Creates a database (server creates its `title` property and a table view) and resolves to its id. */
  createDatabase: ((kind: DatabaseKind) => Promise<string>) | null
  /** Opens a database as a page ("Database – full page" links, "Open as full page"). */
  open?: ((databaseId: string, event?: MouseEvent | KeyboardEvent) => void) | null
  /** Called when `createDatabase` or a source call fails. Default: `console.error`. */
  onError?: ((error: unknown) => void) | null
  /** Override any string, per locale. */
  messages?: Partial<Record<LocaleName, Partial<DatabaseMessages>>> | null
  /** Rows per window request (aligned chunks). Default 50. */
  pageSize?: number
  /** Rows read by calendar / timeline when the source has no `rowsInRange`. Default 2000. */
  rangeLimit?: number
}
