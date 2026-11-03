/**
 * Undo / redo of the block's data writes (cells, new rows, deleted rows, moves). `withHistory` wraps a
 * `DatabaseSource`: reads pass through and fill a cache of the rows seen (to know a cell's value before a write);
 * writes are recorded with their inverse. Writes made in the same task (a paste, a bulk edit, a duplicate of
 * several rows) form one step. Deleted rows come back with `source.restoreRows` when the source has it (same ids,
 * body included), else as new rows with the same values.
 */
import { ref, type Ref } from 'vue'
import type { DatabaseSource, Row } from './types'

interface Step { undo: Array<() => void>, redo: Array<() => void> }

export interface History {
  source: DatabaseSource
  canUndo: Ref<boolean>
  canRedo: Ref<boolean>
  undo: () => void
  redo: () => void
}

const LIMIT = 100

export function withHistory(inner: DatabaseSource): History {
  const cache = new Map<string, Row>()
  const done: Step[] = []
  const undone: Step[] = []
  const canUndo = ref(false)
  const canRedo = ref(false)
  let open: Step | null = null
  let replaying = false

  const sync = () => {
    canUndo.value = done.length > 0
    canRedo.value = undone.length > 0
  }
  function record(undo: () => void, redo: () => void) {
    if (replaying) return
    if (!open) {
      open = { undo: [], redo: [] }
      done.push(open)
      if (done.length > LIMIT) done.shift()
      undone.length = 0
      const step = open
      queueMicrotask(() => {
        if (open === step) open = null
      })
    }
    open.undo.unshift(undo)
    open.redo.push(redo)
    sync()
  }
  const remember = (rows: Row[]) => {
    for (const r of rows) cache.set(r.id, r)
    return rows
  }
  /** The cached row right before `r` (by position), skipping `skip`; null = first. */
  function previousOf(r: Row, skip: Set<string>): string | null {
    let best: Row | null = null
    for (const x of cache.values()) {
      if (skip.has(x.id) || !x.position || !r.position || x.position >= r.position) continue
      if (!best || x.position > best.position) best = x
    }
    return best?.id ?? null
  }
  const patchCache = (id: string, propId: string, value: unknown) => {
    const r = cache.get(id)
    if (r) cache.set(id, { ...r, values: { ...r.values, [propId]: value } })
  }

  const source: DatabaseSource = {
    ...inner,
    rows: (viewId, window, query) => inner.rows(viewId, window, query).then((page) => {
      remember(page.rows)
      return page
    }),
    rowsInGroup: (viewId, key, window, query) => inner.rowsInGroup(viewId, key, window, query).then((page) => {
      remember(page.rows)
      return page
    }),
    rowsInRange: inner.rowsInRange
      ? (viewId, propId, start, end, query) => inner.rowsInRange!(viewId, propId, start, end, query).then(remember)
      : undefined,
    setCell(rowId, propId, value) {
      const before = cache.get(rowId)?.values[propId] ?? null
      inner.setCell(rowId, propId, value)
      patchCache(rowId, propId, value)
      record(() => {
        inner.setCell(rowId, propId, before)
        patchCache(rowId, propId, before)
      }, () => {
        inner.setCell(rowId, propId, value)
        patchCache(rowId, propId, value)
      })
    },
    createRow(init) {
      let id = inner.createRow(init)
      cache.set(id, { id, position: '', values: { ...init?.values } })
      record(() => inner.deleteRows([id]), () => {
        id = inner.createRow(init)
      })
      return id
    },
    deleteRows(ids) {
      const gone = new Set(ids)
      // Each row with the (kept) row before it, so it comes back in its place.
      const rows = ids.map(id => cache.get(id)).filter((r): r is Row => !!r).map(r => ({ row: r, after: previousOf(r, gone) }))
      inner.deleteRows(ids)
      let restored = ids
      record(() => {
        if (inner.restoreRows) inner.restoreRows(ids)
        else restored = rows.map(({ row, after }) => inner.createRow({ values: row.values, after }))
      }, () => inner.deleteRows(inner.restoreRows ? ids : restored))
    },
    moveRow(rowId, after, before) {
      const r = cache.get(rowId)
      const prev = r ? previousOf(r, new Set([rowId])) : null
      inner.moveRow(rowId, after, before)
      record(() => inner.moveRow(rowId, prev, null), () => inner.moveRow(rowId, after, before))
    },
  }

  function play(from: Step[], to: Step[], which: 'undo' | 'redo') {
    open = null
    const step = from.pop()
    if (!step) return
    replaying = true
    try {
      for (const fn of step[which]) fn()
    }
    finally {
      replaying = false
    }
    to.push(step)
    sync()
  }
  return {
    source,
    canUndo,
    canRedo,
    undo: () => play(done, undone, 'undo'),
    redo: () => play(undone, done, 'redo'),
  }
}
