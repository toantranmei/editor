<script setup lang="ts">
/**
 * Table view: headless TanStack Table (columns, sizing, order) + TanStack Virtual on both axes.
 * Only the rows in view (+ overscan) are requested from the source, in chunk-aligned windows (`RowStore`).
 * Rows have a fixed height and move with `transform`, so scrolling never triggers layout of off-screen rows.
 */
import { ChevronDown, ChevronRight, GripVertical, Maximize2, Plus } from '@lucide/vue'
import { type ColumnDef, type ColumnSizingState, getCoreRowModel, useVueTable } from '@tanstack/vue-table'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { componentTokens } from '@toantranmei/editor'
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { aggregatesFor, formatAggregate } from '../aggregates'
import CellEditor from '../components/CellEditor.vue'
import CellValue from '../components/CellValue.vue'
import DbPopover from '../components/DbPopover.vue'
import PropertyEditor from '../components/PropertyEditor.vue'
import PropertyMenu from '../components/PropertyMenu.vue'
import PropIcon from '../components/PropIcon.vue'
import { useDb } from '../context'
import { rectWithFallback } from '../virtual'
import { type GridSelection, inSelection, navigate, selectionRect } from '../grid-nav'
import { fmt } from '../messages'
import type { Item } from '../row-store'
import { toTsv, parseTsv } from '../tsv'
import type { Prop, Row, SelectOption } from '../types'
import { useRowStore } from '../use-rows'
import { cellValue, cssPx, isReadOnly } from '../util'
import { displayText, optionById, parseText } from '../values'

const props = withDefaults(defineProps<{ full?: boolean }>(), { full: false })
const db = useDb()
const m = computed(() => db.m.value)
const store = useRowStore(db)
const T = componentTokens.database

// ── Sizes (tokens, read once from CSS so apps can override them) ──
const scroller = ref<HTMLElement | null>(null)
const sizes = shallowRef({ row: Number.parseFloat(T.rowHeight), header: Number.parseFloat(T.headerHeight), group: Number.parseFloat(T.groupHeaderHeight), select: Number.parseFloat(T.selectColWidth), handle: Number.parseFloat(T.handleColWidth), min: Number.parseFloat(T.cellMinWidth), def: Number.parseFloat(T.cellDefaultWidth) })
watch(scroller, (el) => {
  if (!el) return
  sizes.value = {
    row: cssPx(el, '--me-database-row-height', T.rowHeight),
    header: cssPx(el, '--me-database-header-height', T.headerHeight),
    group: cssPx(el, '--me-database-group-header-height', T.groupHeaderHeight),
    select: cssPx(el, '--me-database-select-col-width', T.selectColWidth),
    handle: cssPx(el, '--me-database-handle-col-width', T.handleColWidth),
    min: cssPx(el, '--me-database-cell-min-width', T.cellMinWidth),
    def: cssPx(el, '--me-database-cell-default-width', T.cellDefaultWidth),
  }
})
const gutter = computed(() => sizes.value.handle + sizes.value.select)

// ── Columns: TanStack Table ──
const cols = computed(() => db.visible.value)
const sizing = ref<ColumnSizingState>({})
const columns = computed<ColumnDef<Row>[]>(() => cols.value.map(p => ({
  id: p.id,
  header: p.name,
  size: sizing.value[p.id] ?? db.view.value?.config.widths?.[p.id] ?? (p.type === 'title' ? 280 : sizes.value.def),
  minSize: sizes.value.min,
  maxSize: 1200,
  accessorFn: (r: Row) => cellValue(r, p),
})))
const windowRows = shallowRef<Row[]>([])
const table = useVueTable<Row>({
  get data() { return windowRows.value },
  get columns() { return columns.value },
  getCoreRowModel: getCoreRowModel(),
  getRowId: r => r.id,
  columnResizeMode: 'onChange',
  enableColumnResizing: true,
  state: {
    get columnSizing() { return sizing.value },
    get columnOrder() { return cols.value.map(p => p.id) },
  },
  onColumnSizingChange: (u) => {
    sizing.value = typeof u === 'function' ? u(sizing.value) : u
  },
})
const leaf = computed(() => {
  void sizing.value
  void columns.value
  return table.getVisibleLeafColumns()
})
const widthOf = (i: number) => leaf.value[i]?.getSize() ?? sizes.value.def
const firstWidth = computed(() => widthOf(0))
/** Starts of the scrollable columns (all but the sticky first one). */
const restStarts = computed(() => {
  const out: number[] = [0]
  for (let i = 1; i < leaf.value.length; i++) out.push(out[out.length - 1]! + widthOf(i))
  return out
})
const restWidth = computed(() => restStarts.value[restStarts.value.length - 1]!)
const addColWidth = computed(() => sizes.value.def / 2)
const totalWidth = computed(() => gutter.value + firstWidth.value + restWidth.value + addColWidth.value)

