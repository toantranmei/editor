import { computed, type ComputedRef, inject, type InjectionKey, reactive, type Ref, shallowReactive } from 'vue'
import type { DatabaseMessages } from './messages'
import type { DatabaseBlockOptions, DatabaseSource, OpenMode, Prop, RowQuery, View, ViewConfig } from './types'
import { normalizeFilter } from './filters'
import type { ValueContext } from './values'
import { byPosition, visibleProps } from './util'

/** Everything the views of one database share (provided by `DatabaseView`). */
export interface DbContext {
  source: DatabaseSource
  databaseId: string
  options: Partial<DatabaseBlockOptions>
  view: ComputedRef<View | undefined>
  /** All properties, by position. */
  props: ComputedRef<Prop[]>
  /** Visible properties of the current view, in column order (title first). */
  visible: ComputedRef<Prop[]>
  m: ComputedRef<DatabaseMessages>
  locale: ComputedRef<string>
  canEditContent: ComputedRef<boolean>
  canEditStructure: ComputedRef<boolean>
  search: Ref<string>
  query: ComputedRef<RowQuery>
  /** Attributes for popovers teleported to <body> (theme scope). */
  scope: ComputedRef<Record<string, unknown>>
  valueCtx: ComputedRef<ValueContext>
  /** Names of people / titles of related rows seen so far. */
  names: { people: Map<string, string>, avatars: Map<string, string>, rows: Map<string, string> }
  /** Adds people / rows (from `people()` / `searchRows()` results) to the name caches. */
  remember: (people: Array<{ id: string, name: string, avatar?: string }>, rows?: Array<{ id: string, title: string }>) => void
  /** Cross-component UI requests (e.g. a header menu asking the toolbar to open the filter builder). */
  ui: { openFilter: number }
  /** "Open pages in" of the current view (default `side_peek`). */
  openMode: ComputedRef<OpenMode>
  /**
   * Opens a row with the view's mode (or `mode`): `options.openRow(databaseId, rowId, mode, event)` when set, else
   * `source.openRow(rowId, mode)`. Cmd / Ctrl-click asks for `full_page`.
   */
  openRow: (rowId: string, event?: MouseEvent | KeyboardEvent | null, mode?: OpenMode) => void
  updateView: (patch: Partial<ViewConfig> | ((config: ViewConfig) => ViewConfig)) => void
  report: (error: unknown) => void
}

export const DB_KEY: InjectionKey<DbContext> = Symbol('mei-database')

export function useDb(): DbContext {
  const ctx = inject(DB_KEY)
  if (!ctx) throw new Error('[database-block] used outside <DatabaseView>')
  return ctx
}

export function createContext(input: {
  source: DatabaseSource
  databaseId: string
  options: Partial<DatabaseBlockOptions>
  viewId: () => string | null | undefined
  m: () => DatabaseMessages
  locale: () => string
  editable: () => boolean
  scope: () => Record<string, unknown>
  search: Ref<string>
  /** Told about every opened row (DatabaseView re-emits it as `open-row`). */
  onOpenRow?: (rowId: string, mode: OpenMode, event?: MouseEvent | KeyboardEvent) => void
}): DbContext {
  const { source } = input
  const names = { people: new Map<string, string>(), avatars: new Map<string, string>(), rows: new Map<string, string>() }
  const namesVersion = shallowReactive({ n: 0 })
  const views = computed(() => [...source.views.value].sort(byPosition))
  const view = computed(() => views.value.find(v => v.id === input.viewId()) ?? views.value[0])
  const props = computed(() => [...source.props.value].sort(byPosition))
  const report = (error: unknown) => (input.options.onError ? input.options.onError(error) : console.error('[database-block]', error))
  const locale = computed(() => input.locale())

  const remember: DbContext['remember'] = (people, rows = []) => {
    for (const p of people) {
      names.people.set(p.id, p.name)
      if (p.avatar) names.avatars.set(p.id, p.avatar)
    }
    for (const r of rows) names.rows.set(r.id, r.title)
    namesVersion.n++
  }
  // Prime the name caches once (person / relation cells show names, not ids).
  source.people('').then(list => remember(list)).catch(() => {})

  const openMode = computed<OpenMode>(() => view.value?.config.open_in ?? 'side_peek')

  const ctx: DbContext = {
    source,
    databaseId: input.databaseId,
    options: input.options,
    view,
    props,
    visible: computed(() => visibleProps(view.value, props.value)),
    m: computed(() => input.m()),
    locale,
    canEditContent: computed(() => input.editable() && source.canEditContent.value),
    canEditStructure: computed(() => input.editable() && source.canEditStructure.value),
    search: input.search,
    query: computed(() => (input.search.value.trim() ? { search: input.search.value.trim() } : {})),
    scope: computed(() => input.scope()),
    valueCtx: computed(() => {
      void namesVersion.n
      return {
        locale: locale.value,
        personName: (id: string) => names.people.get(id),
        rowTitle: (id: string) => names.rows.get(id),
      }
    }),
    names,
    remember,
    ui: reactive({ openFilter: 0 }),
    openMode,
    openRow(rowId, event, mode) {
      const wanted: OpenMode = mode ?? (event && (event.metaKey || event.ctrlKey) ? 'full_page' : openMode.value)
      const e = event ?? undefined
      input.onOpenRow?.(rowId, wanted, e)
      try {
        if (input.options.openRow) input.options.openRow(input.databaseId, rowId, wanted, e)
        else source.openRow(rowId, wanted)
      }
      catch (error) {
        report(error)
      }
    },
    updateView(patch) {
      const v = view.value
      if (!v) return
      const config = typeof patch === 'function' ? patch(v.config) : { ...v.config, ...patch }
      const filter = normalizeFilter(config.filter)
      const next = { ...config }
      if (filter) next.filter = filter
      else delete next.filter
      for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k]
      source.upsertView({ ...v, config: next })
    },
    report,
  }
  return ctx
}
