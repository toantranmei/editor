<script setup lang="ts">
/**
 * Notion-style date picker for date mentions: typed date/time inputs, month calendar,
 * end date (range), date & time formats, reminders, clear.
 */
import { Check, ChevronLeft, ChevronRight, CircleQuestionMark } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import {
  DATE_FORMATS, type DateFormat, type DateValue, formatDate, formatTime, isoDate, parseDateInput, parseIsoDate,
  parseTimeInput, REMINDERS_DATE, REMINDERS_TIME, type TimeFormat,
} from '../date-utils'
import type { EditorMessages } from '../locale'

const props = defineProps<{
  value: DateValue
  locale: string
  messages: EditorMessages['datePicker']
  relative: { today: string, tomorrow: string, yesterday: string }
  helpUrl?: string | null
}>()
const emit = defineEmits<{ change: [value: DateValue], clear: [] }>()

const m = computed(() => props.messages)
const v = computed(() => props.value)
const update = (patch: Partial<DateValue>) => emit('change', { ...props.value, ...patch })

// --- Typed inputs -------------------------------------------------------------
/** Which input the next calendar click fills (Notion alternates start → end). */
const editing = ref<'start' | 'end'>('start')
const inputFmt = (id: string | null | undefined) => (id ? formatDate(id, props.locale, 'short') : '')
const draft = ref({ start: '', end: '', time: '', endTime: '' })
watch(() => props.value, (val) => {
  draft.value = {
    start: inputFmt(val.start),
    end: inputFmt(val.end),
    time: val.time ? formatTime(val.time, props.locale, val.timeFormat ?? '24') : '',
    endTime: val.endTime ? formatTime(val.endTime, props.locale, val.timeFormat ?? '24') : '',
  }
}, { immediate: true, deep: true })

function commitDate(which: 'start' | 'end') {
  const parsed = parseDateInput(draft.value[which], props.locale)
  if (!parsed) {
    draft.value[which] = inputFmt(which === 'start' ? v.value.start : v.value.end)
    return
  }
  if (which === 'start') update({ start: parsed })
  else update({ end: parsed })
  view.value = monthOf(parsed)
}
function commitTime(which: 'time' | 'endTime') {
  const parsed = parseTimeInput(draft.value[which])
  if (parsed) update({ [which]: parsed })
  else draft.value[which] = v.value[which] ? formatTime(v.value[which]!, props.locale, v.value.timeFormat ?? '24') : ''
}

// --- Calendar -----------------------------------------------------------------
const monthOf = (id: string) => {
  const d = parseIsoDate(id) ?? new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
const view = ref(monthOf(props.value.start))
const today = isoDate(new Date())
// "Oct 2026" / "Tháng 11 2026": month + year only, short enough for one line.
const monthLabel = computed(() => {
  const month = new Intl.DateTimeFormat(props.locale, { month: props.locale.startsWith('en') ? 'short' : 'long' }).format(view.value)
  return `${month.charAt(0).toUpperCase()}${month.slice(1)} ${view.value.getFullYear()}`
})
// Weeks start on Monday (like Notion's default).
const weekdays = computed(() => {
  const fmt = new Intl.DateTimeFormat(props.locale, { weekday: props.locale.startsWith('vi') ? 'narrow' : 'short' })
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2023, 0, 2 + i)).slice(0, 2))
})
const days = computed(() => {
  const first = view.value
  const offset = (first.getDay() + 6) % 7
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(first.getFullYear(), first.getMonth(), 1 - offset + i)
    return { id: isoDate(d), day: d.getDate(), inMonth: d.getMonth() === first.getMonth() }
  })
})
const inRange = (id: string) => !!v.value.end && id > v.value.start && id < v.value.end