// Persist widths when a resize ends.
const resizing = computed(() => table.getState().columnSizingInfo.isResizingColumn)
watch(resizing, (now, before) => {
  if (before && !now && db.canEditStructure.value) {
    db.updateView(c => ({ ...c, widths: { ...c.widths, ...Object.fromEntries(Object.entries(sizing.value).map(([k, v]) => [k, Math.round(v)])) } }))
  }
})

// ── Virtualizers ──
// happy-dom / hidden containers report a 0 rect: fall back to a viewport-sized one so a window still renders.
const observeRect = rectWithFallback(1200, 520)
const itemCount = computed(() => {
  void store.value?.tick.value
  void store.value?.segments.value
  void store.value?.collapsed.value
  return store.value?.itemCount() ?? 0
})
const itemAt = (i: number): Item | undefined => store.value?.itemAt(i)
const rowVirtualizer = useVirtualizer(computed(() => ({
  count: itemCount.value,
  getScrollElement: () => scroller.value,
  estimateSize: (i: number) => (itemAt(i)?.kind === 'group' ? sizes.value.group : sizes.value.row),
  overscan: 12,
  scrollMargin: sizes.value.header,
  observeElementRect: observeRect,
  initialRect: { width: 1200, height: 520 },
})))
const colVirtualizer = useVirtualizer(computed(() => ({
  horizontal: true,
  count: Math.max(0, leaf.value.length - 1),
  getScrollElement: () => scroller.value,
  estimateSize: (i: number) => widthOf(i + 1),
  overscan: 3,
  scrollMargin: gutter.value + firstWidth.value,
  observeElementRect: observeRect,
  initialRect: { width: 1200, height: 520 },
})))
watch([sizing, () => cols.value.map(c => c.id).join()], () => colVirtualizer.value.measure())
watch(() => store.value?.collapsed.value, () => rowVirtualizer.value.measure())
watch(() => store.value?.segments.value, () => rowVirtualizer.value.measure())

const vRows = computed(() => rowVirtualizer.value.getVirtualItems())
/** Height of everything in the scroller; the token `max-height` caps it, so short tables don't leave a gap. */
const contentHeight = computed(() => sizes.value.header * 2 + rowVirtualizer.value.getTotalSize() + (!store.value?.grouped && db.canEditContent.value ? sizes.value.row : 0) + 2)
const vCols = computed(() => colVirtualizer.value.getVirtualItems().map(v => ({ ...v, col: v.index + 1 })))
const padLeft = computed(() => (vCols.value.length ? restStarts.value[vCols.value[0]!.index]! : 0))
const padRight = computed(() => (vCols.value.length ? restWidth.value - restStarts.value[vCols.value[vCols.value.length - 1]!.index + 1]! : restWidth.value))

// Ask the store for what's in view whenever the range moves.
watch(() => {
  const items = vRows.value
  return items.length ? `${items[0]!.index}:${items[items.length - 1]!.index}:${itemCount.value}` : ''
}, (range) => {
  if (!range || !store.value) return
  const [a, b] = range.split(':').map(Number)
  store.value.ensureItems(a!, b!)
})

/** What each virtual row shows (re-computed when rows arrive). */
const rendered = computed(() => {
  void store.value?.tick.value
  const s = store.value
  return vRows.value.map((v) => {
    const item = s?.itemAt(v.index)
    const row = item?.kind === 'row' ? s!.rowAt(item.seg, item.index) : undefined
    return { v, item, row, top: v.start - sizes.value.header }
  })
})
watch(rendered, (list) => {
  const rows = list.map(r => r.row).filter((r): r is Row => !!r)
  if (rows.length !== windowRows.value.length || rows.some((r, i) => r !== windowRows.value[i])) windowRows.value = rows
  // A row created with "+ New" shows up: edit its title.
  if (pendingEdit.value) {
    const hit = list.find(r => r.row?.id === pendingEdit.value)
    if (hit) {
      pendingEdit.value = null
      sel.value = { anchor: { row: hit.v.index, col: 0 }, focus: { row: hit.v.index, col: 0 } }
      nextTick(() => startEdit(null))
    }
  }
})
const tRowById = computed(() => {
  void windowRows.value
  return table.getRowModel().rowsById
})
/** Value of a cell through the table's row model (falls back to the raw row while it updates). */
const valueAt = (row: Row, colIndex: number) => {
  const p = cols.value[colIndex]
  if (!p) return undefined
  return tRowById.value[row.id]?.getValue(p.id) ?? cellValue(row, p)
}

