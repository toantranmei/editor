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
  /** relation: at most this many pages (1 = "1 page"). */
  limit?: number
  /** rollup */
  relation_prop_id?: string
  target_prop_id?: string
  fn?: RollupFn
  /** formula */
  expression?: string
  /** title: row templates of the database. */
  templates?: RowTemplate[]
  /** Any property: a description shown when hovering its header (Notion's ⓘ). */
  description?: string
  /** unique_id */
  prefix?: string
  /** select / multi_select: keep options sorted (new ones land in order). */
  option_sort?: 'asc' | 'desc'
  /** status / select: option new rows start with. */
  default_option_id?: string
  /** number / numeric rollup: draw the value as a bar or a ring (`divide_by` = full, default 100). */
  show_as?: 'number' | 'bar' | 'ring'
  show_color?: OptionColor
  divide_by?: number
  /** bar / ring: also print the number (default true). */
  show_number?: boolean
  /** date / created_time / last_edited_time: 12-hour clock. */
  hour12?: boolean
  /** url: show the whole URL; off: the host only. */
  full_url?: boolean
  [key: string]: unknown
}

export type DateDisplay = 'full' | 'short' | 'dmy' | 'mdy' | 'ymd' | 'relative'

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

export type ViewType = 'table' | 'board' | 'calendar' | 'timeline' | 'gallery' | 'list' | 'chart' | 'pivot' | 'form'

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

/**
 * A row template (New ▾): property values a new row starts with. Kept in the title property's
 * `config.templates` (database-wide, synced with the schema); `default` is used by "New".
 */
export interface RowTemplate { id: string, name: string, values: Record<string, unknown>, default?: boolean }

/** A conditional color rule (`config.colors`): rows (or one cell) matching `condition` get `color`. */
export interface ColorRule { id: string, condition: FilterCondition, color: OptionColor, scope?: 'row' | 'prop' }

export interface Sort { prop: string, dir: 'asc' | 'desc' }
export interface GroupBy {
  prop: string
  hide_empty?: boolean
  /** Manual group order (keys; '' = no value). */
  order?: string[]
  /** Sort groups by label instead of the manual / option order. */
  sort?: 'asc' | 'desc'
  /** Group keys not shown ('' = no value). */
  hidden?: string[]
}

export type AggregateFn =
  | 'count' | 'count_values' | 'count_empty' | 'count_not_empty' | 'percent_empty' | 'percent_not_empty' | 'unique'
  | 'sum' | 'avg' | 'min' | 'max' | 'median' | 'range' | 'earliest' | 'latest' | 'checked' | 'unchecked'
  | 'percent_checked'

/** How a row opens (per view, `config.open_in`): a panel on the right, a centered dialog, or the whole page. */
export type OpenMode = 'side_peek' | 'center_peek' | 'full_page'

export type ChartKind = 'bar' | 'line' | 'area' | 'pie' | 'donut' | 'scatter'
export type ValueFn = 'count' | 'sum' | 'avg' | 'min' | 'max'

export interface ViewConfig {
  filter?: FilterGroup
  sorts?: Sort[]
  group_by?: GroupBy
  /** Visible property ids, in column order. Missing: every property, by position. */
  visible?: string[]
  widths?: Record<string, number>
  /** Wrap every column's text (table); `wraps` per column overrides it. */
  wrap?: boolean
  /** Per-column text wrapping (table): property id → wrap. */
  wraps?: Record<string, boolean>
  /** Table: number of leading columns kept in view while scrolling sideways. Default 1 (the title). */
  freeze?: number
  /** Conditional colors, first match wins (row / card, or per cell with scope `prop`). */
  colors?: ColorRule[]
  /** Table / list / board: sub-items — a relation to this database holding each row's parent. */
  sub_items?: string
  /**
   * How sub-items show (Notion's "Show sub-items as"): `nested` (default; parents listed, sub-items under their
   * parent: ▸ in table / list, "N sub-items" on board cards) or `flat` (every row, sub-items name their parent).
   */
  sub_items_display?: 'nested' | 'flat'
  /** Form: description under the title, required questions (property ids). */
  form_description?: string
  form_required?: string[]
  /** Table: draw the lines between columns (default true). */
  vertical_lines?: boolean
  /** Inline table: lines shown before "Load more" (default 50, 0 = no limit). */
  load_limit?: number
  /** How rows open from this view. Default `side_peek`. */
  open_in?: OpenMode
  aggregates?: Record<string, AggregateFn | string>
  /**
   * board / gallery / list / calendar / timeline: card preview (board; `CardPreview`), shown properties, card size
   * (board), card layout (board / gallery: properties one per line, `list`, the default, or wrapped, `compact`).
   */
  card?: { cover?: CardPreview, props?: string[], size?: 's' | 'm' | 'l', layout?: 'list' | 'compact' }
  /** board: tint columns with their option color. */
  color_columns?: boolean
  /** gallery / board: fit the cover image instead of cropping it. */
  fit_image?: boolean
  /** calendar: show Saturday and Sunday (default true). */
  show_weekends?: boolean
  /** timeline: show the title column next to the bars (default true). */
  show_table?: boolean
  /** calendar */
  date_prop?: string
  /** calendar: wrap event titles instead of cutting them. */
  wrap_titles?: boolean
  /** table / board / gallery / list: show the row pages' icons (`Row.icon`) before their titles (default true). */
  show_page_icon?: boolean
  /** The view tab's icon (an emoji or an image URL); missing: the layout's icon. */
  icon?: string
  /** The view tab shows its icon and name (`name`, default) or only the icon (`icon`; the name is the tooltip). */
  tab_display?: 'name' | 'icon'
  /** Show the database title above this view (default true; Notion's "Show data source title"). */
  show_title?: boolean
  /** calendar: "Show calendar as" one week instead of the month grid. */
  calendar_as?: 'week'
  /** timeline */
  start_prop?: string
  end_prop?: string
  scale?: 'day' | 'week' | 'month' | 'quarter' | 'year'
  /** gallery card preview (board: `card.cover`). */
  cover?: CardPreview
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

/**
 * Card preview of board / gallery cards (Notion's Layout → Card preview): a `files` property id (its first image),
 * the row page's cover (`page_cover`) or the start of its content (`page_content`), both read with
 * `source.rowPreview`. Missing / empty: none.
 */
export type CardPreview = 'page_cover' | 'page_content' | (string & {})

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
  /** The row page's icon (an emoji, or an image URL), shown before the title when the view's `show_page_icon` is on. */
  icon?: string | null
}

