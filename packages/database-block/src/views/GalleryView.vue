<script setup lang="ts">
/** Gallery view: cards in a responsive grid (virtualized by card rows), cover from a files property. */
import { Image as ImageIcon, Plus } from '@lucide/vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { componentTokens } from '@toantranmei/editor'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import CellValue from '../components/CellValue.vue'
import { useDb } from '../context'
import { rectWithFallback } from '../virtual'
import type { Row } from '../types'
import { useRowStore } from '../use-rows'
import { cellValue, coverImage, cssPx, isEmptyValue } from '../util'

defineProps<{ full?: boolean }>()
const db = useDb()
const m = computed(() => db.m.value)
const store = useRowStore(db, { grouped: () => false })
/** "+ New" card after the last one (a slot in the grid). */
const canAdd = computed(() => db.canEditContent.value)
const scroller = ref<HTMLElement | null>(null)
const T = componentTokens.database
const size = computed(() => db.view.value?.config.size ?? 'm')
const cardW = ref(Number.parseFloat(T.galleryMedium))
const coverH = ref(Number.parseFloat(T.coverHeight))
const gap = 12
const width = ref(800)
function measure() {
  const el = scroller.value
  if (!el) return
  const token = size.value === 's' ? 'small' : size.value === 'l' ? 'large' : 'medium'
  cardW.value = cssPx(el, `--me-database-gallery-${token}`, size.value === 's' ? T.gallerySmall : size.value === 'l' ? T.galleryLarge : T.galleryMedium)
  coverH.value = cssPx(el, '--me-database-cover-height', T.coverHeight)
  width.value = el.clientWidth || 800
}
let ro: ResizeObserver | null = null
onMounted(() => {
  measure()
  if (typeof ResizeObserver !== 'undefined' && scroller.value) {
    ro = new ResizeObserver(measure)
    ro.observe(scroller.value)
  }
})
onBeforeUnmount(() => ro?.disconnect())
watch(size, measure)

const coverProp = computed(() => db.props.value.find(p => p.id === db.view.value?.config.cover && p.type === 'files'))
const title = computed(() => db.props.value.find(p => p.type === 'title'))
const shown = computed(() => (db.view.value?.config.card?.props ?? []).map(id => db.props.value.find(p => p.id === id)).filter(p => !!p))
const lanes = computed(() => Math.max(1, Math.floor((width.value + gap) / (cardW.value + gap))))
const cardH = computed(() => (coverProp.value ? coverH.value : 0) + 40 + shown.value.length * 26)
const total = computed(() => {
  void store.value?.tick.value
  return store.value?.segments.value[0]?.count ?? 0
})
const slotsTotal = computed(() => total.value + (canAdd.value ? 1 : 0))
const virtualizer = useVirtualizer(computed(() => ({
  count: Math.ceil(slotsTotal.value / lanes.value),
  getScrollElement: () => scroller.value,
  estimateSize: () => cardH.value + gap,
  overscan: 3,
  observeElementRect: rectWithFallback(800, 520),
  initialRect: { width: 800, height: 520 },
})))
watch([cardH, lanes], () => virtualizer.value.measure())
watch(() => {
  const list = virtualizer.value.getVirtualItems()
  return list.length ? `${list[0]!.index}:${list[list.length - 1]!.index}:${lanes.value}` : ''
}, (r) => {
  if (!r || !store.value) return
  const [a, b, l] = r.split(':').map(Number)
  store.value.ensure(0, a! * l!, (b! + 1) * l! - 1)
})
const rowsOf = (line: number) => {
  void store.value?.tick.value
  const out: Array<Row | null | 'add'> = []
  for (let i = line * lanes.value; i < Math.min(slotsTotal.value, (line + 1) * lanes.value); i++) out.push(i === total.value ? 'add' : store.value?.rowAt(0, i) ?? null)
  return out
}
const coverUrl = (row: Row) => (coverProp.value ? coverImage(cellValue(row, coverProp.value)) : null)
const fit = computed(() => !!db.view.value?.config.fit_image)
function newCard(e: MouseEvent) {
  const id = db.source.createRow({})
  db.openRow(id, e)
}
</script>

<template>
  <div ref="scroller" class="me-db-scroll me-db-gallery" :class="{ 'is-full': full, 'is-fit': fit }" :style="{ height: `${virtualizer.getTotalSize()}px` }" :data-size="size">
    <div class="me-db-virtual" :style="{ height: `${virtualizer.getTotalSize()}px` }">
      <div
        v-for="v in virtualizer.getVirtualItems()"
        :key="v.index"
        class="me-db-gallery-line"
        :style="{ transform: `translateY(${v.start}px)`, gridTemplateColumns: `repeat(${lanes}, ${cardW}px)` }"
      >
        <template v-for="(row, i) in rowsOf(v.index)" :key="row === 'add' ? 'add' : row?.id ?? `p${i}`">
          <button v-if="row === 'add'" type="button" class="me-db-card is-new" :style="{ height: `${cardH}px` }" data-new-card @click="newCard($event)">
            <Plus />{{ m.newRow }}
          </button>
          <button v-else-if="row" type="button" class="me-db-card" :data-row-id="row.id" :style="{ height: `${cardH}px` }" @click="db.openRow(row.id, $event)">
            <span v-if="coverProp" class="me-db-cover">
              <img v-if="coverUrl(row)" :src="coverUrl(row)!" alt="" loading="lazy" decoding="async" class="me-db-cover-img">
              <ImageIcon v-else class="me-db-cover-empty" />
            </span>
            <span class="me-db-card-title">{{ title ? String(cellValue(row, title) ?? '') || m.untitled : m.untitled }}</span>
            <template v-for="p in shown" :key="p!.id">
              <CellValue v-if="!isEmptyValue(cellValue(row, p!))" :prop="p!" :value="cellValue(row, p!)" compact />
            </template>
          </button>
          <span v-else class="me-db-card is-placeholder" :style="{ height: `${cardH}px` }"><span class="me-db-skeleton" /></span>
        </template>
      </div>
    </div>
  </div>
</template>
