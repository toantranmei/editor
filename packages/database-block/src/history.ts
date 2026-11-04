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
  /** Every write made while `fn` runs (even after it awaits, e.g. a button's confirmation) is one step. */
  group: <T>(fn: () => Promise<T> | T) => Promise<T>
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
  // A row brought back as a new row (redo of a create, undo of a delete without `restoreRows`) has a new id: later
  // steps still name the old one, so every closure resolves ids through this map.
  const alias = new Map<string, string>()
  const resolve = (id: string) => {
    let at = id
    for (let i = 0; i < 100 && alias.has(at); i++) at = alias.get(at)!
    return at
  }
  const again = (old: string, created: string) => {
    if (created !== old) alias.set(old, created)
  }
  let holding = 0

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
        if (open === step && !holding) open = null
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
  /** The cached row right after `r`; null = last. */
  function nextOf(r: Row, skip: Set<string>): string | null {
    let best: Row | null = null
    for (const x of cache.values()) {
      if (skip.has(x.id) || !x.position || !r.position || x.position <= r.position) continue
      if (!best || x.position < best.position) best = x
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
        inner.setCell(resolve(rowId), propId, before)
        patchCache(resolve(rowId), propId, before)
      }, () => {
        inner.setCell(resolve(rowId), propId, value)
        patchCache(resolve(rowId), propId, value)
      })
    },
    createRow(init) {
      const id = inner.createRow(init)
      cache.set(id, { id, position: '', values: { ...init?.values } })
      record(() => inner.deleteRows([resolve(id)]), () => {
        // Same id when the source can restore it, else a new row that later steps follow through `alias`.
        if (inner.restoreRows) inner.restoreRows([resolve(id)])
        else again(resolve(id), inner.createRow(init && { ...init, after: init.after ? resolve(init.after) : init.after }))
      })
      return id
    },
    deleteRows(ids) {
      const gone = new Set(ids)
      // Each row with the (kept) row before it, so it comes back in its place.
      const rows = ids.map(id => cache.get(id)).filter((r): r is Row => !!r).map(r => ({ row: r, after: previousOf(r, gone) }))
      inner.deleteRows(ids)
      record(() => {
        if (inner.restoreRows) inner.restoreRows(ids.map(resolve))
        else for (const { row, after } of rows) again(resolve(row.id), inner.createRow({ values: row.values, after: after && resolve(after) }))
      }, () => inner.deleteRows(ids.map(resolve)))
    },
    moveRow(rowId, after, before) {
      const r = cache.get(rowId)
      // Both neighbours: a host placing a row "after prev" alone could land it past the next row.
      const prev = r ? previousOf(r, new Set([rowId])) : null
      const next = r ? nextOf(r, new Set([rowId])) : null
      inner.moveRow(rowId, after, before)
      const opt = (id: string | null | undefined) => (id ? resolve(id) : id ?? null)
      record(() => inner.moveRow(resolve(rowId), opt(prev), opt(next)), () => inner.moveRow(resolve(rowId), opt(after), opt(before)))
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
    async group(fn) {
      if (!holding) open = null
      holding++
      try {
        return await fn()
      }
      finally {
        holding--
        if (!holding) open = null
      }
    },
  }
}
