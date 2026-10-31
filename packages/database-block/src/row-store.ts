/**
 * Windowed row cache for one view. Views ask for the index range they show (+ overscan); the store requests only
 * the missing chunk-aligned windows (`rows(viewId, { offset, limit })`, or `rowsInGroup` per group), coalesces
 * requests while scrolling, drops responses that a newer state has made stale, and re-requests the visible
 * windows when the source's `version` changes (keeping the old rows on screen until the new ones arrive).
 */
import { shallowRef, triggerRef } from 'vue'
import type { DatabaseSource, Group, Row, RowQuery } from './types'

export interface Segment {
  /** Group key (`null`: "No value" group); `undefined` for the single segment of an ungrouped view. */
  key: string | null | undefined
  label: string
  count: number
}

/** A flattened list item: group header, data row, or the "+ New" row at the end of a group. */
export type Item =
  | { kind: 'group', seg: number }
  | { kind: 'row', seg: number, index: number }
  | { kind: 'add', seg: number }

interface Chunk { rows: Row[], stale: boolean }

export interface RowStoreOptions {
  source: DatabaseSource
  viewId: string
  query?: RowQuery
  /** Group the rows (`groups()` + `rowsInGroup()`), with these display options. */
  grouping?: { hideEmpty?: boolean, order?: string[] } | null
  pageSize?: number
  /** Min ms between two request batches while scrolling. */
  throttle?: number
  /** Chunks kept per segment outside the visible range. */
  keepChunks?: number
  onError?: (error: unknown) => void
}

export class RowStore {
  readonly segments = shallowRef<Segment[]>([])
  /** Bumped whenever rows arrive (views read rows through `rowAt`). */
  readonly tick = shallowRef(0)
  readonly loading = shallowRef(true)
  readonly collapsed = shallowRef(new Set<string>())

  private opts: Required<Omit<RowStoreOptions, 'query' | 'grouping' | 'onError'>> & Pick<RowStoreOptions, 'query' | 'grouping' | 'onError'>
  /** Chunks per segment key (stable across group list changes). */
  private chunks = new Map<string, Map<number, Chunk>>()
  private inflight = new Set<string>()
  private wanted = new Map<number, [number, number]>()
  private generation = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private scheduled = false
  private lastFlush = 0
  private destroyed = false

  constructor(options: RowStoreOptions) {
    this.opts = { pageSize: 50, throttle: 50, keepChunks: 24, ...options }
    void this.reload()
  }

  get grouped() {
    return !!this.opts.grouping
  }

  get pageSize() {
    return this.opts.pageSize
  }

  destroy() {
    this.destroyed = true
    if (this.timer) clearTimeout(this.timer)
  }

  /** Re-reads groups / totals and every visible window, e.g. after `version` changed. */
  async refresh() {
    for (const segChunks of this.chunks.values()) for (const c of segChunks.values()) c.stale = true
    await this.loadSegments(this.generation, true)
  }

  /** Throws everything away (view, filter, sort or search changed). */
  async reload() {
    this.generation++
    this.chunks.clear()
    this.inflight.clear()
    this.loading.value = true
    this.bump()
    await this.loadSegments(this.generation, false)
  }

  private async loadSegments(gen: number, keepWanted: boolean) {
    const { source, viewId, query } = this.opts
    try {
      if (this.opts.grouping) {
        const groups = await source.groups(viewId, query)
        if (gen !== this.generation || this.destroyed) return
        this.segments.value = this.orderGroups(groups)
      }
      else if (!this.segments.value.length || this.segments.value[0]!.key !== undefined) {
        // The first window also gives the total.
        this.segments.value = [{ key: undefined, label: '', count: 0 }]
        if (!keepWanted) this.wanted.set(0, [0, this.opts.pageSize - 1])
      }
    }
    catch (error) {
      this.report(error)
    }
    if (!keepWanted) this.wanted.clear()
    if (!this.opts.grouping && !this.wanted.size) this.wanted.set(0, [0, this.opts.pageSize - 1])
    this.loading.value = this.opts.grouping ? false : this.loading.value
    this.schedule(true)
  }

