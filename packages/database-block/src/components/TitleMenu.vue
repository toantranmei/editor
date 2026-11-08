<script setup lang="ts">
/**
 * "⋯" after the database title (Notion): copy link to view, duplicate view; view database (full page), edit title,
 * edit icon, edit layout; hide title.
 */
import { ArrowUpRight, Copy, Ellipsis, EyeOff, LayoutPanelLeft, Link2, PenLine, Smile, X } from '@lucide/vue'
import { computed, nextTick, ref, shallowRef } from 'vue'
import { useDb } from '../context'
import { copyViewLink, duplicateView } from '../view-actions'
import DbPopover from './DbPopover.vue'

const props = defineProps<{ full?: boolean }>()
const emit = defineEmits<{ select: [viewId: string], editTitle: [], editLayout: [] }>()
const db = useDb()
const m = computed(() => db.m.value)
const anchor = shallowRef<HTMLElement | null>(null)
/** The menu, or its "Edit icon" picker. */
const mode = ref<'menu' | 'icon'>('menu')
const editable = computed(() => db.canEditStructure.value)
const canOpen = computed(() => !!db.options.open && !props.full)
const iconDraft = ref('')
const iconInput = ref<HTMLInputElement | null>(null)
/** Quick picks (any emoji can be typed). */
const ICONS = ['📋', '📌', '⭐', '🔥', '✅', '📅', '🗂️', '📊', '🎯', '🚀', '💡', '👀']

function toggle(e: MouseEvent) {
  mode.value = 'menu'
  anchor.value = anchor.value ? null : e.currentTarget as HTMLElement
}
function close() {
  anchor.value = null
}
function run(action: () => void) {
  close()
  action()
}
function copyLink() {
  const v = db.view.value
  close()
  if (v) void copyViewLink(db, v)
}
function duplicate() {
  const v = db.view.value
  close()
  if (v) emit('select', duplicateView(db, v).id)
}
function viewDatabase(e: MouseEvent) {
  close()
  db.options.open?.(db.databaseId, e)
}
async function editIcon() {
  iconDraft.value = db.source.meta.value?.icon ?? ''
  mode.value = 'icon'
  await nextTick()
  iconInput.value?.focus()
}
function setIcon(icon: string | null) {
  const next = icon?.trim() || null
  if (next !== (db.source.meta.value?.icon ?? null)) db.source.setMeta({ icon: next })
  close()
}
</script>

<template>
  <button
    type="button"
    class="me-db-tab is-add me-db-title-more"
    :aria-label="m.titleMenu"
    :title="m.titleMenu"
    :aria-expanded="!!anchor"
    data-title-menu
    @click="toggle"
  >
    <Ellipsis />
  </button>
  <DbPopover v-if="anchor" :anchor="anchor" :scope="db.scope.value" :label="m.titleMenu" @close="close">
    <div v-if="mode === 'menu'" class="me-menu me-db-menu" role="menu">
      <template v-if="db.options.viewUrl || editable">
        <button v-if="db.options.viewUrl" type="button" class="me-menu-item" role="menuitem" data-title-action="copy-link" @click="copyLink"><Link2 class="me-db-menu-icon" />{{ m.copyLinkToView }}</button>
        <button v-if="editable" type="button" class="me-menu-item" role="menuitem" data-title-action="duplicate" @click="duplicate"><Copy class="me-db-menu-icon" />{{ m.duplicateThisView }}</button>
        <div class="me-db-separator" role="separator" />
      </template>
      <button v-if="canOpen" type="button" class="me-menu-item" role="menuitem" data-title-action="open" @click="viewDatabase"><ArrowUpRight class="me-db-menu-icon" />{{ m.viewDatabase }}</button>
      <template v-if="editable">
        <button type="button" class="me-menu-item" role="menuitem" data-title-action="edit-title" @click="run(() => emit('editTitle'))"><PenLine class="me-db-menu-icon" />{{ m.editTitle }}</button>
        <button type="button" class="me-menu-item" role="menuitem" data-title-action="edit-icon" @click="editIcon"><Smile class="me-db-menu-icon" />{{ m.editIcon }}</button>
        <button type="button" class="me-menu-item" role="menuitem" data-title-action="edit-layout" @click="run(() => emit('editLayout'))"><LayoutPanelLeft class="me-db-menu-icon" />{{ m.editLayout }}</button>
        <div class="me-db-separator" role="separator" />
        <button type="button" class="me-menu-item" role="menuitem" data-title-action="hide-title" @click="run(() => db.updateView({ show_title: false }))"><EyeOff class="me-db-menu-icon" />{{ m.hideTitle }}</button>
      </template>
    </div>
    <div v-else class="me-menu me-db-menu" role="dialog" :aria-label="m.editIcon">
      <div class="me-menu-label">{{ m.editIcon }}</div>
      <div class="me-db-row me-db-tab-icon-edit">
        <input
          ref="iconInput"
          v-model="iconDraft"
          class="me-input me-db-tab-icon-input"
          :placeholder="m.viewIconPlaceholder"
          :aria-label="m.editIcon"
          data-db-icon-input
          @keydown.enter.prevent="setIcon(iconDraft)"
        >
        <button v-if="db.source.meta.value?.icon" type="button" class="me-db-icon-button" :aria-label="m.removeIcon" :title="m.removeIcon" data-db-icon-remove @click="setIcon(null)"><X /></button>
      </div>
      <div class="me-db-tab-icons" role="group" :aria-label="m.editIcon">
        <button v-for="e in ICONS" :key="e" type="button" class="me-db-icon-button me-db-tab-icon-pick" :class="{ 'is-on': db.source.meta.value?.icon === e }" :data-pick-icon="e" @click="setIcon(e)">{{ e }}</button>
      </div>
    </div>
  </DbPopover>
</template>
