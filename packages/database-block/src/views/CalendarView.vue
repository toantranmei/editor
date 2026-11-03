<script setup lang="ts">
/**
 * Calendar view: month grid of the rows whose `date_prop` falls in the month (`rowsInRange` when the source has it,
 * else the first `rangeLimit` rows of the view). Drag a card to another day to move its date (keeping duration
 * and time), "+" on a day creates a row on that date.
 */
import { ChevronLeft, ChevronRight, Plus } from '@lucide/vue'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useDb } from '../context'
import type { DateValue, Row } from '../types'
import { cellValue } from '../util'
import { dayOf, isoDay, parseIso } from '../values'
import { loadRange, shiftDate } from './range'

defineProps<{ full?: boolean }>()
const db = useDb()
const m = computed(() => db.m.value)
const dateProp = computed(() => db.props.value.find(p => p.id === db.view.value?.config.date_prop))
const title = computed(() => db.props.value.find(p => p.type === 'title'))
const month = ref(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
/** "Show calendar as": a month grid (default) or one week; in week mode `weekStart` is the Monday shown. */
const asWeek = computed(() => db.view.value?.config.calendar_as === 'week')
const mondayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7))
const weekStart = ref(mondayOf(new Date()))
function goToday() {
  month.value = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  weekStart.value = mondayOf(new Date())
}
function step(dir: -1 | 1) {
  if (asWeek.value) weekStart.value = new Date(weekStart.value.getFullYear(), weekStart.value.getMonth(), weekStart.value.getDate() + 7 * dir)
  else month.value = new Date(month.value.getFullYear(), month.value.getMonth() + dir, 1)
}
const intl = computed(() => (db.locale.value === 'vi' ? 'vi-VN' : db.locale.value === 'zh' ? 'zh-CN' : 'en-US'))
const label = computed(() => new Intl.DateTimeFormat(intl.value, { year: 'numeric', month: 'long' }).format(asWeek.value ? weekStart.value : month.value))
const weekdays = computed(() => {
  const f = new Intl.DateTimeFormat(intl.value, { weekday: 'short' })
  return Array.from({ length: 7 }, (_, i) => f.format(new Date(2023, 0, 2 + i)))
})
const weekends = computed(() => db.view.value?.config.show_weekends !== false)
const shownWeekdays = computed(() => (weekends.value ? weekdays.value : weekdays.value.slice(0, 5)))
/** The 6-week grid (42 days), or the 7 days of the week view: loading and `byDay` use its first / last day. */
const days = computed(() => {
  if (asWeek.value) {
    const w = weekStart.value
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(w.getFullYear(), w.getMonth(), w.getDate() + i)
      return { id: isoDay(d), label: d.getDate(), outside: false }
    })
  }
  const first = month.value
  const offset = (first.getDay() + 6) % 7
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(first.getFullYear(), first.getMonth(), 1 - offset + i)
    return { id: isoDay(d), label: d.getDate(), outside: d.getMonth() !== first.getMonth() }
  })
})
const today = isoDay(new Date())
/** Days drawn: without weekends, Monday to Friday of each week. */
const shownDays = computed(() => (weekends.value ? days.value : days.value.filter((_, i) => i % 7 < 5)))

const rows = shallowRef<Row[]>([])
let seq = 0
async function load() {
  const view = db.view.value
  const p = dateProp.value
  if (!view || !p) return
  const mine = ++seq
  const list = await loadRange(db, view.id, p, days.value[0]!.id, days.value[days.value.length - 1]!.id).catch((e) => {
    db.report(e)
    return []
  })
  if (mine === seq) rows.value = list
}
watch([() => db.view.value?.id, () => JSON.stringify(db.view.value?.config), month, weekStart, () => db.source.version.value, () => db.query.value.search], load, { immediate: true })
onBeforeUnmount(() => seq++)

