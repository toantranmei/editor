<script setup lang="ts">
/** List view: one line per row (title + card properties), virtualized, optionally grouped. Click opens the row. */
import { ChevronDown, ChevronRight, FileText } from '@lucide/vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { componentTokens } from '@toantranmei/editor'
import { computed, ref, watch } from 'vue'
import CellValue from '../components/CellValue.vue'
import { useDb } from '../context'
import { rectWithFallback } from '../virtual'
import { fmt } from '../messages'
import { useRowStore } from '../use-rows'
import { cellValue, cssPx, isEmptyValue } from '../util'

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
const count = computed(() => {
  void store.value?.tick.value
  void store.value?.collapsed.value
  return store.value?.itemCount() ?? 0
})
const virtualizer = useVirtualizer(computed(() => ({
  count: count.value,
  getScrollElement: () => scroller.value,
  estimateSize: (i: number) => (store.value?.itemAt(i)?.kind === 'group' ? groupH.value : rowH.value),
  overscan: 10,
  observeElementRect: rectWithFallback(800, 520),
  initialRect: { width: 800, height: 520 },
})))
watch(() => [store.value?.segments.value, store.value?.collapsed.value], () => virtualizer.value.measure())
const items = computed(() => {
  void store.value?.tick.value
  return virtualizer.value.getVirtualItems().map((v) => {
    const item = store.value?.itemAt(v.index)
    return { v, item, row: item?.kind === 'row' ? store.value!.rowAt(item.seg, item.index) : undefined }
  })
})
watch(() => {
  const list = virtualizer.value.getVirtualItems()
  return list.length ? `${list[0]!.index}:${list[list.length - 1]!.index}:${count.value}` : ''
}, (r) => {
  if (!r || !store.value) return
  const [a, b] = r.split(':').map(Number)
  store.value.ensureItems(a!, b!)
})
const segment = (i: number) => store.value?.segments.value[i]
</script>

<template>
  <div ref="scroller" class="me-db-scroll me-db-list" :class="{ 'is-full': full }" role="list">
    <div class="me-db-virtual" :style="{ height: `${virtualizer.getTotalSize()}px` }">
      <div v-for="it in items" :key="it.v.index" class="me-db-list-item" :class="{ 'is-group': it.item?.kind === 'group' }" :style="{ transform: `translateY(${it.v.start}px)`, height: `${it.v.size}px` }" role="listitem">
        <template v-if="it.item?.kind === 'group'">
          <button type="button" class="me-db-icon-button" @click="store?.toggleCollapsed(it.item.seg)">
            <ChevronRight v-if="store?.isCollapsed(it.item.seg)" /><ChevronDown v-else />
          </button>
          <span class="me-db-group-label">{{ segment(it.item.seg)?.label || fmt(m.noValue, { name: groupProp?.name ?? '' }) }}</span>
          <span class="me-db-group-count">{{ segment(it.item.seg)?.count }}</span>
        </template>
        <template v-else-if="it.row">
          <button type="button" class="me-db-list-open" @click="db.source.openRow(it.row.id)">
            <FileText class="me-db-menu-icon" />
            <span class="me-db-list-title">{{ title ? String(cellValue(it.row, title) ?? '') || m.untitled : m.untitled }}</span>
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
</template>
