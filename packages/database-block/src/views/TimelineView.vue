<script setup lang="ts">
/**
 * Timeline view: a bar per row from `start_prop` to `end_prop` (or the start property's own end date), on a day /
 * week / month scale. Drag a bar to move it, drag its edges to resize it; rows are virtualized.
 */
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { componentTokens } from '@toantranmei/editor'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useDb } from '../context'
import { rectWithFallback } from '../virtual'
import type { DateValue, Row } from '../types'
import { cellValue, cssPx } from '../util'
import { dayOf, isoDay, parseIso } from '../values'
import { loadRange, shiftDate } from './range'

defineProps<{ full?: boolean }>()
const db = useDb()
const m = computed(() => db.m.value)
const T = componentTokens.database
const c = computed(() => db.view.value?.config ?? {})
const startProp = computed(() => db.props.value.find(p => p.id === c.value.start_prop))
const endProp = computed(() => db.props.value.find(p => p.id === c.value.end_prop))
const title = computed(() => db.props.value.find(p => p.type === 'title'))
const scale = computed(() => c.value.scale ?? 'day')
const scroller = ref<HTMLElement | null>(null)
const px = ref({ day: Number.parseFloat(T.timelineDay), week: Number.parseFloat(T.timelineWeek), month: Number.parseFloat(T.timelineMonth), row: Number.parseFloat(T.timelineRowHeight), label: Number.parseFloat(T.timelineLabelWidth) })
watch(scroller, (el) => {
  if (!el) return
  px.value = {
    day: cssPx(el, '--me-database-timeline-day', T.timelineDay),
    week: cssPx(el, '--me-database-timeline-week', T.timelineWeek),
    month: cssPx(el, '--me-database-timeline-month', T.timelineMonth),
    row: cssPx(el, '--me-database-timeline-row-height', T.timelineRowHeight),
    label: cssPx(el, '--me-database-timeline-label-width', T.timelineLabelWidth),
  }
})
const dayW = computed(() => px.value[scale.value])
const span = computed(() => (scale.value === 'day' ? 60 : scale.value === 'week' ? 26 * 7 : 730))
const origin = ref(new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() - 14))
const firstDay = computed(() => isoDay(origin.value))
const lastDay = computed(() => isoDay(new Date(origin.value.getFullYear(), origin.value.getMonth(), origin.value.getDate() + span.value - 1)))
const dayIndex = (s: string) => Math.round((parseIso(dayOf(s))!.getTime() - origin.value.getTime()) / 86400000)
const width = computed(() => span.value * dayW.value)
const ticks = computed(() => {
  const out: Array<{ left: number, label: string, major: boolean }> = []
  const loc = db.locale.value === 'vi' ? 'vi-VN' : db.locale.value === 'zh' ? 'zh-CN' : 'en-US'
  for (let i = 0; i < span.value; i++) {
    const d = new Date(origin.value.getFullYear(), origin.value.getMonth(), origin.value.getDate() + i)
    const monthStart = d.getDate() === 1
    if (scale.value === 'day') out.push({ left: i * dayW.value, label: String(d.getDate()), major: monthStart })
    else if (scale.value === 'week' && d.getDay() === 1) out.push({ left: i * dayW.value, label: `${d.getDate()}/${d.getMonth() + 1}`, major: monthStart })
    else if (scale.value === 'month' && monthStart) out.push({ left: i * dayW.value, label: new Intl.DateTimeFormat(loc, { month: 'short', year: '2-digit' }).format(d), major: d.getMonth() === 0 })
  }
  return out
})
const todayLeft = computed(() => dayIndex(isoDay(new Date())) * dayW.value)
function shift(dir: -1 | 1) {
  const n = Math.round(span.value / 2) * dir
  origin.value = new Date(origin.value.getFullYear(), origin.value.getMonth(), origin.value.getDate() + n)
}
function goToday() {
  const t = new Date()
  origin.value = new Date(t.getFullYear(), t.getMonth(), t.getDate() - Math.round(span.value / 4))
}

const rows = shallowRef<Row[]>([])
let seq = 0
async function load() {
  const view = db.view.value
  const p = startProp.value
  if (!view || !p) return
  const mine = ++seq
  const list = await loadRange(db, view.id, p, firstDay.value, lastDay.value).catch((e) => {
    db.report(e)
    return []
  })
  if (mine === seq) rows.value = list
}
watch([() => db.view.value?.id, () => JSON.stringify(c.value), firstDay, () => db.source.version.value, () => db.query.value.search], load, { immediate: true })
onBeforeUnmount(() => seq++)

/** Start / end days of a row's bar. */
function barOf(r: Row): { start: string, end: string } | null {
  const sp = startProp.value
  if (!sp) return null
  const sv = cellValue(r, sp) as DateValue | undefined
  if (!sv?.start) return null
  const ev = endProp.value ? cellValue(r, endProp.value) as DateValue | undefined : undefined
  const start = dayOf(sv.start)
  const end = ev?.start ? dayOf(ev.start) : sv.end ? dayOf(sv.end) : start
  return { start, end: end < start ? start : end }
}

const virtualizer = useVirtualizer(computed(() => ({
  count: rows.value.length,
  getScrollElement: () => scroller.value,
  estimateSize: () => px.value.row,
  overscan: 8,
  scrollMargin: px.value.row,
  observeElementRect: rectWithFallback(1000, 480),
  initialRect: { width: 1000, height: 480 },
})))

