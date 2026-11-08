<script setup lang="ts">
/** View tabs: switch, add (type picker), rename, duplicate, delete. */
import { ArrowUpRight, Check, Copy, Link2, Pencil, Plus, Trash2, X } from '@lucide/vue'
import { computed, nextTick, ref, shallowRef } from 'vue'
import { useDb } from '../context'
import type { View, ViewType } from '../types'
import { byPosition, positionAfter, uuidv7, viewDefaults } from '../util'
import { copyViewLink as copyLink, duplicateView, VIEW_TYPES } from '../view-actions'
import DbPopover from './DbPopover.vue'
import PropIcon from './PropIcon.vue'
import RowIcon from './RowIcon.vue'

const emit = defineEmits<{ select: [viewId: string] }>()
const db = useDb()
const m = computed(() => db.m.value)
/** compact: just the "+" (add view), for a one-view database whose tab bar is hidden (Notion). */
const props = defineProps<{ compact?: boolean }>()
const views = computed(() => [...db.source.views.value].sort(byPosition))
const adding = shallowRef<HTMLElement | null>(null)
const menu = shallowRef<{ view: View, anchor: HTMLElement } | null>(null)
const renaming = ref<string | null>(null)
const draft = ref('')

function add(type: ViewType) {
  adding.value = null
  const view: View = { id: uuidv7(), name: m.value.viewTypes[type], type, position: positionAfter(views.value[views.value.length - 1]?.position), config: viewDefaults(type, db.props.value) }
  db.source.upsertView(view)
  emit('select', view.id)
}
function duplicate(v: View) {
  menu.value = null
  emit('select', duplicateView(db, v).id)
}
function remove(v: View) {
  menu.value = null
  if (views.value.length < 2) return
  const rest = views.value.filter(x => x.id !== v.id)
  db.source.deleteView(v.id)
  if (db.view.value?.id === v.id) emit('select', rest[0]!.id)
}
async function startRename(v: View) {
  menu.value = null
  renaming.value = v.id
  draft.value = v.name
  await nextTick()
  document.querySelector<HTMLInputElement>(`[data-rename-view="${v.id}"]`)?.focus()
}
function commitRename(v: View) {
  const name = draft.value.trim()
  renaming.value = null
  if (name && name !== v.name) db.source.upsertView({ ...v, name })
}
function copyViewLink(v: View) {
  menu.value = null
  return copyLink(db, v)
}
function openFull(v: View, e: MouseEvent) {
  menu.value = null
  emit('select', v.id)
  db.options.open?.(db.databaseId, e)
}
/** Quick picks of the tab icon menu (any emoji can be typed). */
const ICONS = ['📋', '📌', '⭐', '🔥', '✅', '📅', '🗂️', '📊', '🎯', '🚀', '💡', '👀']
const iconDraft = ref('')
function setIcon(v: View, icon: string | undefined) {
  const next = icon?.trim() || undefined
  iconDraft.value = next ?? ''
  if (next === v.config.icon) return
  const config = { ...v.config, icon: next }
  if (!next) delete config.icon
  const updated = { ...v, config }
  db.source.upsertView(updated)
  if (menu.value?.view.id === v.id) menu.value = { ...menu.value, view: updated }
}
function setDisplay(v: View, display: 'name' | 'icon') {
  const config = { ...v.config, tab_display: display === 'icon' ? 'icon' as const : undefined }
  if (!config.tab_display) delete config.tab_display
  const updated = { ...v, config }
  db.source.upsertView(updated)
  if (menu.value?.view.id === v.id) menu.value = { ...menu.value, view: updated }
}
function onTabClick(v: View, e: MouseEvent) {
  if (db.view.value?.id === v.id && (db.canEditStructure.value || db.options.viewUrl || db.options.open)) {
    iconDraft.value = v.config.icon ?? ''
    menu.value = { view: v, anchor: e.currentTarget as HTMLElement }
  }
  else emit('select', v.id)
}
</script>