// ── Groups ──
const groupProp = computed(() => db.props.value.find(p => p.id === db.view.value?.config.group_by?.prop))
const segment = (seg: number) => store.value?.segments.value[seg]
const groupOption = (key: string | null | undefined): SelectOption | undefined => (groupProp.value && key ? optionById(groupProp.value, key) : undefined)
function groupValue(key: string | null | undefined): unknown {
  const p = groupProp.value
  if (!p || key === null || key === undefined) return undefined
  if (p.type === 'checkbox') return key === 'true'
  if (p.type === 'multi_select' || p.type === 'person' || p.type === 'relation') return [key]
  return key
}

// ── Selection & editing ──
const sel = ref<GridSelection | null>(null)
const checked = ref(new Set<string>())
const editing = shallowRef<{ row: Row, col: number, anchor: HTMLElement | null, text: string | null } | null>(null)
const pendingEdit = ref<string | null>(null)
const bounds = computed(() => ({ rows: itemCount.value, cols: cols.value.length, isRow: (i: number) => itemAt(i)?.kind === 'row' }))
const rowOfItem = (index: number) => {
  const item = itemAt(index)
  return item?.kind === 'row' ? store.value?.rowAt(item.seg, item.index) : undefined
}

function focusGrid() {
  scroller.value?.focus({ preventScroll: true })
}
function selectCell(row: number, col: number, e?: MouseEvent) {
  if (e?.shiftKey && sel.value) sel.value = { anchor: sel.value.anchor, focus: { row, col } }
  else sel.value = { anchor: { row, col }, focus: { row, col } }
  focusGrid()
}
function cellEl(row: number, col: number): HTMLElement | null {
  return scroller.value?.querySelector<HTMLElement>(`[data-row="${row}"] [data-col="${col}"]`) ?? null
}
function scrollToCell(row: number, col: number) {
  rowVirtualizer.value.scrollToIndex(row, { align: 'auto' })
  if (col > 0) colVirtualizer.value.scrollToIndex(col - 1, { align: 'auto' })
}

function startEdit(text: string | null) {
  const s = sel.value
  if (!s || !db.canEditContent.value) return
  const p = cols.value[s.focus.col]
  const row = rowOfItem(s.focus.row)
  if (!p || !row || isReadOnly(p.type)) return
  if (p.type === 'checkbox') {
    db.source.setCell(row.id, p.id, !cellValue(row, p))
    return
  }
  scrollToCell(s.focus.row, s.focus.col)
  nextTick(() => {
    editing.value = { row, col: s.focus.col, anchor: cellEl(s.focus.row, s.focus.col), text }
  })
}
function endEdit(move?: 'down' | 'right' | 'left' | null) {
  editing.value = null
  // Enter on the last row of an ungrouped table adds a row and edits its title (like a spreadsheet).
  if (move === 'down' && sel.value && !store.value?.grouped && sel.value.focus.row === itemCount.value - 1) {
    newRow()
    focusGrid()
    return
  }
  if (move && sel.value) {
    const key = move === 'down' ? 'ArrowDown' : 'Tab'
    const next = navigate(sel.value, { key, shiftKey: move === 'left' }, bounds.value)
    if (next) {
      sel.value = next
      scrollToCell(next.focus.row, next.focus.col)
    }
  }
  focusGrid()
}

function clearSelectedCells() {
  const s = sel.value
  if (!s || !db.canEditContent.value) return
  const r = selectionRect(s)
  for (let i = r.top; i <= r.bottom; i++) {
    const row = rowOfItem(i)
    if (!row) continue
    for (let c = r.left; c <= r.right; c++) {
      const p = cols.value[c]
      if (p && !isReadOnly(p.type) && cellValue(row, p) !== undefined) db.source.setCell(row.id, p.id, p.type === 'checkbox' ? false : null)
    }
  }
}

function onKey(e: KeyboardEvent) {
  if (editing.value || e.isComposing) return
  if (e.target !== scroller.value) return
  if ((e.key === 'Delete' || e.key === 'Backspace') && checked.value.size) {
    e.preventDefault()
    deleteChecked()
    return
  }
  if (!sel.value) {
    if (e.key.startsWith('Arrow') && itemCount.value) {
      e.preventDefault()
      const first = Array.from({ length: itemCount.value }, (_, i) => i).find(i => bounds.value.isRow(i)) ?? 0
      sel.value = { anchor: { row: first, col: 0 }, focus: { row: first, col: 0 } }
    }
    return
  }
  const next = navigate(sel.value, e, bounds.value)
  if (next) {
    e.preventDefault()
    sel.value = next
    scrollToCell(next.focus.row, next.focus.col)
    return
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    startEdit(null)
  }
  else if (e.key === 'Escape') {
    e.preventDefault()
    if (checked.value.size) checked.value = new Set()
    else sel.value = null
  }
  else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault()
    clearSelectedCells()
  }
  else if (e.key === ' ' && cols.value[sel.value.focus.col]?.type === 'checkbox') {
    e.preventDefault()
    startEdit(null)
  }
  else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
    const p = cols.value[sel.value.focus.col]
    if (p && !['checkbox', 'date', 'files'].includes(p.type)) {
      e.preventDefault()
      startEdit(e.key)
    }
  }
}