function pick(id: string) {
  if (!v.value.end || editing.value === 'start') {
    // With a range, keep start ≤ end.
    if (v.value.end && id > v.value.end) update({ start: id, end: id })
    else update({ start: id })
    if (v.value.end) editing.value = 'end'
  }
  else {
    if (id < v.value.start) update({ start: id, end: v.value.start })
    else update({ end: id })
    editing.value = 'start'
  }
}
function goToday() {
  view.value = monthOf(today)
}

// --- Options ------------------------------------------------------------------
const submenu = ref<'format' | 'timeFormat' | 'remind' | null>(null)
const reminders = computed(() => (v.value.time ? REMINDERS_TIME : REMINDERS_DATE))
const formatLabel = (f: DateFormat) => m.value.formats[f]

function toggleEnd() {
  if (v.value.end) update({ end: null, endTime: null })
  else {
    update({ end: v.value.start, endTime: v.value.time ?? null })
    editing.value = 'end'
  }
}
function toggleTime() {
  // Date-only and timed reminders differ; reset an incompatible reminder.
  const remind = v.value.remind && v.value.remind !== 'none' ? null : v.value.remind
  if (v.value.time) update({ time: null, endTime: null, remind })
  else update({ time: '09:00', endTime: v.value.end ? '10:00' : null, remind })
}
function setFormat(format: DateFormat) {
  update({ format })
  submenu.value = null
}
function setTimeFormat(timeFormat: TimeFormat) {
  update({ timeFormat })
  submenu.value = null
}
function setRemind(remind: string) {
  update({ remind: remind === 'none' ? null : remind })
  submenu.value = null
}
</script>