  private orderGroups(groups: Group[]): Segment[] {
    const { hideEmpty, order } = this.opts.grouping ?? {}
    let list = groups.map(g => ({ key: g.key, label: g.label, count: g.count }))
    if (hideEmpty) list = list.filter(g => g.count > 0)
    if (order?.length) {
      const rank = (k: string | null) => {
        const i = order.indexOf(k ?? '')
        return i < 0 ? order.length + (k === null ? 1 : 0) : i
      }
      list = list.map((g, i) => ({ g, i })).sort((a, b) => rank(a.g.key) - rank(b.g.key) || a.i - b.i).map(x => x.g)
    }
    return list
  }

  // ── Reading ──

  private skey(seg: number): string {
    const k = this.segments.value[seg]?.key
    return k === undefined ? '*' : k === null ? '-' : `k:${k}`
  }

  rowAt(seg: number, index: number): Row | undefined {
    const chunk = this.chunks.get(this.skey(seg))?.get(Math.floor(index / this.opts.pageSize))
    return chunk?.rows[index % this.opts.pageSize]
  }

  /** Rows currently loaded, in order (for small views: board columns, calendar). */
  loadedRows(seg: number, from = 0, to = Number.POSITIVE_INFINITY): Row[] {
    const out: Row[] = []
    const count = this.segments.value[seg]?.count ?? 0
    for (let i = from; i <= Math.min(to, count - 1); i++) {
      const r = this.rowAt(seg, i)
      if (r) out.push(r)
    }
    return out
  }

  isCollapsed(seg: number) {
    const s = this.segments.value[seg]
    return !!s && this.collapsed.value.has(String(s.key))
  }

  toggleCollapsed(seg: number) {
    const s = this.segments.value[seg]
    if (!s) return
    const next = new Set(this.collapsed.value)
    const k = String(s.key)
    if (next.has(k)) next.delete(k)
    else next.add(k)
    this.collapsed.value = next
  }

  // ── Flattened layout (table / list) ──

  /** Item count of the flattened list; group headers and "+ New" rows only when grouped. */
  itemCount(): number {
    const segs = this.segments.value
    if (!this.grouped) return segs[0]?.count ?? 0
    return segs.reduce((n, s, i) => n + 1 + (this.isCollapsed(i) ? 0 : s.count + 1), 0)
  }

  itemAt(i: number): Item | undefined {
    const segs = this.segments.value
    if (!this.grouped) return i < (segs[0]?.count ?? 0) ? { kind: 'row', seg: 0, index: i } : undefined
    let start = 0
    for (let s = 0; s < segs.length; s++) {
      const size = 1 + (this.isCollapsed(s) ? 0 : segs[s]!.count + 1)
      if (i < start + size) {
        const local = i - start
        if (local === 0) return { kind: 'group', seg: s }
        if (local === size - 1) return { kind: 'add', seg: s }
        return { kind: 'row', seg: s, index: local - 1 }
      }
      start += size
    }
    return undefined
  }

  /** Flattened index of a group's first row. */
  itemIndexOf(seg: number, index: number): number {
    if (!this.grouped) return index
    let start = 0
    for (let s = 0; s < seg; s++) start += 1 + (this.isCollapsed(s) ? 0 : this.segments.value[s]!.count + 1)
    return start + 1 + index
  }

  /** Asks for the rows of flattened items `[from, to]` (the virtualizer's range). */
  ensureItems(from: number, to: number) {
    if (!this.grouped) return this.ensure(0, from, to)
    const ranges = new Map<number, [number, number]>()
    for (let i = Math.max(0, from); i <= to; i++) {
      const item = this.itemAt(i)
      if (item?.kind !== 'row') continue
      const r = ranges.get(item.seg)
      ranges.set(item.seg, r ? [Math.min(r[0], item.index), Math.max(r[1], item.index)] : [item.index, item.index])
    }
    this.wanted.clear()
    for (const [seg, [a, b]] of ranges) this.wanted.set(seg, [a, b])
    this.schedule(false)
  }

  /** Asks for rows `[from, to]` of one segment (other segments keep their wanted range). */
  ensure(seg: number, from: number, to: number, exclusive = true) {
    if (exclusive && !this.grouped) this.wanted.clear()
    this.wanted.set(seg, [Math.max(0, from), Math.max(0, to)])
    this.schedule(false)
  }

