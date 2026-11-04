import { computed, type ComputedRef, inject, type InjectionKey, reactive, type Ref, ref, shallowReactive, watch } from 'vue'
import type { DatabaseMessages } from './messages'
import type { Automation, DatabaseBlockOptions, DatabaseSource, FilterGroup, OpenMode, Prop, Row, RowQuery, RowTemplate, Sort, View, ViewConfig, ViewDraft } from './types'
import { type ActionEnv, runActions, runActionsNow, triggered, type TriggerEvent } from './actions'
import { colorsOf, type RowColors } from './colors'
import { localDraftStore } from './drafts'
import { withHistory } from './history'
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
  /** Lock database is on (`meta.locked`): structure edits are off even for editors. */
  locked: ComputedRef<boolean>
  /** Whoever may change the structure may lock / unlock. */
  canLock: ComputedRef<boolean>
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
  ui: { openFilter: number, openSort: number }
  /** "Open pages in" of the current view (default `side_peek`). */
  openMode: ComputedRef<OpenMode>
  /**
   * Opens a row with the view's mode (or `mode`): `options.openRow(databaseId, rowId, mode, event)` when set, else
   * `source.openRow(rowId, mode)`. Cmd / Ctrl-click asks for `full_page`.
   */
  openRow: (rowId: string, event?: MouseEvent | KeyboardEvent | null, mode?: OpenMode) => void
  updateView: (patch: Partial<ViewConfig> | ((config: ViewConfig) => ViewConfig)) => void
  /**
   * `source.createRow` plus the properties' defaults (`config.default_option_id`) and the default template's
   * values (`template`: a template id, or `false` for none — pasted rows) for values not given.
   */
  createRow: (init?: { values?: Record<string, unknown>, after?: string | null }, opts?: { template?: string | false }) => string
  /** Row templates (title property's `config.templates`). */
  templates: ComputedRef<RowTemplate[]>
  saveTemplates: (list: RowTemplate[]) => void
  /** Database automations (title property's `config.automations`), run after this client's own writes. */
  automations: ComputedRef<Automation[]>
  saveAutomations: (list: Automation[]) => void
  /**
   * Runs a button property's actions on `row` as one undo step. `confirm` shows the "Show confirmation" steps
   * (without it they pass). Does nothing without edit content rights.
   */
  runButton: (prop: Prop, row: Row | null, ui?: { confirm?: (message: string) => Promise<boolean> | boolean }) => Promise<void>
  /**
   * The viewer's unsaved filter / sorts of the current view (Notion's "Reset / Save for everyone"). `view` already
   * shows them; `saveDraft` writes them into the view, `resetDraft` drops them.
   */
  draft: ComputedRef<{ filter?: FilterGroup | null, sorts?: Sort[] } | null>
  saveDraft: () => void
  resetDraft: () => void
  /** Conditional colors of a row in the current view (`config.colors`). */
  colors: (row: Row) => RowColors
  /** Undo / redo of the data writes made through this block. */
  undo: () => void
  redo: () => void
  canUndo: Ref<boolean>
  canRedo: Ref<boolean>
  report: (error: unknown) => void
}

/** Views that show sub-items. */
export const SUB_ITEM_VIEWS = ['table', 'list', 'board']