<template>
  <div class="me-db-tabs" :class="{ 'is-compact': props.compact }" role="tablist">
    <template v-for="v in props.compact ? [] : views" :key="v.id">
      <input
        v-if="renaming === v.id"
        v-model="draft"
        class="me-input me-db-tab-input"
        :data-rename-view="v.id"
        :aria-label="m.renameView"
        @keydown.enter.prevent="commitRename(v)"
        @keydown.esc="renaming = null"
        @blur="commitRename(v)"
      >
      <button
        v-else
        type="button"
        role="tab"
        class="me-db-tab"
        :class="{ 'is-active': db.view.value?.id === v.id, 'is-icon-only': v.config.tab_display === 'icon' }"
        :aria-selected="db.view.value?.id === v.id"
        :aria-label="v.config.tab_display === 'icon' ? v.name : undefined"
        :title="v.config.tab_display === 'icon' ? v.name : undefined"
        :data-view-id="v.id"
        @click="onTabClick(v, $event)"
        @dblclick="db.canEditStructure.value && startRename(v)"
      >
        <RowIcon v-if="v.config.icon" :icon="v.config.icon" /><PropIcon v-else :view="v.type" /><span v-if="v.config.tab_display !== 'icon'" class="me-db-tab-name">{{ v.name }}</span>
      </button>
    </template>
    <button v-if="db.canEditStructure.value" type="button" class="me-db-tab is-add" :aria-label="m.addView" data-add-view @click="adding = $event.currentTarget as HTMLElement">
      <Plus />
    </button>

    <DbPopover v-if="adding" :anchor="adding" :scope="db.scope.value" :label="m.addView" @close="adding = null">
      <!-- Notion: "Add a new view", a 4-column grid of layouts (icon over name); picking one adds it and closes. -->
      <div class="me-menu me-db-menu me-db-add-view" role="menu">
        <div class="me-menu-label">{{ m.addNewView }}</div>
        <div class="me-db-add-view-grid">
          <button v-for="t in VIEW_TYPES" :key="t" type="button" class="me-db-add-view-type" role="menuitem" :data-view-type="t" @click="add(t)">
            <PropIcon :view="t" /><span>{{ m.viewTypes[t] }}</span>
          </button>
        </div>
      </div>
    </DbPopover>
    <DbPopover v-if="menu" :anchor="menu.anchor" :scope="db.scope.value" :label="menu.view.name" @close="menu = null">
      <div class="me-menu me-db-menu" role="menu">
        <button v-if="db.canEditStructure.value" type="button" class="me-menu-item" role="menuitem" @click="startRename(menu.view)"><Pencil class="me-db-menu-icon" />{{ m.renameView }}</button>
        <template v-if="db.canEditStructure.value">
          <div class="me-db-separator" role="separator" />
          <div class="me-menu-label">{{ m.viewIcon }}</div>
          <div class="me-db-row me-db-tab-icon-edit">
            <input
              v-model="iconDraft"
              class="me-input me-db-tab-icon-input"
              :placeholder="m.viewIconPlaceholder"
              :aria-label="m.viewIcon"
              data-view-icon
              @keydown.enter.prevent="setIcon(menu.view, iconDraft)"
              @blur="menu && setIcon(menu.view, iconDraft)"
            >
            <button v-if="menu.view.config.icon" type="button" class="me-db-icon-button" :aria-label="m.removeIcon" :title="m.removeIcon" data-remove-view-icon @click="setIcon(menu.view, undefined)"><X /></button>
          </div>
          <div class="me-db-tab-icons" role="group" :aria-label="m.viewIcon">
            <button v-for="e in ICONS" :key="e" type="button" class="me-db-icon-button me-db-tab-icon-pick" :class="{ 'is-on': menu.view.config.icon === e }" :data-pick-icon="e" @click="setIcon(menu.view, e)">{{ e }}</button>
          </div>
          <div class="me-menu-label">{{ m.tabDisplayAs }}</div>
          <button
            v-for="d in (['name', 'icon'] as const)"
            :key="d"
            type="button"
            class="me-menu-item"
            role="menuitemradio"
            :aria-checked="(menu.view.config.tab_display ?? 'name') === d"
            :data-tab-display="d"
            @click="setDisplay(menu.view, d)"
          >
            <span class="me-menu-title">{{ m.tabDisplays[d] }}</span><Check v-if="(menu.view.config.tab_display ?? 'name') === d" class="me-db-menu-end" />
          </button>
          <div class="me-db-separator" role="separator" />
        </template>
        <button v-if="db.options.viewUrl" type="button" class="me-menu-item" role="menuitem" data-copy-view-link @click="copyViewLink(menu.view)"><Link2 class="me-db-menu-icon" />{{ m.copyLinkToView }}</button>
        <button v-if="db.options.open" type="button" class="me-menu-item" role="menuitem" data-open-full @click="openFull(menu.view, $event)"><ArrowUpRight class="me-db-menu-icon" />{{ m.openAsFullPage }}</button>
        <template v-if="db.canEditStructure.value">
          <button type="button" class="me-menu-item" role="menuitem" data-duplicate-view @click="duplicate(menu.view)"><Copy class="me-db-menu-icon" />{{ m.duplicateView }}</button>
          <button v-if="views.length > 1" type="button" class="me-menu-item is-danger" role="menuitem" data-delete-view @click="remove(menu.view)"><Trash2 class="me-db-menu-icon" />{{ m.deleteView }}</button>
        </template>
      </div>
    </DbPopover>
  </div>
</template>