  // ── Fetching ──

  private schedule(immediate: boolean) {
    if (this.destroyed || this.scheduled) return
    this.scheduled = true
    const wait = immediate ? 0 : Math.max(0, this.opts.throttle - (Date.now() - this.lastFlush))
    const run = () => {
      this.timer = null
      this.scheduled = false
      this.lastFlush = Date.now()
      this.flush()
    }
    if (wait === 0) queueMicrotask(run)
    else this.timer = setTimeout(run, wait)
  }

  private flush() {
    const size = this.opts.pageSize
    for (const [seg, [from, to]] of this.wanted) {
      const segment = this.segments.value[seg]
      if (!segment) continue
      const last = segment.count > 0 ? Math.min(to, segment.count - 1) : Math.min(to, size - 1)
      const first = Math.floor(from / size)
      const lastChunk = Math.floor(last / size)
      const sk = this.skey(seg)
      const segChunks = this.chunks.get(sk) ?? new Map<number, Chunk>()
      this.chunks.set(sk, segChunks)
      // Contiguous runs of chunks that are missing or stale → one request each.
      let runStart = -1
      for (let c = first; c <= lastChunk + 1; c++) {
        const needs = c <= lastChunk && (!segChunks.get(c) || segChunks.get(c)!.stale) && !this.inflight.has(`${sk}:${c}`)
        if (needs && runStart < 0) runStart = c
        if (!needs && runStart >= 0) {
          void this.fetch(seg, runStart, c - 1)
          runStart = -1
        }
      }
      this.evict(seg, first, lastChunk)
    }
  }

  private async fetch(seg: number, firstChunk: number, lastChunk: number) {
    const { source, viewId, query, pageSize } = this.opts
    const segment = this.segments.value[seg]
    if (!segment) return
    const gen = this.generation
    const sk = this.skey(seg)
    const keys = [] as string[]
    for (let c = firstChunk; c <= lastChunk; c++) keys.push(`${sk}:${c}`)
    keys.forEach(k => this.inflight.add(k))
    const window = { offset: firstChunk * pageSize, limit: (lastChunk - firstChunk + 1) * pageSize }
    try {
      const page = segment.key === undefined
        ? await source.rows(viewId, window, query)
        : await source.rowsInGroup(viewId, segment.key, window, query)
      if (gen !== this.generation || this.destroyed) return
      const segChunks = this.chunks.get(sk) ?? new Map<number, Chunk>()
      this.chunks.set(sk, segChunks)
      for (let c = firstChunk; c <= lastChunk; c++) {
        const from = (c - firstChunk) * pageSize
        segChunks.set(c, { rows: page.rows.slice(from, from + pageSize), stale: false })
      }
      const at = this.segments.value.findIndex(x => x.key === segment.key)
      if (at >= 0 && page.total !== this.segments.value[at]!.count) {
        const segs = [...this.segments.value]
        segs[at] = { ...segs[at]!, count: page.total }
        this.segments.value = segs
        // Chunks past the new end are gone.
        for (const c of [...segChunks.keys()]) if (c * pageSize >= page.total && c > 0) segChunks.delete(c)
      }
      this.loading.value = false
      this.bump()
    }
    catch (error) {
      this.report(error)
    }
    finally {
      if (gen === this.generation) keys.forEach(k => this.inflight.delete(k))
    }
  }

  private evict(seg: number, first: number, last: number) {
    const segChunks = this.chunks.get(this.skey(seg))
    if (!segChunks || segChunks.size <= this.opts.keepChunks + (last - first + 1)) return
    const far = [...segChunks.keys()]
      .filter(c => c < first || c > last)
      .sort((a, b) => Math.min(Math.abs(b - first), Math.abs(b - last)) - Math.min(Math.abs(a - first), Math.abs(a - last)))
    while (segChunks.size > this.opts.keepChunks + (last - first + 1) && far.length) segChunks.delete(far.shift()!)
  }

  private bump() {
    this.tick.value++
    triggerRef(this.tick)
  }

  private report(error: unknown) {
    this.loading.value = false
    if (this.opts.onError) this.opts.onError(error)
    else console.error('[database-block]', error)
  }
}
