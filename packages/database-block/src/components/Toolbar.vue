<script setup lang="ts">
/**
 * Right side of the tab bar, compact like Notion: filter, sort, group, properties, search and view options as icon
 * buttons (a label shows next to an active filter / sort while there is room), then the "New" split button (main
 * part adds a row, the chevron opens "add to top / bottom" and "Open pages in").
 */
import { ArrowDownToLine, ArrowUpDown, ArrowUpToLine, Check, ChevronDown, Ellipsis, Group, ListFilter, Search, SlidersHorizontal } from '@lucide/vue'
import { computed, ref, shallowRef, watch } from 'vue'
import { useDb } from '../context'
import { countConditions } from '../filters'
import type { OpenMode } from '../types'
import DbPopover from './DbPopover.vue'
import FilterBuilder from './FilterBuilder.vue'
import OpenModeIcon from './OpenModeIcon.vue'
import SortBuilder from './SortBuilder.vue'
import ViewSettings from './ViewSettings.vue'

const emit = defineEmits<{ newRow: [where?: 'top' | 'bottom'] }>()
const db = useDb()
const m = computed(() => db.m.value)
type Panel = 'filter' | 'sort' | 'group' | 'properties' | 'settings' | 'new'
const open = shallowRef<{ panel: Panel, anchor: HTMLElement } | null>(null)
const buttons = ref<Record<string, HTMLElement | null>>({})
const filters = computed(() => countConditions(db.view.value?.config.filter))
const sorts = computed(() => db.view.value?.config.sorts?.length ?? 0)
const type = computed(() => db.view.value?.type)
const hasGroup = computed(() => ['table', 'list', 'board'].includes(type.value ?? ''))
const hasProps = computed(() => !['chart', 'pivot'].includes(type.value ?? ''))
const canAdd = computed(() => db.canEditContent.value && !['chart', 'pivot'].includes(type.value ?? ''))
const ordered = computed(() => ['table', 'list'].includes(type.value ?? '') && !sorts.value)
const searching = ref(!!db.search.value)
const searchInput = ref<HTMLInputElement | null>(null)
const MODES: OpenMode[] = ['side_peek', 'center_peek', 'full_page']

function toggle(panel: Panel, e: MouseEvent) {
  open.value = open.value?.panel === panel ? null : { panel, anchor: e.currentTarget as HTMLElement }
}
// A header menu's "Filter" opens the builder here.
watch(() => db.ui.openFilter, () => {
  const el = buttons.value.filter
  if (el) open.value = { panel: 'filter', anchor: el }
})
function openSearch() {
  searching.value = true
  requestAnimationFrame?.(() => searchInput.value?.focus())
}
function add(where: 'top' | 'bottom') {
  open.value = null
  emit('newRow', where)
}
function setMode(mode: OpenMode) {
  if (db.canEditStructure.value) db.updateView({ open_in: mode })
}
const panelLabel = computed(() => {
  const p = open.value?.panel
  if (!p) return undefined
  return p === 'settings' ? m.value.viewOptions : p === 'new' ? m.value.newRowOptions : m.value[p]
})
</script>

<template>
  <div class="me-db-toolbar" role="toolbar" :aria-label="m.viewOptions">
    <button
      :ref="el => (buttons.filter = el as HTMLElement)"
      type="button"
      class="me-db-tool"
      :class="{ 'is-on': filters > 0 }"
      data-tool="filter"
      :aria-label="m.filter"
      :title="m.filter"
      :aria-expanded="open?.panel === 'filter'"
      @click="toggle('filter', $event)"
    >
      <ListFilter /><span v-if="filters" class="me-db-tool-label">{{ m.filter }}</span><span v-if="filters" class="me-db-badge">{{ filters }}</span>
    </button>
    <button type="button" class="me-db-tool" :class="{ 'is-on': sorts > 0 }" data-tool="sort" :aria-label="m.sort" :title="m.sort" :aria-expanded="open?.panel === 'sort'" @click="toggle('sort', $event)">
      <ArrowUpDown /><span v-if="sorts" class="me-db-tool-label">{{ m.sort }}</span><span v-if="sorts" class="me-db-badge">{{ sorts }}</span>
    </button>
    <button v-if="hasGroup" type="button" class="me-db-tool" :class="{ 'is-on': !!db.view.value?.config.group_by }" data-tool="group" :aria-label="m.group" :title="m.group" :aria-expanded="open?.panel === 'group'" @click="toggle('group', $event)">
      <Group />
    </button>
    <button v-if="hasProps" type="button" class="me-db-tool" data-tool="properties" :aria-label="m.properties" :title="m.properties" :aria-expanded="open?.panel === 'properties'" @click="toggle('properties', $event)">
      <SlidersHorizontal />
    </button>
    <span class="me-db-search" :class="{ 'is-open': searching || !!db.search.value }">
      <button type="button" class="me-db-tool" data-tool="search" :aria-label="m.search" :title="m.search" @click="openSearch"><Search /></button>
      <input
        v-if="searching || db.search.value"
        ref="searchInput"
        v-model="db.search.value"
        class="me-db-search-input"
        type="search"
        :placeholder="m.search"
        :aria-label="m.search"
        @blur="searching = false"
        @keydown.esc="db.search.value = ''; searching = false"
      >
    </span>
    <button type="button" class="me-db-tool" data-tool="settings" :aria-label="m.viewOptions" :title="m.viewOptions" :aria-expanded="open?.panel === 'settings'" @click="toggle('settings', $event)">
      <Ellipsis />
    </button>
    <span v-if="canAdd" class="me-db-new-split">
      <button type="button" class="me-btn me-btn--primary me-db-new" data-tool="new" :title="m.newRow" @click="emit('newRow')">
        {{ m.newRow }}
      </button>
      <button type="button" class="me-btn me-btn--primary me-db-new-more" data-tool="new-more" :aria-label="m.newRowOptions" :title="m.newRowOptions" :aria-expanded="open?.panel === 'new'" @click="toggle('new', $event)">
        <ChevronDown />
      </button>
    </span>

    <DbPopover v-if="open" :anchor="open.anchor" :scope="db.scope.value" :label="panelLabel" @close="open = null">
      <FilterBuilder v-if="open.panel === 'filter'" />
      <SortBuilder v-else-if="open.panel === 'sort'" />
      <div v-else-if="open.panel === 'new'" class="me-menu me-db-menu" role="menu">
        <template v-if="ordered">
          <button type="button" class="me-menu-item" role="menuitem" data-new="top" @click="add('top')"><ArrowUpToLine class="me-db-menu-icon" />{{ m.newAtTop }}</button>
          <button type="button" class="me-menu-item" role="menuitem" data-new="bottom" @click="add('bottom')"><ArrowDownToLine class="me-db-menu-icon" />{{ m.newAtBottom }}</button>
          <div class="me-db-separator" role="separator" />
        </template>
        <div class="me-menu-label">{{ m.openPagesIn }}</div>
        <button
          v-for="mode in MODES"
          :key="mode"
          type="button"
          class="me-menu-item"
          role="menuitemradio"
          :aria-checked="db.openMode.value === mode"
          :disabled="!db.canEditStructure.value"
          :data-open-mode="mode"
          @click="setMode(mode)"
        >
          <OpenModeIcon :mode="mode" class="me-db-menu-icon" /><span class="me-menu-title">{{ m.openModes[mode] }}</span>
          <Check v-if="db.openMode.value === mode" class="me-db-menu-end" />
        </button>
      </div>
      <ViewSettings v-else :panel="open.panel" />
    </DbPopover>
  </div>
</template>