<template>
  <div class="me-datepicker" @mouseleave="submenu = null">
    <!-- Start and end side by side; stacked once times are shown too (like Notion). -->
    <div class="me-datepicker-inputs" :class="{ 'is-split': !!value.end && !value.time }">
      <div class="me-datepicker-field" :class="{ 'is-active': editing === 'start' && !!value.end }">
        <input v-model="draft.start" class="me-datepicker-input" @focus="editing = 'start'" @keydown.enter.prevent="commitDate('start')" @blur="commitDate('start')">
        <input v-if="value.time" v-model="draft.time" class="me-datepicker-input me-datepicker-time" @keydown.enter.prevent="commitTime('time')" @blur="commitTime('time')">
      </div>
      <div v-if="value.end" class="me-datepicker-field" :class="{ 'is-active': editing === 'end' }">
        <input v-model="draft.end" class="me-datepicker-input" @focus="editing = 'end'" @keydown.enter.prevent="commitDate('end')" @blur="commitDate('end')">
        <input v-if="value.time" v-model="draft.endTime" class="me-datepicker-input me-datepicker-time" @keydown.enter.prevent="commitTime('endTime')" @blur="commitTime('endTime')">
      </div>
    </div>

    <div class="me-datepicker-head">
      <span class="me-datepicker-month">{{ monthLabel }}</span>
      <button type="button" class="me-datepicker-today" @click="goToday">
        {{ relative.today }}
      </button>
      <button type="button" class="me-tool-btn" :title="m.prevMonth" @click="view = new Date(view.getFullYear(), view.getMonth() - 1, 1)">
        <ChevronLeft />
      </button>
      <button type="button" class="me-tool-btn" :title="m.nextMonth" @click="view = new Date(view.getFullYear(), view.getMonth() + 1, 1)">
        <ChevronRight />
      </button>
    </div>
    <div class="me-datepicker-grid">
      <span v-for="(w, i) in weekdays" :key="i" class="me-datepicker-weekday">{{ w }}</span>
      <button
        v-for="d in days"
        :key="d.id"
        type="button"
        class="me-datepicker-day"
        :class="{
          'is-outside': !d.inMonth,
          'is-today': d.id === today,
          'is-selected': d.id === value.start || d.id === value.end,
          'is-in-range': inRange(d.id),
        }"
        @click="pick(d.id)"
      >
        {{ d.day }}
      </button>
    </div>

    <div class="me-datepicker-options">
      <button type="button" class="me-menu-item" @click="toggleEnd" @mouseenter="submenu = null">
        <span class="me-menu-title me-menu-text">{{ m.endDate }}</span>
        <span class="me-switch" :class="{ 'is-on': !!value.end }" role="switch" :aria-checked="!!value.end" />
      </button>
      <div class="me-submenu-anchor" @mouseenter="submenu = 'format'">
        <button type="button" class="me-menu-item" :class="{ 'is-active': submenu === 'format' }" @click="submenu = 'format'">
          <span class="me-menu-title me-menu-text">{{ m.dateFormat }}</span>
          <span class="me-menu-shortcut">{{ formatLabel(value.format ?? 'relative') }}</span>
          <ChevronRight class="me-menu-chevron" />
        </button>
        <div v-if="submenu === 'format'" class="me-popover me-submenu">
          <button v-for="f in DATE_FORMATS" :key="f" type="button" class="me-menu-item" @click="setFormat(f)">
            <span class="me-menu-title me-menu-text">{{ formatLabel(f) }}</span>
            <Check v-if="(value.format ?? 'relative') === f" class="me-menu-check" />
          </button>
        </div>
      </div>
      <button type="button" class="me-menu-item" @click="toggleTime" @mouseenter="submenu = null">
        <span class="me-menu-title me-menu-text">{{ m.includeTime }}</span>
        <span class="me-switch" :class="{ 'is-on': !!value.time }" role="switch" :aria-checked="!!value.time" />
      </button>
      <div v-if="value.time" class="me-submenu-anchor" @mouseenter="submenu = 'timeFormat'">
        <button type="button" class="me-menu-item" :class="{ 'is-active': submenu === 'timeFormat' }" @click="submenu = 'timeFormat'">
          <span class="me-menu-title me-menu-text">{{ m.timeFormat }}</span>
          <span class="me-menu-shortcut">{{ (value.timeFormat ?? '24') === '12' ? m.hour12 : m.hour24 }}</span>
          <ChevronRight class="me-menu-chevron" />
        </button>
        <div v-if="submenu === 'timeFormat'" class="me-popover me-submenu">
          <button v-for="t in (['12', '24'] as const)" :key="t" type="button" class="me-menu-item" @click="setTimeFormat(t)">
            <span class="me-menu-title me-menu-text">{{ t === '12' ? m.hour12 : m.hour24 }}</span>
            <Check v-if="(value.timeFormat ?? '24') === t" class="me-menu-check" />
          </button>
        </div>
      </div>
      <div class="me-submenu-anchor" @mouseenter="submenu = 'remind'">
        <button type="button" class="me-menu-item" :class="{ 'is-active': submenu === 'remind' }" @click="submenu = 'remind'">
          <span class="me-menu-title me-menu-text">{{ m.remind }}</span>
          <span class="me-menu-shortcut">{{ m.reminders[value.remind ?? 'none'] ?? m.reminders.none }}</span>
          <ChevronRight class="me-menu-chevron" />
        </button>
        <div v-if="submenu === 'remind'" class="me-popover me-submenu">
          <button v-for="r in reminders" :key="r" type="button" class="me-menu-item" @click="setRemind(r)">
            <span class="me-menu-title me-menu-text">{{ m.reminders[r] }}</span>
            <Check v-if="(value.remind ?? 'none') === r" class="me-menu-check" />
          </button>
        </div>
      </div>
    </div>

    <div class="me-datepicker-options">
      <button type="button" class="me-menu-item" @click="emit('clear')" @mouseenter="submenu = null">
        <span class="me-menu-title me-menu-text">{{ m.clear }}</span>
      </button>
    </div>
    <a v-if="helpUrl" class="me-menu-item me-datepicker-help" :href="helpUrl" target="_blank" rel="noopener noreferrer">
      <CircleQuestionMark class="me-menu-chevron" />
      <span class="me-menu-title me-menu-text">{{ m.learnReminders }}</span>
    </a>
  </div>
</template>
