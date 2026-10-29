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
const intl = computed(() => (db.locale.value === 'vi' ? 'vi-VN' : db.locale.value === 'zh' ? 'zh-CN' : 'en-US'))
const label = computed(() => new Intl.DateTimeFormat(intl.value, { year: 'numeric', month: 'long' }).format(month.value))
const weekdays = computed(() => {
  const f = new Intl.DateTimeFormat(intl.value, { weekday: 'short' })
  return Array.from({ length: 7 }, (_, i) => f.format(new Date(2023, 0, 2 + i)))
})
const days = computed(() => {
  const first = month.value
  const offset = (first.getDay() + 6) % 7
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(first.getFullYear(), first.getMonth(), 1 - offset + i)
    return { id: isoDay(d), label: d.getDate(), outside: d.getMonth() !== first.getMonth() }
  })
})
const today = isoDay(new Date())

const rows = shallowRef<Row[]>([])
let seq = 0
async function load() {
  const view = db.view.value
  const p = dateProp.value
  if (!view || !p) return
  const mine = ++seq
  const list = await loadRange(db, view.id, p, days.value[0]!.id, days.value[41]!.id).catch((e) => {
    db.report(e)
    return []
  })
  if (mine === seq) rows.value = list
}
watch([() => db.view.value?.id, () => JSON.stringify(db.view.value?.config), month, () => db.source.version.value, () => db.query.value.search], load, { immediate: true })
onBeforeUnmount(() => seq++)

/** Rows per day (a range shows on every day it covers). */
const byDay = computed(() => {
  const map = new Map<string, Row[]>()
  const p = dateProp.value
  if (!p) return map
  const first = days.value[0]!.id
  const last = days.value[41]!.id
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
function addOn(day: string) {
  const p = dateProp.value
  if (!p || p.type !== 'date') return
  const id = db.source.createRow({ values: { [p.id]: { start: day } } })
  db.source.openRow(id)
}
</script>

<template>
  <div class="me-db-calendar" :class="{ 'is-full': full }">
    <div v-if="!dateProp" class="me-db-empty">{{ m.noDateProperty }}</div>
    <template v-else>
      <div class="me-db-calendar-head">
        <span class="me-db-calendar-month">{{ label }}</span>
        <button type="button" class="me-db-text-button" @click="month = new Date(new Date().getFullYear(), new Date().getMonth(), 1)">{{ m.today }}</button>
        <button type="button" class="me-db-icon-button" :aria-label="m.previous" @click="month = new Date(month.getFullYear(), month.getMonth() - 1, 1)"><ChevronLeft /></button>
        <button type="button" class="me-db-icon-button" :aria-label="m.next" @click="month = new Date(month.getFullYear(), month.getMonth() + 1, 1)"><ChevronRight /></button>
      </div>
      <div class="me-db-calendar-grid" role="grid">
        <span v-for="(w, i) in weekdays" :key="i" class="me-db-calendar-weekday" role="columnheader">{{ w }}</span>
        <div
          v-for="d in days"
          :key="d.id"
          class="me-db-calendar-day"
          :class="{ 'is-outside': d.outside, 'is-today': d.id === today, 'is-over': overDay === d.id }"
          role="gridcell"
          :data-day="d.id"
          @dragover.prevent="dragging && (overDay = d.id)"
          @drop.prevent="onDrop(d.id)"
        >
          <span class="me-db-calendar-date">{{ d.label }}</span>
          <button v-if="db.canEditContent.value && dateProp.type === 'date'" type="button" class="me-db-icon-button me-db-calendar-add" :aria-label="m.newRow" @click="addOn(d.id)"><Plus /></button>
          <button
            v-for="r in (byDay.get(d.id) ?? []).slice(0, MAX)"
            :key="r.id"
            type="button"
            class="me-db-event"
            :draggable="canMove"
            :data-row-id="r.id"
            @dragstart="dragging = { id: r.id, from: d.id }"
            @dragend="dragging = null; overDay = null"
            @click="db.source.openRow(r.id)"
          >
            {{ titleOf(r) }}
          </button>
          <span v-if="(byDay.get(d.id)?.length ?? 0) > MAX" class="me-db-calendar-more">+{{ byDay.get(d.id)!.length - MAX }} {{ m.more }}</span>
        </div>
      </div>
    </template>
  </div>
</template>
