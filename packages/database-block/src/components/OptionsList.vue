<script setup lang="ts">
/**
 * Options of a select / multi-select / status property, as in Notion's "Edit property": "Sort  Manual ›" (kept in
 * `config.option_sort` so new options land in order), "Options", then each option as its colored tag with a drag
 * handle and "›". Clicking an option opens its menu (name, delete, default and group for status, color). Status lists
 * its options under their groups, each with "+" and the default marked. "+ Add an option" adds one.
 * Every change is emitted at once as a patch of the config.
 */
import { Check, ChevronRight, GripVertical, Plus } from '@lucide/vue'
import { computed, nextTick, ref } from 'vue'
import { useDb } from '../context'
import type { PropConfig, SelectOption, StatusGroup } from '../types'
import { newOption } from '../values'
import DbPopover from './DbPopover.vue'
import OptionMenu from './OptionMenu.vue'

type OptionSort = 'manual' | 'asc' | 'desc'
const props = defineProps<{ config: PropConfig, status?: boolean }>()
const emit = defineEmits<{ change: [patch: Partial<PropConfig>] }>()
const db = useDb()
const m = computed(() => db.m.value)
const options = computed(() => props.config.options ?? [])
const groups = computed<StatusGroup[]>(() => props.config.groups ?? [])
const mode = computed<OptionSort>(() => (props.config.option_sort as OptionSort | undefined) ?? 'manual')
const SORTS: OptionSort[] = ['manual', 'asc', 'desc']

const collator = computed(() => new Intl.Collator(db.locale.value, { sensitivity: 'base', numeric: true }))
function sorted(list: SelectOption[], how: OptionSort = mode.value): SelectOption[] {
  if (how === 'manual') return list
  const out = [...list].sort((a, b) => collator.value.compare(a.name, b.name))
  return how === 'desc' ? out.reverse() : out
}

// ── Sort ("Sort  Manual ›") ──
const sortAnchor = ref<HTMLElement | null>(null)
function setSort(how: OptionSort) {
  emit('change', { option_sort: how === 'manual' ? undefined : how, options: sorted(options.value, how) })
  sortAnchor.value = null
}

// ── Option menu ──
const menu = ref<{ id: string, anchor: HTMLElement } | null>(null)
function openMenu(id: string, e: Event) {
  menu.value = menu.value?.id === id ? null : { id, anchor: e.currentTarget as HTMLElement }
}

// ── Add ("+ Add an option", "+" of a status group) ──
/** The group a new option goes to ('' = the flat list), while its name is typed. */
const adding = ref<string | null>(null)
const draft = ref('')
const draftInput = ref<HTMLInputElement[] | HTMLInputElement | null>(null)
function startAdd(groupId = '') {
  adding.value = groupId
  draft.value = ''
  nextTick(() => (Array.isArray(draftInput.value) ? draftInput.value[0] : draftInput.value)?.focus())
}
function add() {
  const name = draft.value.trim()
  const groupId = adding.value
  if (!name || groupId === null) return
  const o = newOption(name, options.value)
  const patch: Partial<PropConfig> = { options: sorted([...options.value, o]) }
  if (groupId) patch.groups = groups.value.map(g => (g.id === groupId ? { ...g, option_ids: [...g.option_ids, o.id] } : g))
  emit('change', patch)
  // Stays open for the next one (Notion).
  draft.value = ''
}
function stopAdd() {
  if (!draft.value.trim()) adding.value = null
}

// ── Drag to reorder (manual sort; within a status group it reorders that group and can move to another) ──
const dragging = ref<string | null>(null)
const over = ref<string | null>(null)
function onDrop(targetId: string) {
  const from = dragging.value
  dragging.value = over.value = null
  if (!from || from === targetId) return
  if (props.status) {
    const g = groups.value.find(x => x.option_ids.includes(targetId))
    if (!g) return
    const ids = g.option_ids.filter(x => x !== from)
    ids.splice(ids.indexOf(targetId), 0, from)
    emit('change', { groups: groups.value.map(x => (x.id === g.id ? { ...x, option_ids: ids } : { ...x, option_ids: x.option_ids.filter(y => y !== from) })) })
    return
  }
  const list = options.value.filter(o => o.id !== from)
  list.splice(list.findIndex(o => o.id === targetId), 0, options.value.find(o => o.id === from)!)
  emit('change', { options: list, option_sort: undefined })
}

