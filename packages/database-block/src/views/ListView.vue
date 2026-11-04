<script setup lang="ts">
/** List view: one line per row (title + card properties), virtualized, optionally grouped. Click opens the row. */
import { ChevronDown, ChevronRight, CornerDownRight, FileText, Plus } from '@lucide/vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { componentTokens } from '@toantranmei/editor'
import { computed, ref, shallowRef, watch } from 'vue'
import CellValue from '../components/CellValue.vue'
import RowIcon from '../components/RowIcon.vue'
import { useDb } from '../context'
import { rectWithFallback } from '../virtual'
import { fmt } from '../messages'
import type { Item } from '../row-store'
import { useSubItems } from '../sub-items'
import type { Row } from '../types'
import { useRowStore } from '../use-rows'
import { cellValue, cssPx, isEmptyValue, pageIcon } from '../util'

defineProps<{ full?: boolean }>()
const db = useDb()
const m = computed(() => db.m.value)
const store = useRowStore(db)
const scroller = ref<HTMLElement | null>(null)
const rowH = ref(Number.parseFloat(componentTokens.database.rowHeight) + 4)
const groupH = ref(Number.parseFloat(componentTokens.database.groupHeaderHeight))
watch(scroller, (el) => {
  if (!el) return
  rowH.value = cssPx(el, '--me-database-row-height', componentTokens.database.rowHeight) + 4
  groupH.value = cssPx(el, '--me-database-group-header-height', componentTokens.database.groupHeaderHeight)
})
const title = computed(() => db.props.value.find(p => p.type === 'title'))
const shown = computed(() => (db.view.value?.config.card?.props ?? []).map(id => db.props.value.find(p => p.id === id)).filter(p => !!p))
const groupProp = computed(() => db.props.value.find(p => p.id === db.view.value?.config.group_by?.prop))
const baseCount = computed(() => {
  void store.value?.tick.value
  void store.value?.collapsed.value
  return store.value?.itemCount() ?? 0
})

// ── Sub-items (nested): ▸ on a row with sub-items inserts them under it, at any depth ──
type LItem = Item | { kind: 'child', row: Row, depth: number }
const sub = useSubItems(db)
/** Expanded rows (any depth). */
const open = ref(new Set<string>())
/** Expanded top-level rows and their store index. */
const tops = shallowRef<Array<{ id: string, at: number }>>([])
function descendants(id: string, depth: number, seen: Set<string>): Array<{ row: Row, depth: number }> {
  const out: Array<{ row: Row, depth: number }> = []
  for (const row of sub.childrenOf(id)) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    out.push({ row, depth })
    if (open.value.has(row.id)) out.push(...descendants(row.id, depth + 1, seen))
  }
  return out
}
const inserted = computed(() => (sub.nested.value ? tops.value.map(t => ({ ...t, rows: descendants(t.id, 1, new Set([t.id])) })) : []))
const count = computed(() => baseCount.value + inserted.value.reduce((n, e) => n + e.rows.length, 0))
function itemAt(i: number): LItem | undefined {
  let offset = 0
  for (const e of inserted.value) {
    if (i <= e.at + offset) break
    if (i <= e.at + offset + e.rows.length) {
      const c = e.rows[i - offset - e.at - 1]!
      return { kind: 'child', row: c.row, depth: c.depth }
    }
    offset += e.rows.length
  }
  return store.value?.itemAt(i - offset)
}
/** Store index of a displayed index (inserted sub-items before it skipped). */
function baseIndex(i: number): number {
  let offset = 0
  for (const e of inserted.value) {
    if (i <= e.at + offset) break
    offset += e.rows.length
  }
  return i - offset
}
const hasSubs = (row: Row) => sub.nested.value && sub.childrenOf(row.id).length > 0
function toggleSub(row: Row, displayIndex: number, top: boolean) {
  const next = new Set(open.value)
  if (next.has(row.id)) {
    next.delete(row.id)
    if (top) tops.value = tops.value.filter(t => t.id !== row.id)
  }
  else {
    next.add(row.id)
    if (top) tops.value = [...tops.value, { id: row.id, at: baseIndex(displayIndex) }].sort((a, b) => a.at - b.at)
  }
  open.value = next
}
watch(() => [db.view.value?.id, sub.prop.value?.id, sub.nested.value, JSON.stringify(db.query.value), JSON.stringify(db.view.value?.config.filter), JSON.stringify(db.view.value?.config.sorts), db.view.value?.config.group_by?.prop], () => {
  tops.value = []
  open.value = new Set()
})
const virtualizer = useVirtualizer(computed(() => ({
  count: count.value,
  getScrollElement: () => scroller.value,
  estimateSize: (i: number) => (itemAt(i)?.kind === 'group' ? groupH.value : rowH.value),
  overscan: 10,
  observeElementRect: rectWithFallback(800, 520),
  initialRect: { width: 800, height: 520 },
})))
watch(() => [store.value?.segments.value, store.value?.collapsed.value, inserted.value], () => virtualizer.value.measure())
const items = computed(() => {
  void store.value?.tick.value
  return virtualizer.value.getVirtualItems().map((v) => {
    const item = itemAt(v.index)
    const row = item?.kind === 'row' ? store.value!.rowAt(item.seg, item.index) : item?.kind === 'child' ? item.row : undefined
    return { v, item, row, depth: item?.kind === 'child' ? item.depth : 0 }
  })
})
watch(() => {
  const list = virtualizer.value.getVirtualItems()
  return list.length ? `${list[0]!.index}:${list[list.length - 1]!.index}:${count.value}` : ''
}, (r) => {
  if (!r || !store.value) return
  const [a, b] = r.split(':').map(Number)
  store.value.ensureItems(baseIndex(a!), baseIndex(b!))
})
const segment = (i: number) => store.value?.segments.value[i]
function newRow(e: MouseEvent) {
  const id = db.createRow({})
  db.openRow(id, e)
}
</script>