// ── Copy / paste (TSV, like spreadsheets) ──
function onCopy(e: ClipboardEvent) {
  const s = sel.value
  if (!s || editing.value || !e.clipboardData) return
  const r = selectionRect(s)
  const out: string[][] = []
  for (let i = r.top; i <= r.bottom; i++) {
    const row = rowOfItem(i)
    if (!row) continue
    const line: string[] = []
    for (let c = r.left; c <= r.right; c++) {
      const p = cols.value[c]!
      line.push(displayText(p, cellValue(row, p), db.valueCtx.value))
    }
    out.push(line)
  }
  e.clipboardData.setData('text/plain', toTsv(out))
  e.preventDefault()
}

async function onPaste(e: ClipboardEvent) {
  const s = sel.value
  const text = e.clipboardData?.getData('text/plain')
  if (!s || editing.value || !text || !db.canEditContent.value) return
  e.preventDefault()
  const start = itemAt(selectionRect(s).top)
  if (start?.kind !== 'row') return
  await pasteMatrix(parseTsv(text), start.seg, start.index, selectionRect(s).left)
}

/**
 * Writes a pasted matrix from (segment row `index`, column `col`): existing rows get `setCell`, extra lines create
 * rows after the last one. Unknown select / multi-select names become new options first.
 */
async function pasteMatrix(matrix: string[][], seg: number, index: number, col: number) {
  const s = store.value
  const view = db.view.value
  if (!s || !view || !matrix.length) return
  const key = s.segments.value[seg]?.key
  const page = key === undefined
    ? await db.source.rows(view.id, { offset: index, limit: matrix.length }, db.query.value)
    : await db.source.rowsInGroup(view.id, key, { offset: index, limit: matrix.length }, db.query.value)
  const targets = page.rows
  const ctxValues = db.valueCtx.value
  const allowNew = db.canEditStructure.value
  const working = new Map<string, Prop>()
  const propAt = (c: number) => {
    const p = cols.value[col + c]
    return p ? working.get(p.id) ?? p : undefined
  }
  const pendingProps = new Map<string, Prop>()
  const writes: Array<{ line: number, prop: Prop, value: unknown }> = []
  matrix.forEach((line, li) => {
    line.forEach((text, ci) => {
      const p = propAt(ci)
      if (!p || isReadOnly(p.type)) return
      const parsed = parseText(p, text, ctxValues, allowNew)
      if (parsed.value === undefined) return
      if (parsed.newOptions?.length) {
        const next = { ...p, config: { ...p.config, options: [...(p.config?.options ?? []), ...parsed.newOptions] } }
        working.set(p.id, next)
        pendingProps.set(p.id, next)
      }
      writes.push({ line: li, prop: p, value: parsed.value })
    })
  })
  for (const p of pendingProps.values()) db.source.upsertProp(p)
  let last = targets[targets.length - 1]?.id ?? null
  const extra = new Map<number, Record<string, unknown>>()
  for (const w of writes) {
    const row = targets[w.line]
    if (row) db.source.setCell(row.id, w.prop.id, w.value)
    else {
      const values = extra.get(w.line) ?? {}
      if (w.value !== null) values[w.prop.id] = w.value
      extra.set(w.line, values)
    }
  }
  for (let li = targets.length; li < matrix.length; li++) {
    const values = { ...extra.get(li) }
    const gv = groupValue(key)
    if (gv !== undefined && groupProp.value) values[groupProp.value.id] = gv
    last = db.source.createRow({ values, after: last })
  }
}

// ── Rows: create, delete, check, move, open ──
/**
 * "+ New": `createRow` returns the id at once, but a real source applies the write asynchronously (worker round
 * trip), so the row shows up only after `version` bumps and the window is re-read. We wait for it (scrolling to the
 * end meanwhile) and then open its title editor, so typing goes into the cell.
 */