/** What `source.rowPreview` tells about a row page (card previews). Every field is optional. */
export interface RowPreview {
  /** URL of the page's cover image (Card preview → Page cover). */
  cover?: string | null
  /** First image of the page content (Card preview → Page content; wins over `text`). */
  image?: string | null
  /** Start of the page content as plain text (Card preview → Page content). */
  text?: string | null
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
export interface RowQuery {
  search?: string
  /**
   * The viewer's unsaved filter / sorts (Notion's "Reset / Save for everyone"): when present they replace the
   * view's saved `filter` / `sorts` for this query (`null` filter = no filter). Sources that ignore them show
   * the saved ones until the viewer saves.
   */
  filter?: FilterGroup | null
  sorts?: Sort[]
}

/** Result of the optional `validateFormula`. */
export type FormulaCheck = { ok: true, type?: 'number' | 'string' | 'boolean' | 'date' } | { ok: false, error: string, position?: number, code?: string }

export interface DatabaseSource {
  /** `locked`: Lock database — properties, views and layout can't change (data still can). */
  meta: Ref<{ title: string, icon?: string | null, locked?: boolean } | undefined>
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
  setMeta: (meta: { title?: string, icon?: string | null, locked?: boolean }) => void
  /**
   * Opens a row. `mode` is the view's "Open pages in" setting (`config.open_in`, default `side_peek`), passed since
   * 0.2; older sources simply ignore it. `DatabaseBlockOptions.openRow` (when set) is called instead.
   */
  openRow: (rowId: string, mode?: OpenMode) => void
  searchRows: (databaseId: string, query: string) => Promise<Array<{ id: string, title: string }>>
  people: (query: string) => Promise<Person[]>
  upload?: (file: File) => Promise<FileValue>

  // ── Additions of this block (optional) ──
  /** Brings deleted rows back (same ids, values and body); undo uses it when present. */
  restoreRows?: (ids: string[]) => void
  /** Databases a relation can point to (Relation → "Related to" picker); without it the id is typed. */
  searchDatabases?: (query: string) => Promise<Array<{ id: string, title: string, icon?: string | null, path?: string }>>
  /** Properties of another database (rollup target, two-way names); without it the target id is typed. */
  propsOf?: (databaseId: string) => Promise<Prop[]>
  /** Checks a formula while it is typed in the property editor. */
  validateFormula?: (expression: string) => Promise<FormulaCheck> | FormulaCheck
  /**
   * Rows of the view whose `propId` date range overlaps `[start, end]` (ISO dates, inclusive), for calendar and
   * timeline. Without it those views read the first `rangeLimit` rows of the view and filter them here.
   */
  rowsInRange?: (viewId: string, propId: string, start: string, end: string, query?: RowQuery) => Promise<Row[]>
  /**
   * Page cover / content previews of rows (board and gallery "Card preview: Page cover / Page content"), asked in
   * batches for the cards on screen. Rows missing from the result have no preview. Without it those previews
   * stay empty.
   */
  rowPreview?: (rowIds: string[]) => Promise<Record<string, RowPreview>>
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
  /**
   * Opens a row in the given mode (the host renders the side / center peek or navigates). When set, the block calls
   * it instead of `source.openRow`. `event`: the click, e.g. to open a new tab on Cmd / Ctrl-click.
   */
  openRow?: ((databaseId: string, rowId: string, mode: OpenMode, event?: MouseEvent | KeyboardEvent) => void) | null
  /** Link to a view of the database ("Copy link to view" in the tab menu). */
  viewUrl?: ((databaseId: string, viewId: string) => string) | null
  /** Link to a row (Copy link in the row menu). Without it the menu has no Copy link. */
  rowUrl?: ((databaseId: string, rowId: string) => string) | null
  /** Called when `createDatabase` or a source call fails. Default: `console.error`. */
  onError?: ((error: unknown) => void) | null
  /** Override any string, per locale. */
  messages?: Partial<Record<LocaleName, Partial<DatabaseMessages>>> | null
  /** Rows per window request (aligned chunks). Default 50. */
  pageSize?: number
  /** Rows read by calendar / timeline when the source has no `rowsInRange`. Default 2000. */
  rangeLimit?: number
}
