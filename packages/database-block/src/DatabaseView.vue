<script setup lang="ts">
/**
 * A whole database (title, view tabs, toolbar, current view) for a `DatabaseSource`. Used by the `databaseView`
 * node, and usable on its own, e.g. on a full-page database route: `<DatabaseView :source :database-id full />`.
 */
import { Maximize2 } from '@lucide/vue'
import { baseTokensCss, type LocaleName } from '@toantranmei/editor'
import { computed, provide, ref, watch } from 'vue'
import Toolbar from './components/Toolbar.vue'
import ViewTabs from './components/ViewTabs.vue'
import { createContext, DB_KEY } from './context'
import { type DatabaseMessages, databaseMessages } from './messages'
import type { DatabaseBlockOptions, DatabaseSource } from './types'
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
  /** Full-page layout (taller scroll area, bigger title). */
  full?: boolean
  /** Theme scope for popovers teleported to <body>. Default: a plain `.me-scope`. */
  scope?: Record<string, unknown> | null
}>(), { viewId: null, locale: 'vi', messages: null, options: () => ({}), editable: true, full: false, scope: null })
const emit = defineEmits<{ 'update:viewId': [viewId: string], 'open': [databaseId: string, event?: MouseEvent] }>()

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
})
provide(DB_KEY, db)

function select(id: string) {
  localView.value = id
  emit('update:viewId', id)
}
const type = computed(() => db.view.value?.type ?? 'table')
const VIEWS = { table: TableView, board: BoardView, calendar: CalendarView, timeline: TimelineView, gallery: GalleryView, list: ListView, chart: ChartView, pivot: PivotView }
const viewRef = ref<{ newRow?: () => void } | null>(null)

// ── Title ──
const title = ref(props.source.meta.value?.title ?? '')
watch(() => props.source.meta.value?.title, t => (title.value = t ?? ''))
function saveTitle() {
  if (db.canEditStructure.value && title.value !== (props.source.meta.value?.title ?? '')) props.source.setMeta({ title: title.value })
}

function newRow() {
  if (type.value === 'table' && viewRef.value?.newRow) return viewRef.value.newRow()
  const id = props.source.createRow({})
  props.source.openRow(id)
}

defineExpose({ db, view: viewRef })
</script>

<template>
  <div class="me-db" :class="{ 'is-full': full, 'is-readonly': !db.canEditContent.value }" :data-view-type="type">
    <div class="me-db-header">
      <span v-if="source.meta.value?.icon" class="me-db-icon" aria-hidden="true">{{ source.meta.value.icon }}</span>
      <input
        v-model="title"
        class="me-db-title"
        :readonly="!db.canEditStructure.value"
        :placeholder="m.titlePlaceholder"
        :aria-label="m.titlePlaceholder"
        @blur="saveTitle"
        @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
      >
      <button v-if="options.open && !full" type="button" class="me-db-icon-button" :aria-label="m.openFullPage" :title="m.openFullPage" @click="emit('open', databaseId, $event); options.open?.(databaseId, $event)">
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
