<script setup lang="ts">
/** Right side of the tab bar: filter, sort, group, properties, view settings, search, "New". */
import { ArrowUpDown, Group, ListFilter, Plus, Search, SlidersHorizontal, Settings2 } from '@lucide/vue'
import { computed, ref, shallowRef, watch } from 'vue'
import { useDb } from '../context'
import { countConditions } from '../filters'
import DbPopover from './DbPopover.vue'
import FilterBuilder from './FilterBuilder.vue'
import SortBuilder from './SortBuilder.vue'
import ViewSettings from './ViewSettings.vue'

const emit = defineEmits<{ newRow: [] }>()
const db = useDb()
const m = computed(() => db.m.value)
type Panel = 'filter' | 'sort' | 'group' | 'properties' | 'settings'
const open = shallowRef<{ panel: Panel, anchor: HTMLElement } | null>(null)
const buttons = ref<Record<string, HTMLElement | null>>({})
const filters = computed(() => countConditions(db.view.value?.config.filter))
const sorts = computed(() => db.view.value?.config.sorts?.length ?? 0)
const type = computed(() => db.view.value?.type)
const hasGroup = computed(() => ['table', 'list', 'board'].includes(type.value ?? ''))
const hasSettings = computed(() => ['board', 'gallery', 'calendar', 'timeline', 'chart', 'pivot'].includes(type.value ?? ''))
const hasProps = computed(() => !['chart', 'pivot'].includes(type.value ?? ''))
const searching = ref(!!db.search.value)
const searchInput = ref<HTMLInputElement | null>(null)

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
</script>

<template>
  <div class="me-db-toolbar" role="toolbar" :aria-label="m.settings">
    <button :ref="el => (buttons.filter = el as HTMLElement)" type="button" class="me-db-tool" :class="{ 'is-on': filters > 0 }" data-tool="filter" :aria-label="m.filter" :aria-expanded="open?.panel === 'filter'" @click="toggle('filter', $event)">
      <ListFilter /><span class="me-db-tool-label">{{ m.filter }}</span><span v-if="filters" class="me-db-badge">{{ filters }}</span>
    </button>
    <button type="button" class="me-db-tool" :class="{ 'is-on': sorts > 0 }" data-tool="sort" :aria-label="m.sort" :aria-expanded="open?.panel === 'sort'" @click="toggle('sort', $event)">
      <ArrowUpDown /><span class="me-db-tool-label">{{ m.sort }}</span><span v-if="sorts" class="me-db-badge">{{ sorts }}</span>
    </button>
    <button v-if="hasGroup" type="button" class="me-db-tool" :class="{ 'is-on': !!db.view.value?.config.group_by }" data-tool="group" :aria-label="m.group" @click="toggle('group', $event)">
      <Group /><span class="me-db-tool-label">{{ m.group }}</span>
    </button>
    <button v-if="hasProps" type="button" class="me-db-tool" data-tool="properties" :aria-label="m.properties" @click="toggle('properties', $event)">
      <SlidersHorizontal /><span class="me-db-tool-label">{{ m.properties }}</span>
    </button>
    <button v-if="hasSettings" type="button" class="me-db-tool" data-tool="settings" :aria-label="m.settings" @click="toggle('settings', $event)">
      <Settings2 />
    </button>
    <span class="me-db-search" :class="{ 'is-open': searching || !!db.search.value }">
      <button type="button" class="me-db-tool" :aria-label="m.search" @click="openSearch"><Search /></button>
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
    <button v-if="db.canEditContent.value && !['chart', 'pivot'].includes(type ?? '')" type="button" class="me-btn me-btn--primary me-db-new" data-tool="new" @click="emit('newRow')">
      <Plus />{{ m.newRow }}
    </button>

    <DbPopover v-if="open" :anchor="open.anchor" :scope="db.scope.value" :label="m[open.panel === 'settings' ? 'settings' : open.panel]" @close="open = null">
      <FilterBuilder v-if="open.panel === 'filter'" />
      <SortBuilder v-else-if="open.panel === 'sort'" />
      <ViewSettings v-else :panel="open.panel" />
    </DbPopover>
  </div>
</template>