// ── Drag / resize ──
const drag = ref<{ id: string, mode: 'move' | 'start' | 'end', x: number, dx: number } | null>(null)
const deltaDays = computed(() => (drag.value ? Math.round(drag.value.dx / dayW.value) : 0))
const canEdit = computed(() => db.canEditContent.value && startProp.value?.type === 'date' && (!endProp.value || endProp.value.type === 'date'))
function onPointerDown(e: PointerEvent, r: Row, mode: 'move' | 'start' | 'end') {
  if (!canEdit.value || e.button !== 0) return
  e.preventDefault()
  e.stopPropagation()
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  drag.value = { id: r.id, mode, x: e.clientX, dx: 0 }
}
function onPointerMove(e: PointerEvent) {
  if (drag.value) drag.value = { ...drag.value, dx: e.clientX - drag.value.x }
}
function onPointerUp(r: Row) {
  const d = drag.value
  drag.value = null
  if (!d || d.id !== r.id) return
  const n = Math.round(d.dx / dayW.value)
  if (!n) {
    if (Math.abs(d.dx) < 3) db.source.openRow(r.id)
    return
  }
  const sp = startProp.value!
  const ds = d.mode === 'end' ? 0 : n
  const de = d.mode === 'start' ? 0 : n
  const sv = cellValue(r, sp) as DateValue
  if (endProp.value) {
    const ev = cellValue(r, endProp.value) as DateValue | undefined
    if (ds) db.source.setCell(r.id, sp.id, shiftDate({ start: sv.start }, ds, ds))
    if (de) db.source.setCell(r.id, endProp.value.id, shiftDate({ start: ev?.start ?? sv.start }, de, de))
  }
  else {
    db.source.setCell(r.id, sp.id, shiftDate(sv, ds, de))
  }
}
function barStyle(r: Row) {
  const b = barOf(r)
  if (!b) return null
  let s = dayIndex(b.start)
  let e = dayIndex(b.end)
  if (drag.value?.id === r.id) {
    if (drag.value.mode !== 'end') s += deltaDays.value
    if (drag.value.mode !== 'start') e += deltaDays.value
    if (e < s) e = s
  }
  return { left: `${s * dayW.value}px`, width: `${(e - s + 1) * dayW.value}px` }
}
const titleOf = (r: Row) => (title.value ? String(cellValue(r, title.value) ?? '') : '') || m.value.untitled
</script>

<template>
  <div class="me-db-timeline" :class="{ 'is-full': full }">
    <div v-if="!startProp" class="me-db-empty">{{ m.noDateProperty }}</div>
    <template v-else>
      <div class="me-db-calendar-head">
        <button type="button" class="me-db-text-button" @click="goToday">{{ m.today }}</button>
        <button type="button" class="me-db-icon-button" :aria-label="m.previous" @click="shift(-1)"><ChevronLeft /></button>
        <button type="button" class="me-db-icon-button" :aria-label="m.next" @click="shift(1)"><ChevronRight /></button>
        <span class="me-db-timeline-scale">
          <button v-for="s in (['day', 'week', 'month'] as const)" :key="s" type="button" class="me-db-tool" :class="{ 'is-on': scale === s }" :disabled="!db.canEditStructure.value" @click="db.updateView({ scale: s })">{{ m.scales[s] }}</button>
        </span>
      </div>
      <div ref="scroller" class="me-db-scroll me-db-timeline-scroll" :style="{ '--me-db-timeline-width': `${width + px.label}px` }">
        <div class="me-db-timeline-inner" :style="{ width: `${width + px.label}px`, height: `${virtualizer.getTotalSize() + px.row}px` }">
          <div class="me-db-timeline-header" :style="{ height: `${px.row}px` }">
            <div class="me-db-timeline-label is-head" :style="{ width: `${px.label}px` }" />
            <div class="me-db-timeline-ticks" :style="{ left: `${px.label}px`, width: `${width}px` }">
              <span v-for="t in ticks" :key="t.left" class="me-db-timeline-tick" :class="{ 'is-major': t.major }" :style="{ left: `${t.left}px` }">{{ t.label }}</span>
            </div>
          </div>
          <div class="me-db-timeline-today" :style="{ left: `${px.label + todayLeft}px` }" />
          <div
            v-for="v in virtualizer.getVirtualItems()"
            :key="v.index"
            class="me-db-timeline-row"
            :style="{ transform: `translateY(${v.start}px)`, height: `${px.row}px` }"
          >
            <button type="button" class="me-db-timeline-label" :style="{ width: `${px.label}px` }" @click="db.source.openRow(rows[v.index]!.id)">{{ titleOf(rows[v.index]!) }}</button>
            <div
              v-if="barStyle(rows[v.index]!)"
              class="me-db-bar"
              :class="{ 'is-dragging': drag?.id === rows[v.index]!.id }"
              :data-row-id="rows[v.index]!.id"
              :style="{ ...barStyle(rows[v.index]!), marginLeft: `${px.label}px` }"
              @pointerdown="onPointerDown($event, rows[v.index]!, 'move')"
              @pointermove="onPointerMove"
              @pointerup="onPointerUp(rows[v.index]!)"
            >
              <span class="me-db-bar-handle is-start" @pointerdown="onPointerDown($event, rows[v.index]!, 'start')" />
              <span class="me-db-bar-title">{{ titleOf(rows[v.index]!) }}</span>
              <span class="me-db-bar-handle is-end" @pointerdown="onPointerDown($event, rows[v.index]!, 'end')" />
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