/** Sub-items setting of a view: the parent relation and whether sub-items nest; undefined when off. */
export function subItemsOf(view: View | undefined, props: Prop[]): { prop: Prop, nested: boolean } | undefined {
  const id = view && SUB_ITEM_VIEWS.includes(view.type) ? view.config.sub_items : undefined
  const prop = id ? props.find(p => p.id === id && p.type === 'relation') : undefined
  return prop ? { prop, nested: view!.config.sub_items_display !== 'flat' } : undefined
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
  // Every write through the block can be undone (⌘Z) / redone (⌘⇧Z).
  const history = withHistory(input.source)
  // Automations run right after the write that triggers them, in the same undo step. Their own writes go to the
  // history source directly, so they never trigger automations again; undo / redo replay bypasses both layers.
  const recorded = history.source
  const titleOf = () => recorded.props.value.find(p => p.type === 'title')
  const automationList = computed<Automation[]>(() => titleOf()?.config?.automations ?? [])
  /** Values a new row starts with: given ones, then the template's, then property defaults. */
  function initValues(values: Record<string, unknown> | undefined, template: string | false | undefined) {
    const all = recorded.props.value
    const list = all.find(p => p.type === 'title')?.config?.templates ?? []
    const tpl = template === false ? undefined : list.find(t => (template ? t.id === template : t.default))
    const out = { ...tpl?.values, ...values }
    for (const p of all) {
      const d = p.config?.default_option_id
      if (d && (p.type === 'status' || p.type === 'select') && out[p.id] === undefined && p.config?.options?.some(o => o.id === d)) out[p.id] = d
    }
    return out
  }
  const actionEnv = (write: DatabaseSource): ActionEnv => ({
    props: recorded.props.value,
    setCell: (rowId, propId, value) => write.setCell(rowId, propId, value),
    createRow: values => write.createRow({ values: initValues(values, undefined) }),
    currentUserId: recorded.currentUserId?.() ?? null,
  })
  function fire(event: TriggerEvent) {
    const list = automationList.value
    if (!list.length) return
    const due = triggered(list, event, recorded.props.value)
    if (!due.length) return
    const row: Row = { id: event.rowId, position: '', values: {} }
    for (const a of due) {
      try {
        runActionsNow(a.actions, row, actionEnv(recorded))
      }
      catch (error) {
        report(error)
      }
    }
  }
  const fired: DatabaseSource = {
    ...recorded,
    setCell(rowId, propId, value) {
      recorded.setCell(rowId, propId, value)
      fire({ type: 'prop_changed', rowId, propId, value })
    },
    createRow(init) {
      const id = recorded.createRow(init)
      fire({ type: 'row_added', rowId: id })
      return id
    },
  }
  const names = { people: new Map<string, string>(), avatars: new Map<string, string>(), rows: new Map<string, string>() }
  const namesVersion = shallowReactive({ n: 0 })
  // Rows read through the block name themselves (relations to this database, sub-items' parents show titles).
  const learn = <T extends Row[]>(rows: T): T => {
    const t = input.source.props.value.find(p => p.type === 'title')?.id
    let changed = false
    if (t) {
      for (const r of rows) {
        const title = r.values[t]
        if (typeof title === 'string' && title && names.rows.get(r.id) !== title) {
          names.rows.set(r.id, title)
          changed = true
        }
      }
    }
    if (changed) namesVersion.n++
    return rows
  }
  const inner = fired
  const source: DatabaseSource = {
    ...inner,
    rows: (viewId, window, query) => inner.rows(viewId, window, query).then((page) => {
      learn(page.rows)
      return page
    }),
    rowsInGroup: (viewId, key, window, query) => inner.rowsInGroup(viewId, key, window, query).then((page) => {
      learn(page.rows)
      return page
    }),
    rowsInRange: inner.rowsInRange ? (...args) => inner.rowsInRange!(...args).then(learn) : undefined,
  }
  const views = computed(() => [...source.views.value].sort(byPosition))
  const saved = computed(() => views.value.find(v => v.id === input.viewId()) ?? views.value[0])
  const report = (error: unknown) => (input.options.onError ? input.options.onError(error) : console.error('[database-block]', error))
  // Unsaved filter / sorts per view id (this viewer), kept across sessions by the draft store.
  const drafts = ref<Record<string, ViewDraft>>({})
  const store = input.options.draftStore === false ? null : input.options.draftStore ?? localDraftStore(input.options.userId)
  /** Sets (or drops, `null`) a view's draft, here and in the store. */
  const setDraft = (viewId: string, d: ViewDraft | null) => {
    if (d) drafts.value = { ...drafts.value, [viewId]: d }
    else if (viewId in drafts.value) {
      const { [viewId]: _, ...rest } = drafts.value
      drafts.value = rest
    }
    try {
      store?.set(viewId, d, input.databaseId)
    }
    catch (error) {
      report(error)
    }
  }
  // A view's stored draft comes back the first time it opens in this session.
  const loaded = new Set<string>()
  const draft = computed(() => (saved.value ? drafts.value[saved.value.id] ?? null : null))
  /** The saved view with the viewer's draft on top: what every component reads. */
  const view = computed<View | undefined>(() => {
    const v = saved.value
    const d = v && drafts.value[v.id]
    if (!v || !d) return v
    const config: ViewConfig = { ...v.config }
    if ('filter' in d) {
      if (d.filter) config.filter = d.filter
      else delete config.filter
    }
    if (d.sorts) config.sorts = d.sorts
    return { ...v, config }
  })
  watch(() => saved.value?.id, (id) => {
    if (!id || loaded.has(id) || !store) return
    loaded.add(id)
    if (id in drafts.value) return
    try {
      const d = store.get(id, input.databaseId)
      if (d) drafts.value = { ...drafts.value, [id]: d }
    }
    catch (error) {
      report(error)
    }
  }, { immediate: true })
  // A draft equal to the saved config is no draft.
  watch([drafts, saved], () => {
    const v = saved.value
    const d = v && drafts.value[v.id]
    if (!v || !d) return
    const same = (!('filter' in d) || JSON.stringify(d.filter ?? undefined) === JSON.stringify(v.config.filter))
      && (!d.sorts || JSON.stringify(d.sorts) === JSON.stringify(v.config.sorts ?? []))
    if (same) setDraft(v.id, null)
  }, { deep: true })
  const props = computed(() => [...source.props.value].sort(byPosition))
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
    canEditStructure: computed(() => input.editable() && source.canEditStructure.value && !source.meta.value?.locked),
    locked: computed(() => !!source.meta.value?.locked),
    canLock: computed(() => input.editable() && source.canEditStructure.value),
    search: input.search,
    query: computed(() => {
      const q: RowQuery = input.search.value.trim() ? { search: input.search.value.trim() } : {}
      const d = draft.value
      if (d && 'filter' in d) q.filter = normalizeFilter(d.filter ?? undefined) ?? null
      if (d?.sorts) q.sorts = d.sorts
      // Sub-items nested (table / list / board): the view lists the parents, rows without a parent.
      const sub = subItemsOf(view.value, props.value)?.nested ? view.value!.config.sub_items : undefined
      if (sub && props.value.some(p => p.id === sub)) {
        const base = 'filter' in q ? q.filter : view.value?.config.filter
        const top = { prop: sub, op: 'is_empty' as const }
        q.filter = base ? { and: [base, top] } : { and: [top] }
      }
      return q
    }),
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
    ui: reactive({ openFilter: 0, openSort: 0 }),
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
    draft,
    saveDraft() {
      const v = saved.value
      const d = draft.value
      if (!v || !d || !(input.editable() && source.canEditStructure.value)) return
      const config: ViewConfig = { ...v.config }
      if ('filter' in d) {
        const f = normalizeFilter(d.filter ?? undefined)
        if (f) config.filter = f
        else delete config.filter
      }
      if (d.sorts) {
        if (d.sorts.length) config.sorts = d.sorts
        else delete config.sorts
      }
      setDraft(v.id, null)
      source.upsertView({ ...v, config })
    },
    resetDraft() {
      const v = saved.value
      if (!v) return
      setDraft(v.id, null)
    },
    updateView(patch) {
      const v = view.value
      if (!v) return
      let config = typeof patch === 'function' ? patch(v.config) : { ...v.config, ...patch }
      // Filter / sort changes are the viewer's draft until "Save for everyone" (Notion), the rest saves at once.
      const base = saved.value!
      const rest = (c: ViewConfig) => { const { filter: _f, sorts: _s, ...o } = c; return JSON.stringify(o) }
      const filterChanged = JSON.stringify(config.filter ?? null) !== JSON.stringify(v.config.filter ?? null)
      const sortsChanged = JSON.stringify(config.sorts ?? []) !== JSON.stringify(v.config.sorts ?? [])
      if ((filterChanged || sortsChanged) && rest(config) === rest(v.config)) {
        const d = { ...drafts.value[base.id] }
        if (filterChanged) d.filter = config.filter ?? null
        if (sortsChanged) d.sorts = config.sorts ?? []
        setDraft(base.id, d)
        return
      }
      // Locked: only filters and sorts change (the draft above), like Notion's lock.
      if (source.meta.value?.locked) return
      // Keep the viewer's draft out of the saved view.
      const d = drafts.value[base.id]
      if (d && 'filter' in d && !filterChanged) config = { ...config, filter: base.config.filter }
      if (d?.sorts && !sortsChanged) config = { ...config, sorts: base.config.sorts }
      const filter = normalizeFilter(config.filter)
      const next = { ...config }
      if (filter) next.filter = filter
      else delete next.filter
      for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k]
      source.upsertView({ ...base, config: next })
    },
    createRow(init = {}, opts = {}) {
      const values = initValues(init.values, opts.template)
      const id = source.createRow(Object.keys(values).length || init.values ? { ...init, values } : init)
      // The template's page content follows (host side: the new row's page is still empty).
      const list = props.value.find(p => p.type === 'title')?.config?.templates ?? []
      const tpl = opts.template === false ? undefined : list.find(t => (opts.template ? t.id === opts.template : t.default))
      if (tpl?.body_from && tpl.body_from !== id && source.copyRowBody) source.copyRowBody(tpl.body_from, id).catch(report)
      return id
    },
    templates: computed(() => props.value.find(p => p.type === 'title')?.config?.templates ?? []),
    saveTemplates(list) {
      const title = props.value.find(p => p.type === 'title')
      // A prop upsert: refused while locked (as the server does).
      if (!title || !(input.editable() && source.canEditStructure.value) || source.meta.value?.locked) return
      const config = { ...title.config }
      if (list.length) config.templates = list
      else delete config.templates
      source.upsertProp({ ...title, config })
    },
    automations: automationList,
    saveAutomations(list) {
      const title = props.value.find(p => p.type === 'title')
      // A prop upsert: refused while locked (as the server does).
      if (!title || !(input.editable() && source.canEditStructure.value) || source.meta.value?.locked) return
      const config = { ...title.config }
      if (list.length) config.automations = list
      else delete config.automations
      source.upsertProp({ ...title, config })
    },
    async runButton(prop, row, ui = {}) {
      const actions = prop.type === 'button' ? prop.config?.actions ?? [] : []
      if (!actions.length || !ctx.canEditContent.value) return
      await history.group(() => runActions(actions, row, {
        ...actionEnv(source),
        confirm: ui.confirm,
        openUrl: (url) => {
          if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener')
        },
        openRow: id => ctx.openRow(id),
      })).catch(report)
    },
    colors: row => colorsOf(view.value?.config.colors, props.value, row),
    undo: history.undo,
    redo: history.redo,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    report,
  }
  return ctx
}