/** Rows per day (a range shows on every day it covers). */
const byDay = computed(() => {
  const map = new Map<string, Row[]>()
  const p = dateProp.value
  if (!p) return map
  const first = days.value[0]!.id
  const last = days.value[days.value.length - 1]!.id
  for (const r of rows.value) {
    const v = cellValue(r, p) as DateValue | string | number | undefined
    const start = typeof v === 'object' && v ? dayOf(v.start) : typeof v === 'number' ? isoDay(new Date(v)) : typeof v === 'string' ? dayOf(v) : null
    if (!start) continue
    const end = typeof v === 'object' && v?.end ? dayOf(v.end) : start
    for (let d = parseIso(start < first ? first : start)!; isoDay(d) <= (end > last ? last : end); d.setDate(d.getDate() + 1)) {
      const id = isoDay(d)
      const list = map.get(id) ?? []
      list.push(r)
      map.set(id, list)
    }
  }
  return map
})
const MAX = 3
/** Events shown per day before "+N more" (a week has room for all of them). */
const max = computed(() => (asWeek.value ? Number.POSITIVE_INFINITY : MAX))
const titleOf = (r: Row) => (title.value ? String(cellValue(r, title.value) ?? '') : '') || m.value.untitled
const canMove = computed(() => db.canEditContent.value && dateProp.value?.type === 'date')

const dragging = ref<{ id: string, from: string } | null>(null)
const overDay = ref<string | null>(null)
function onDrop(day: string) {
  const d = dragging.value
  dragging.value = null
  overDay.value = null
  const p = dateProp.value
  if (!d || !p || d.from === day) return
  const row = rows.value.find(r => r.id === d.id)
  const v = row ? cellValue(row, p) as DateValue | undefined : undefined
  if (!v?.start) return
  const deltaDays = Math.round((parseIso(day)!.getTime() - parseIso(d.from)!.getTime()) / 86400000)
  db.source.setCell(d.id, p.id, shiftDate(v, deltaDays, deltaDays))
}
function addOn(day: string, e?: MouseEvent) {
  const p = dateProp.value
  if (!p || p.type !== 'date') return
  const id = db.createRow({ values: { [p.id]: { start: day } } })
  db.openRow(id, e)
}
</script>

<template>
  <div class="me-db-calendar" :class="{ 'is-full': full }">
    <div v-if="!dateProp" class="me-db-empty">{{ m.noDateProperty }}</div>
    <template v-else>
      <div class="me-db-calendar-head">
        <span class="me-db-calendar-month">{{ label }}</span>
        <span class="me-db-option-sort" role="radiogroup" :aria-label="m.calendarAs">
          <button v-for="k in (['month', 'week'] as const)" :key="k" type="button" class="me-db-seg" role="radio" :aria-checked="(asWeek ? 'week' : 'month') === k" :class="{ 'is-on': (asWeek ? 'week' : 'month') === k }" :data-calendar-as="k" :disabled="!db.canEditStructure.value" @click="db.updateView({ calendar_as: k === 'week' ? 'week' : undefined })">{{ m.calendarModes[k] }}</button>
        </span>
        <button type="button" class="me-db-text-button" @click="goToday">{{ m.today }}</button>
        <button type="button" class="me-db-icon-button" :aria-label="m.previous" @click="step(-1)"><ChevronLeft /></button>
        <button type="button" class="me-db-icon-button" :aria-label="m.next" @click="step(1)"><ChevronRight /></button>
      </div>
      <div class="me-db-calendar-grid" :class="{ 'is-weekdays': !weekends, 'is-week': asWeek }" role="grid">
        <span v-for="(w, i) in shownWeekdays" :key="i" class="me-db-calendar-weekday" role="columnheader">{{ w }}</span>
        <div
          v-for="d in shownDays"
          :key="d.id"
          class="me-db-calendar-day"
          :class="{ 'is-outside': d.outside, 'is-today': d.id === today, 'is-over': overDay === d.id }"
          role="gridcell"
          :data-day="d.id"
          @dragover.prevent="dragging && (overDay = d.id)"
          @drop.prevent="onDrop(d.id)"
        >
          <span class="me-db-calendar-date">{{ d.label }}</span>
          <button v-if="db.canEditContent.value && dateProp.type === 'date'" type="button" class="me-db-icon-button me-db-calendar-add" :aria-label="m.newRow" @click="addOn(d.id, $event)"><Plus /></button>
          <button
            v-for="r in (byDay.get(d.id) ?? []).slice(0, max)"
            :key="r.id"
            type="button"
            class="me-db-event"
            :draggable="canMove"
            :data-row-id="r.id"
            @dragstart="dragging = { id: r.id, from: d.id }"
            @dragend="dragging = null; overDay = null"
            @click="db.openRow(r.id, $event)"
          >
            {{ titleOf(r) }}
          </button>
          <span v-if="(byDay.get(d.id)?.length ?? 0) > max" class="me-db-calendar-more">+{{ byDay.get(d.id)!.length - MAX }} {{ m.more }}</span>
        </div>
      </div>
    </template>
  </div>
</template>