function newRow(seg?: number) {
  if (!db.canEditContent.value) return
  const key = seg === undefined ? undefined : segment(seg)?.key
  const gv = groupValue(key)
  const values = gv !== undefined && groupProp.value ? { [groupProp.value.id]: gv } : {}
  const last = !store.value?.grouped && !db.view.value?.config.sorts?.length && itemCount.value ? rowOfItem(itemCount.value - 1)?.id : undefined
  const id = db.source.createRow(last ? { values, after: last } : { values })
  pendingEdit.value = id
  clearTimeout(pendingTimer)
  pendingTimer = setTimeout(() => {
    if (pendingEdit.value === id) pendingEdit.value = null
  }, 5000)
  followEnd()
}
let pendingTimer: ReturnType<typeof setTimeout> | undefined
/** While a new row is pending in an unsorted, ungrouped table, keep the end in view (it lands there). */
function followEnd() {
  if (!pendingEdit.value || store.value?.grouped || db.view.value?.config.sorts?.length) return
  nextTick(() => rowVirtualizer.value.scrollToIndex(Math.max(0, itemCount.value - 1), { align: 'end' }))
}
watch(itemCount, followEnd)
onBeforeUnmount(() => clearTimeout(pendingTimer))
function deleteChecked() {
  if (!db.canEditContent.value || !checked.value.size) return
  db.source.deleteRows([...checked.value])
  checked.value = new Set()
}
function toggleChecked(id: string) {
  const next = new Set(checked.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  checked.value = next
}
const loadedIds = computed(() => rendered.value.map(r => r.row?.id).filter((x): x is string => !!x))
const allChecked = computed(() => loadedIds.value.length > 0 && loadedIds.value.every(id => checked.value.has(id)))
function toggleAll() {
  checked.value = allChecked.value ? new Set() : new Set([...checked.value, ...loadedIds.value])
}

const canMove = computed(() => db.canEditContent.value && !db.view.value?.config.sorts?.length)
const drag = ref<{ id: string, over: number | null, after: boolean } | null>(null)
function onRowDragStart(e: DragEvent, row: Row) {
  if (!canMove.value) return e.preventDefault()
  drag.value = { id: row.id, over: null, after: false }
  e.dataTransfer?.setData('application/x-me-db-row', row.id)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
function onRowDragOver(e: DragEvent, index: number) {
  if (!drag.value) return
  e.preventDefault()
  const el = e.currentTarget as HTMLElement
  const r = el.getBoundingClientRect()
  drag.value = { ...drag.value, over: index, after: e.clientY > r.top + r.height / 2 }
}
function onRowDrop(e: DragEvent) {
  const d = drag.value
  drag.value = null
  if (!d || d.over === null) return
  e.preventDefault()
  const item = itemAt(d.over)
  if (item?.kind !== 'row' || !store.value) return
  const target = store.value.rowAt(item.seg, item.index)
  if (!target || target.id === d.id) return
  const before = d.after ? store.value.rowAt(item.seg, item.index + 1) : target
  const after = d.after ? target : store.value.rowAt(item.seg, item.index - 1)
  db.source.moveRow(d.id, after?.id ?? null, before?.id ?? null)
  // Dropped into another group: take that group's value.
  const key = segment(item.seg)?.key
  const gv = groupValue(key)
  if (store.value.grouped && groupProp.value && gv !== undefined && !isReadOnly(groupProp.value.type)) db.source.setCell(d.id, groupProp.value.id, gv)
}

// ── Column header: menu, add property, reorder ──
const headerMenu = shallowRef<{ prop: Prop, anchor: HTMLElement } | null>(null)
const addProp = shallowRef<HTMLElement | null>(null)
const colDrag = ref<{ id: string, over: string | null, after: boolean } | null>(null)
let colResizeStarted = false
function onHeaderClick(p: Prop, e: MouseEvent) {
  if (colResizeStarted) return
  headerMenu.value = { prop: p, anchor: e.currentTarget as HTMLElement }
}
function onColDragStart(e: DragEvent, p: Prop) {
  if (!db.canEditStructure.value || p.type === 'title' || resizing.value) return e.preventDefault()
  colDrag.value = { id: p.id, over: null, after: false }
  e.dataTransfer?.setData('application/x-me-db-col', p.id)
}
function onColDragOver(e: DragEvent, p: Prop) {
  if (!colDrag.value || p.type === 'title') return
  e.preventDefault()
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  colDrag.value = { ...colDrag.value, over: p.id, after: e.clientX > r.left + r.width / 2 }
}
function onColDrop() {
  const d = colDrag.value
  colDrag.value = null
  if (!d?.over || d.over === d.id) return
  const ids = cols.value.map(c => c.id).filter(id => id !== d.id)
  const at = ids.indexOf(d.over) + (d.after ? 1 : 0)
  ids.splice(at, 0, d.id)
  db.updateView({ visible: ids.filter(id => cols.value.find(c => c.id === id)?.type !== 'title') })
}
function startResize(e: MouseEvent | TouchEvent, col: number) {
  const header = table.getHeaderGroups()[0]?.headers[col]
  if (!header || !db.canEditStructure.value) return
  colResizeStarted = true
  const done = () => setTimeout(() => (colResizeStarted = false))
  document.addEventListener('mouseup', done, { once: true })
  document.addEventListener('touchend', done, { once: true })
  header.getResizeHandler()(e)
}

// ── Footer aggregates ──
const aggValues = ref<Record<string, number | string | null>>({})
const aggMenu = shallowRef<{ prop: Prop, anchor: HTMLElement } | null>(null)
let aggSeq = 0
async function loadAggregates() {
  const view = db.view.value
  if (!view) return
  const mine = ++aggSeq
  const entries = Object.entries(view.config.aggregates ?? {}).filter(([id]) => cols.value.some(c => c.id === id))
  const results = await Promise.all(entries.map(([id, fn]) => db.source.aggregate(view.id, id, fn, db.query.value).catch((err) => {
    db.report(err)
    return null
  })))
  if (mine !== aggSeq) return
  aggValues.value = Object.fromEntries(entries.map(([id], i) => [id, results[i] ?? null]))
}
watch(() => [db.view.value?.id, JSON.stringify(db.view.value?.config), db.source.version.value, db.query.value.search, cols.value.length], loadAggregates, { immediate: true })
function setAggregate(p: Prop, fn: string | null) {
  aggMenu.value = null
  db.updateView((c) => {
    const aggregates = { ...c.aggregates }
    if (fn) aggregates[p.id] = fn
    else delete aggregates[p.id]
    return { ...c, aggregates }
  })
}
const aggLabel = (p: Prop) => {
  const fn = db.view.value?.config.aggregates?.[p.id]
  return fn ? formatAggregate(p, fn, aggValues.value[p.id] ?? null, db.locale.value) : ''
}

onBeforeUnmount(() => {
  editing.value = null
})

defineExpose({ sel, checked, startEdit, pasteMatrix, store, rowVirtualizer, colVirtualizer, deleteChecked, newRow })
</script>

<template>
  <div class="me-db-table-wrap">
    <div
      ref="scroller"
      class="me-db-table"
      :class="{ 'is-full': props.full, 'is-resizing': !!resizing }"
      :style="{ height: `${contentHeight}px` }"
      tabindex="0"
      role="grid"
      :aria-rowcount="itemCount"
      :aria-colcount="cols.length"
      @keydown="onKey"
      @copy="onCopy"
      @paste="onPaste"
    >
      <div class="me-db-table-inner" :style="{ width: `${totalWidth}px` }">
        <!-- Header -->
        <div class="me-db-thead" role="row" :style="{ width: `${totalWidth}px`, height: `${sizes.header}px` }">
          <div class="me-db-th me-db-gutter" :style="{ width: `${gutter}px` }">
            <input type="checkbox" class="me-db-row-check" :checked="allChecked" :aria-label="m.selectAll" @change="toggleAll">
          </div>
          <div
            v-if="cols[0]"
            class="me-db-th is-first"
            role="columnheader"
            :style="{ left: `${gutter}px`, width: `${firstWidth}px` }"
            @click="onHeaderClick(cols[0]!, $event)"
          >
            <PropIcon :type="cols[0]!.type" />
            <span class="me-db-th-name">{{ cols[0]!.name }}</span>
            <span class="me-db-resize" :class="{ 'is-active': resizing === cols[0]!.id }" draggable="false" @mousedown.stop.prevent="startResize($event, 0)" @touchstart.stop="startResize($event, 0)" @click.stop />
          </div>
          <div class="me-db-spacer" :style="{ width: `${padLeft}px` }" />
          <div
            v-for="vc in vCols"
            :key="cols[vc.col]?.id ?? vc.index"
            class="me-db-th"
            role="columnheader"
            :class="{ 'is-drop-before': colDrag?.over === cols[vc.col]?.id && !colDrag?.after, 'is-drop-after': colDrag?.over === cols[vc.col]?.id && colDrag?.after }"
            :style="{ width: `${widthOf(vc.col)}px` }"
            :draggable="db.canEditStructure.value && !resizing"
            :data-col-id="cols[vc.col]?.id"
            @click="onHeaderClick(cols[vc.col]!, $event)"
            @dragstart="onColDragStart($event, cols[vc.col]!)"
            @dragover="onColDragOver($event, cols[vc.col]!)"
            @drop.prevent="onColDrop"
            @dragend="colDrag = null"
          >
            <PropIcon :type="cols[vc.col]!.type" />
            <span class="me-db-th-name">{{ cols[vc.col]!.name }}</span>
            <span class="me-db-resize" :class="{ 'is-active': resizing === cols[vc.col]!.id }" draggable="false" @mousedown.stop.prevent="startResize($event, vc.col)" @touchstart.stop="startResize($event, vc.col)" @click.stop @dragstart.prevent />
          </div>
          <div class="me-db-spacer" :style="{ width: `${padRight}px` }" />
          <button
            v-if="db.canEditStructure.value"
            type="button"
            class="me-db-th me-db-add-col"
            :style="{ width: `${addColWidth}px` }"
            :aria-label="m.addProperty"
            @click="addProp = $event.currentTarget as HTMLElement"
          >
            <Plus />
          </button>
        </div>

        <!-- Body -->
        <div class="me-db-tbody" role="rowgroup" :style="{ height: `${rowVirtualizer.getTotalSize()}px` }">
          <div
            v-for="r in rendered"
            :key="r.v.index"
            class="me-db-tr"
            :class="{
              'is-group': r.item?.kind === 'group',
              'is-add': r.item?.kind === 'add',
              'is-checked': !!r.row && checked.has(r.row.id),
              'is-drop-before': drag?.over === r.v.index && !drag?.after,
              'is-drop-after': drag?.over === r.v.index && drag?.after,
            }"
            role="row"
            :data-row="r.v.index"
            :aria-rowindex="r.v.index + 1"
            :style="{ transform: `translateY(${r.top}px)`, height: `${r.v.size}px`, width: `${totalWidth}px` }"
            @dragover="onRowDragOver($event, r.v.index)"
            @drop="onRowDrop"
          >
            <!-- Group header -->
            <template v-if="r.item?.kind === 'group'">
              <div class="me-db-group-head">
                <button type="button" class="me-db-icon-button" :aria-expanded="!store?.isCollapsed(r.item.seg)" @click="store?.toggleCollapsed(r.item.seg)">
                  <ChevronRight v-if="store?.isCollapsed(r.item.seg)" /><ChevronDown v-else />
                </button>
                <span v-if="groupOption(segment(r.item.seg)?.key)" class="me-db-tag" :data-color="groupOption(segment(r.item.seg)?.key)!.color === 'default' ? undefined : groupOption(segment(r.item.seg)?.key)!.color">{{ segment(r.item.seg)?.label }}</span>
                <span v-else class="me-db-group-label">{{ segment(r.item.seg)?.label || fmt(m.noValue, { name: groupProp?.name ?? '' }) }}</span>
                <span class="me-db-group-count">{{ segment(r.item.seg)?.count }}</span>
                <button v-if="db.canEditContent.value" type="button" class="me-db-icon-button" :aria-label="m.newRow" @click="newRow(r.item.seg)"><Plus /></button>
              </div>
            </template>
            <!-- "+ New" in a group -->
            <template v-else-if="r.item?.kind === 'add'">
              <button v-if="db.canEditContent.value" type="button" class="me-db-new-row" :style="{ left: `${gutter}px` }" @click="newRow(r.item.seg)">
                <Plus /> {{ m.newRow }}
              </button>
            </template>
            <!-- Data row -->
            <template v-else>
              <div class="me-db-td me-db-gutter" :style="{ width: `${gutter}px` }">
                <span
                  v-if="r.row && canMove"
                  class="me-db-row-handle"
                  draggable="true"
                  :title="m.dragToMove"
                  @dragstart="onRowDragStart($event, r.row)"
                  @dragend="drag = null"
                ><GripVertical /></span>
                <input v-if="r.row" type="checkbox" class="me-db-row-check" :checked="checked.has(r.row.id)" :aria-label="m.selectRow" @change="toggleChecked(r.row.id)">
              </div>
              <template v-if="r.row">
                <div
                  class="me-db-td is-first"
                  role="gridcell"
                  data-col="0"
                  :class="{ 'is-active': sel?.focus.row === r.v.index && sel?.focus.col === 0, 'is-selected': inSelection(sel, r.v.index, 0) }"
                  :style="{ left: `${gutter}px`, width: `${firstWidth}px` }"
                  @mousedown="selectCell(r.v.index, 0, $event)"
                  @dblclick="startEdit(null)"
                >
                  <CellValue v-if="cols[0]" :prop="cols[0]!" :value="valueAt(r.row, 0)" />
                  <button type="button" class="me-db-open" :aria-label="m.open" @mousedown.stop @click.stop="db.source.openRow(r.row.id)"><Maximize2 />{{ m.open }}</button>
                </div>
                <div class="me-db-spacer" :style="{ width: `${padLeft}px` }" />
                <div
                  v-for="vc in vCols"
                  :key="vc.index"
                  class="me-db-td"
                  role="gridcell"
                  :data-col="vc.col"
                  :class="{
                    'is-active': sel?.focus.row === r.v.index && sel?.focus.col === vc.col,
                    'is-selected': inSelection(sel, r.v.index, vc.col),
                  }"
                  :style="{ width: `${widthOf(vc.col)}px` }"
                  @mousedown="selectCell(r.v.index, vc.col, $event)"
                  @dblclick="startEdit(null)"
                  @click="cols[vc.col]?.type === 'checkbox' && sel?.focus.col === vc.col && !$event.shiftKey && startEdit(null)"
                >
                  <CellValue v-if="cols[vc.col]" :prop="cols[vc.col]!" :value="valueAt(r.row, vc.col)" />
                </div>
              </template>
              <div v-else class="me-db-td is-placeholder" :style="{ left: `${gutter}px`, width: `${firstWidth + restWidth}px` }">
                <span class="me-db-skeleton" />
              </div>
            </template>
          </div>
        </div>

        <button v-if="!store?.grouped && db.canEditContent.value" type="button" class="me-db-new-row is-static" :style="{ left: `${gutter}px` }" @click="newRow()">
          <Plus /> {{ m.newRow }}
        </button>

        <!-- Footer -->
        <div class="me-db-tfoot" :style="{ width: `${totalWidth}px` }">
          <div class="me-db-tf me-db-gutter" :style="{ width: `${gutter}px` }" />
          <button v-if="cols[0]" type="button" class="me-db-tf is-first" :style="{ left: `${gutter}px`, width: `${firstWidth}px` }" @click="aggMenu = { prop: cols[0]!, anchor: $event.currentTarget as HTMLElement }">
            <span v-if="aggLabel(cols[0]!)" class="me-db-agg"><span class="me-db-agg-fn">{{ m.aggregates[db.view.value?.config.aggregates?.[cols[0]!.id] ?? ''] }}</span> {{ aggLabel(cols[0]!) }}</span>
            <span v-else class="me-db-agg-empty">{{ m.calculate }}</span>
          </button>
          <div class="me-db-spacer" :style="{ width: `${padLeft}px` }" />
          <button
            v-for="vc in vCols"
            :key="vc.index"
            type="button"
            class="me-db-tf"
            :style="{ width: `${widthOf(vc.col)}px` }"
            :data-agg="cols[vc.col]?.id"
            @click="aggMenu = { prop: cols[vc.col]!, anchor: $event.currentTarget as HTMLElement }"
          >
            <span v-if="aggLabel(cols[vc.col]!)" class="me-db-agg"><span class="me-db-agg-fn">{{ m.aggregates[db.view.value?.config.aggregates?.[cols[vc.col]!.id] ?? ''] }}</span> {{ aggLabel(cols[vc.col]!) }}</span>
            <span v-else class="me-db-agg-empty">{{ m.calculate }}</span>
          </button>
        </div>
      </div>
    </div>

    <div v-if="checked.size" class="me-db-selection-bar">
      <span>{{ fmt(m.selected, { count: checked.size }) }}</span>
      <button v-if="db.canEditContent.value" type="button" class="me-btn me-db-danger" @click="deleteChecked">{{ m.deleteRows }}</button>
    </div>

    <CellEditor
      v-if="editing && cols[editing.col]"
      :key="`${editing.row.id}:${editing.col}`"
      :prop="cols[editing.col]!"
      :row="editing.row"
      :anchor="editing.anchor"
      :initial-text="editing.text"
      @close="endEdit"
    />
    <PropertyMenu v-if="headerMenu" :prop="headerMenu.prop" :anchor="headerMenu.anchor" @close="headerMenu = null" />
    <PropertyEditor v-if="addProp" :anchor="addProp" @close="addProp = null" />
    <DbPopover v-if="aggMenu" :anchor="aggMenu.anchor" :scope="db.scope.value" @close="aggMenu = null">
      <div class="me-menu me-db-menu" role="menu">
        <button type="button" class="me-menu-item" role="menuitem" @click="setAggregate(aggMenu.prop, null)">{{ m.none }}</button>
        <button v-for="fn in aggregatesFor(aggMenu.prop)" :key="fn" type="button" class="me-menu-item" role="menuitem" :aria-checked="db.view.value?.config.aggregates?.[aggMenu.prop.id] === fn" @click="setAggregate(aggMenu.prop, fn)">
          {{ m.aggregates[fn] }}
        </button>
      </div>
    </DbPopover>
  </div>
</template>
