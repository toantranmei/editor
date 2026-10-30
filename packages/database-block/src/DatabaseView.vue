<script setup lang="ts">
/**
 * A whole database (title, view tabs, toolbar, current view) for a `DatabaseSource`. Used by the `databaseView`
 * node, and usable on its own, e.g. on a full-page database route: `<DatabaseView :source :database-id full />`.
 */
import { Maximize2 } from '@lucide/vue'
import { baseTokensCss, type LocaleName } from '@toantranmei/editor'
import { computed, onBeforeUnmount, provide, ref, watch } from 'vue'
import Toolbar from './components/Toolbar.vue'
import ViewTabs from './components/ViewTabs.vue'
import { createContext, DB_KEY } from './context'
import { type DatabaseMessages, databaseMessages } from './messages'
import type { DatabaseBlockOptions, DatabaseSource, OpenMode } from './types'
import BoardView from './views/BoardView.vue'
import CalendarView from './views/CalendarView.vue'
import ChartView from './views/ChartView.vue'
import GalleryView from './views/GalleryView.vue'
import ListView from './views/ListView.vue'
import PivotView from './views/PivotView.vue'
import TableView from './views/TableView.vue'
import TimelineView from './views/TimelineView.vue'

const props = withDefaults(defineProps<{
  source: DatabaseSource
  databaseId: string
  /** Current view (`v-model:view-id`); the first view when missing or unknown. */
  viewId?: string | null
  locale?: LocaleName
  messages?: Partial<Record<LocaleName, Partial<DatabaseMessages>>> | null
  options?: Partial<DatabaseBlockOptions>
  editable?: boolean
  /** Full-page layout (taller scroll area, no block title by default: the host page header shows it). */
  full?: boolean
  /**
   * Show the database title above the tabs. Default: inline yes, `full` no (the page header already shows the
   * title). The title reads `source.meta.title` and writes `source.setMeta({ title })`.
   */
  showTitle?: boolean | null
  /** Theme scope for popovers teleported to <body>. Default: a plain `.me-scope`. */
  scope?: Record<string, unknown> | null
}>(), { viewId: null, locale: 'vi', messages: null, options: () => ({}), editable: true, full: false, showTitle: null, scope: null })
const emit = defineEmits<{
  'update:viewId': [viewId: string]
  'open': [databaseId: string, event?: MouseEvent]
  /** A row was opened (also sent to `options.openRow` / `source.openRow`). */
  'openRow': [rowId: string, mode: OpenMode, event?: MouseEvent | KeyboardEvent]
  /** The title was edited here (already written with `source.setMeta`). */
  'update:title': [title: string]
}>()

// Standalone use (outside <MeiEditor>): make sure the design tokens exist.
if (typeof document !== 'undefined' && !document.getElementById('mei-editor-tokens')) {
  const style = document.createElement('style')
  style.id = 'mei-editor-tokens'
  style.textContent = baseTokensCss()
  document.head.prepend(style)
}

const localView = ref<string | null>(props.viewId)
watch(() => props.viewId, v => (localView.value = v))
const search = ref('')
const m = computed(() => databaseMessages(props.locale, props.messages ?? props.options.messages))
const db = createContext({
  source: props.source,
  databaseId: props.databaseId,
  options: props.options,
  viewId: () => localView.value,
  m: () => m.value,
  locale: () => props.locale,
  editable: () => props.editable,
  scope: () => props.scope ?? { class: ['me-scope'] },
  search,
  onOpenRow: (rowId, mode, event) => emit('openRow', rowId, mode, event),
})
provide(DB_KEY, db)

function select(id: string) {
  localView.value = id
  emit('update:viewId', id)
}
const type = computed(() => db.view.value?.type ?? 'table')
const VIEWS = { table: TableView, board: BoardView, calendar: CalendarView, timeline: TimelineView, gallery: GalleryView, list: ListView, chart: ChartView, pivot: PivotView }
const viewRef = ref<{ newRow?: (seg?: number, top?: boolean) => void } | null>(null)

// ── Title: `source.meta.title`, saved while typing (debounced) and on blur / Enter ──
const titleShown = computed(() => props.showTitle ?? !props.full)
const metaTitle = computed(() => props.source.meta.value?.title ?? '')
const title = ref(metaTitle.value)
const titleFocused = ref(false)
// Remote / host renames show up unless the user is typing here.
watch(metaTitle, (t) => {
  if (!titleFocused.value) title.value = t
})
let titleTimer: ReturnType<typeof setTimeout> | undefined
function saveTitle() {
  clearTimeout(titleTimer)
  if (!db.canEditStructure.value || title.value === metaTitle.value) return
  props.source.setMeta({ title: title.value })
  emit('update:title', title.value)
}
function onTitleInput() {
  clearTimeout(titleTimer)
  titleTimer = setTimeout(saveTitle, 400)
}
function onTitleBlur() {
  titleFocused.value = false
  saveTitle()
}
onBeforeUnmount(saveTitle)

function newRow(where: 'top' | 'bottom' = 'bottom') {
  if (!db.canEditContent.value) return
  const view = viewRef.value
  if (type.value === 'table' && view?.newRow) return view.newRow(undefined, where === 'top')
  const id = props.source.createRow(where === 'top' ? { after: null } : {})
  db.openRow(id)
}

defineExpose({ db, view: viewRef })
</script>

<template>
  <div class="me-db" :class="{ 'is-full': full, 'is-readonly': !db.canEditContent.value, 'has-title': titleShown }" :data-view-type="type">
    <div v-if="titleShown" class="me-db-header">
      <span v-if="source.meta.value?.icon" class="me-db-icon" aria-hidden="true">{{ source.meta.value.icon }}</span>
      <input
        v-model="title"
        class="me-db-title"
        :readonly="!db.canEditStructure.value"
        :placeholder="m.titlePlaceholder"
        :aria-label="m.titlePlaceholder"
        data-db-title
        @focus="titleFocused = true"
        @input="onTitleInput"
        @blur="onTitleBlur"
        @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
        @keydown.esc="title = metaTitle; ($event.target as HTMLInputElement).blur()"
      >
      <button v-if="options.open && !full" type="button" class="me-db-icon-button me-db-header-action" :aria-label="m.openFullPage" :title="m.openFullPage" @click="emit('open', databaseId, $event); options.open?.(databaseId, $event)">
        <Maximize2 />
      </button>
    </div>
    <div class="me-db-topbar">
      <ViewTabs @select="select" />
      <Toolbar @new-row="newRow" />
    </div>
    <component :is="VIEWS[type]" v-if="db.view.value" ref="viewRef" :key="db.view.value.id" :full="full" />
    <div v-else class="me-db-empty">{{ m.loading }}</div>
  </div>
</template>