/** Status: its groups with their options; others: one flat section. */
const sections = computed(() => {
  if (!props.status) return [{ id: '', name: '', options: options.value }]
  const byId = new Map(options.value.map(o => [o.id, o]))
  return groups.value.map(g => ({ id: g.id, name: g.name, options: g.option_ids.map(id => byId.get(id)).filter((o): o is SelectOption => !!o) }))
})
const draggable = computed(() => props.status || mode.value === 'manual')
</script>

<template>
  <div class="me-db-options">
    <template v-if="!status">
      <button
        type="button"
        class="me-menu-item"
        data-option-sort
        :aria-expanded="!!sortAnchor"
        @click="sortAnchor = sortAnchor ? null : ($event.currentTarget as HTMLElement)"
      >
        <span class="me-menu-title">{{ m.optionSort }}</span><span class="me-db-menu-value">{{ m.optionSorts[mode] }}</span><ChevronRight class="me-db-menu-end" />
      </button>
      <div class="me-db-separator" role="separator" />
    </template>

    <section v-for="sec in sections" :key="sec.id" class="me-db-option-section" :data-group="sec.id || undefined">
      <div class="me-db-option-group-head">
        <span class="me-menu-label">{{ status ? sec.name : m.optionsLabel }}</span>
        <button v-if="status" type="button" class="me-db-icon-button" :aria-label="m.addOption" :title="m.addOption" data-add-to-group @click="startAdd(sec.id)"><Plus /></button>
      </div>
      <div
        v-for="o in sec.options"
        :key="o.id"
        class="me-menu-item me-db-option-item"
        :class="{ 'is-over': over === o.id && dragging !== o.id, 'is-open': menu?.id === o.id }"
        role="button"
        tabindex="0"
        :aria-expanded="menu?.id === o.id"
        :data-option="o.id"
        @click="openMenu(o.id, $event)"
        @keydown.enter.prevent="openMenu(o.id, $event)"
        @dragover.prevent="over = o.id"
        @drop.prevent="onDrop(o.id)"
      >
        <span
          v-if="draggable"
          class="me-db-option-handle"
          draggable="true"
          :title="m.dragToMove"
          @click.stop
          @dragstart="dragging = o.id"
          @dragend="dragging = over = null"
        ><GripVertical /></span>
        <span class="me-db-tag" :class="{ 'is-status': status }" :data-color="o.color === 'default' ? undefined : o.color">{{ o.name }}</span>
        <span v-if="status && config.default_option_id === o.id" class="me-db-menu-value" data-default>{{ m.defaultBadge }}</span>
        <ChevronRight class="me-db-menu-end" />
      </div>
      <div v-if="adding === sec.id" class="me-db-option-add">
        <input
          ref="draftInput"
          v-model="draft"
          class="me-input"
          :placeholder="m.addOption"
          :aria-label="m.addOption"
          data-option-draft
          @keydown.enter.prevent="add"
          @keydown.esc.stop.prevent="adding = null"
          @blur="stopAdd"
        >
      </div>
    </section>

    <button v-if="!status && adding === null" type="button" class="me-menu-item" data-add-option @click="startAdd()">
      <Plus class="me-db-menu-icon" />{{ m.addOption }}
    </button>

    <DbPopover v-if="sortAnchor" :anchor="sortAnchor" :scope="db.scope.value" placement="right" :label="m.optionSort" @close="sortAnchor = null">
      <div class="me-menu me-db-menu" role="menu">
        <button v-for="s in SORTS" :key="s" type="button" class="me-menu-item" role="menuitemradio" :aria-checked="mode === s" :data-sort="s" @click="setSort(s)">
          <span class="me-menu-title">{{ m.optionSorts[s] }}</span><Check v-if="mode === s" class="me-db-menu-end" />
        </button>
      </div>
    </DbPopover>
    <OptionMenu
      v-if="menu"
      :key="menu.id"
      :config="config"
      :option-id="menu.id"
      :anchor="menu.anchor"
      :status="status"
      @change="patch => emit('change', patch)"
      @close="menu = null"
    />
  </div>
</template>
