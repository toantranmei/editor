<script setup lang="ts">
/**
 * Date cell editor: month calendar, optional end date (range) and time, typed input.
 * Emits contract values: `{ start: 'YYYY-MM-DD' | RFC 3339, end?: … }`.
 */
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { useDb } from '../context'
import type { DateValue } from '../types'
import { dayOf, formatDateString, hasTime, isoDay, parseDateText, parseIso } from '../values'

const props = withDefaults(defineProps<{ value: DateValue | null, includeTime?: boolean, allowRange?: boolean }>(), { includeTime: false, allowRange: true })
const emit = defineEmits<{ change: [value: DateValue | null] }>()

const db = useDb()
const m = computed(() => db.m.value)
const locale = computed(() => db.locale.value)

const range = ref(!!props.value?.end)
const withTime = ref(props.includeTime || hasTime(props.value?.start))
const editing = ref<'start' | 'end'>('start')
const startDay = computed(() => (props.value?.start ? dayOf(props.value.start) : null))
const endDay = computed(() => (props.value?.end ? dayOf(props.value.end) : null))
const timeOf = (s?: string) => {
  if (!s || !hasTime(s)) return ''
  const d = parseIso(s)!
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const startTime = ref(timeOf(props.value?.start) || '09:00')
const endTime = ref(timeOf(props.value?.end) || '10:00')

const monthOf = (day: string | null) => {
  const d = (day && parseIso(day)) || new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
const view = ref(monthOf(startDay.value))
const today = isoDay(new Date())
const intl = computed(() => (locale.value === 'vi' ? 'vi-VN' : locale.value === 'zh' ? 'zh-CN' : 'en-US'))
const monthLabel = computed(() => new Intl.DateTimeFormat(intl.value, { year: 'numeric', month: 'long' }).format(view.value))
const weekdays = computed(() => {
  const f = new Intl.DateTimeFormat(intl.value, { weekday: 'narrow' })
  return Array.from({ length: 7 }, (_, i) => f.format(new Date(2023, 0, 2 + i)))
})
const days = computed(() => {
  const first = view.value
  const offset = (first.getDay() + 6) % 7
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(first.getFullYear(), first.getMonth(), 1 - offset + i)
    return { id: isoDay(d), label: d.getDate(), outside: d.getMonth() !== first.getMonth() }
  })
})
const shift = (n: number) => (view.value = new Date(view.value.getFullYear(), view.value.getMonth() + n, 1))

/** A day + optional HH:mm → contract bound (date-time in UTC RFC 3339 when there's a time). */
function bound(day: string, time: string): string {
  if (!withTime.value || !time) return day
  const [h, min] = time.split(':').map(Number)
  const d = parseIso(day)!
  d.setHours(h ?? 0, min ?? 0, 0, 0)
  return d.toISOString()
}

function emitValue(start: string | null, end: string | null) {
  if (!start) return emit('change', null)
  const value: DateValue = { start: bound(start, startTime.value) }
  if (range.value && end) {
    const [a, b] = start <= end ? [start, end] : [end, start]
    value.start = bound(a, startTime.value)
    value.end = bound(b, endTime.value)
  }
  emit('change', value)
}

function pick(day: string) {
  if (range.value && editing.value === 'end') {
    emitValue(startDay.value ?? day, day)
    editing.value = 'start'
  }
  else {
    emitValue(day, range.value ? endDay.value ?? day : null)
    if (range.value) editing.value = 'end'
  }
}

const inRange = (day: string) => !!(startDay.value && endDay.value && day > startDay.value && day < endDay.value)

// Typed input ("30/10/2026", "2026-10-30 → 2026-11-02").
const typed = ref('')
watch(() => props.value, (v) => {
  typed.value = v ? formatDateString(v.start, 'dmy', locale.value) + (v.end ? ` → ${formatDateString(v.end, 'dmy', locale.value)}` : '') : ''
}, { immediate: true })
function commitTyped() {
  const v = parseDateText(typed.value, locale.value)
  if (v) {
    range.value = !!v.end
    emit('change', v)
    view.value = monthOf(dayOf(v.start))
  }
}

watch(range, (on) => {
  if (!startDay.value) return
  emitValue(startDay.value, on ? endDay.value ?? startDay.value : null)
})
watch(withTime, () => startDay.value && emitValue(startDay.value, endDay.value))
</script>

<template>
  <div class="me-db-datepicker">
    <input v-model="typed" class="me-input" :aria-label="m.value" @keydown.enter.prevent="commitTyped" @blur="commitTyped">
    <div class="me-db-datepicker-head">
      <span class="me-db-datepicker-month">{{ monthLabel }}</span>
      <button type="button" class="me-db-text-button" @click="view = monthOf(today)">{{ m.today }}</button>
      <button type="button" class="me-db-icon-button" :aria-label="m.previous" @click="shift(-1)"><ChevronLeft /></button>
      <button type="button" class="me-db-icon-button" :aria-label="m.next" @click="shift(1)"><ChevronRight /></button>
    </div>
    <div class="me-db-datepicker-grid" role="grid">
      <span v-for="(w, i) in weekdays" :key="i" class="me-db-datepicker-weekday">{{ w }}</span>
      <button
        v-for="d in days"
        :key="d.id"
        type="button"
        class="me-db-datepicker-day"
        :class="{
          'is-outside': d.outside,
          'is-today': d.id === today,
          'is-selected': d.id === startDay || d.id === endDay,
          'is-range': inRange(d.id),
        }"
        :data-day="d.id"
        @click="pick(d.id)"
      >
        {{ d.label }}
      </button>
    </div>
    <label v-if="allowRange" class="me-db-toggle-row">
      <span>{{ m.endDate }}</span>
      <input v-model="range" type="checkbox" class="me-db-switch">
    </label>
    <label class="me-db-toggle-row">
      <span>{{ m.includeTime }}</span>
      <input v-model="withTime" type="checkbox" class="me-db-switch">
    </label>
    <div v-if="withTime" class="me-db-datepicker-times">
      <input v-model="startTime" type="time" class="me-input" :aria-label="m.time" @change="startDay && emitValue(startDay, endDay)">
      <input v-if="range" v-model="endTime" type="time" class="me-input" :aria-label="m.endDate" @change="startDay && emitValue(startDay, endDay)">
    </div>
    <button type="button" class="me-menu-item" @click="emit('change', null)">{{ m.clear }}</button>
  </div>
</template>