<template>
  <div class="me-db-list-wrap">
  <div ref="scroller" class="me-db-scroll me-db-list" :class="{ 'is-full': full }" :style="{ height: `${virtualizer.getTotalSize()}px` }" role="list">
    <div class="me-db-virtual" :style="{ height: `${virtualizer.getTotalSize()}px` }">
      <div
        v-for="it in items"
        :key="it.v.index"
        class="me-db-list-item"
        :class="{ 'is-group': it.item?.kind === 'group', 'is-child': it.item?.kind === 'child' }"
        :style="{ transform: `translateY(${it.v.start}px)`, height: `${it.v.size}px`, '--me-db-depth': it.depth }"
        role="listitem"
      >
        <template v-if="it.item?.kind === 'group'">
          <button type="button" class="me-db-icon-button" @click="store?.toggleCollapsed(it.item.seg)">
            <ChevronRight v-if="store?.isCollapsed(it.item.seg)" /><ChevronDown v-else />
          </button>
          <span class="me-db-group-label">{{ segment(it.item.seg)?.label || fmt(m.noValue, { name: groupProp?.name ?? '' }) }}</span>
          <span class="me-db-group-count">{{ segment(it.item.seg)?.count }}</span>
        </template>
        <template v-else-if="it.row">
          <button
            v-if="hasSubs(it.row)"
            type="button"
            class="me-db-icon-button me-db-subtoggle"
            :aria-expanded="open.has(it.row.id)"
            :aria-label="m.subItems"
            :title="m.subItems"
            data-subtoggle
            @click="toggleSub(it.row, it.v.index, it.item?.kind === 'row')"
          >
            <ChevronDown v-if="open.has(it.row.id)" /><ChevronRight v-else />
          </button>
          <span v-else-if="sub.nested.value" class="me-db-subtoggle-space" />
          <button type="button" class="me-db-list-open me-db-list-row" :data-row-id="it.row.id" :data-cc="db.colors(it.row).row" @click="db.openRow(it.row.id, $event)">
            <RowIcon v-if="pageIcon(db.view.value, it.row)" :icon="pageIcon(db.view.value, it.row)!" />
            <FileText v-else-if="db.view.value?.config.show_page_icon !== false" class="me-db-menu-icon" />
            <span class="me-db-list-title">{{ title ? String(cellValue(it.row, title) ?? '') || m.untitled : m.untitled }}</span>
            <span v-if="!sub.nested.value && sub.parentTitle(it.row)" class="me-db-parent-label" :title="m.parentItem"><CornerDownRight />{{ sub.parentTitle(it.row) }}</span>
          </button>
          <span class="me-db-list-props">
            <template v-for="p in shown" :key="p!.id">
              <CellValue v-if="!isEmptyValue(cellValue(it.row, p!))" :prop="p!" :value="cellValue(it.row, p!)" compact />
            </template>
          </span>
        </template>
        <span v-else-if="it.item?.kind === 'row'" class="me-db-skeleton" />
      </div>
    </div>
  </div>
  <button v-if="db.canEditContent.value && !store?.grouped" type="button" class="me-db-new-row is-static is-list" data-new-row @click="newRow($event)"><Plus />{{ m.newRow }}</button>
  </div>
</template>
