<script setup lang="ts">
/**
 * Row menu (Notion's ⋮⋮ / right-click menu): open in a mode, edit a property of every row it applies to,
 * duplicate, copy link, delete. Applies to `rows` (one row, or the checked rows when the clicked one is checked).
 */
import { ArrowUpRight, ChevronRight, Copy, FileText, Link2, ListTree, Pencil, Trash2 } from '@lucide/vue'
import { computed, ref } from 'vue'
import { useDb } from '../context'
import { fmt } from '../messages'
import type { OpenMode, Prop, Row } from '../types'
import { duplicateRows, isReadOnly, uuidv7 } from '../util'
import CellEditor from './CellEditor.vue'
import DbPopover from './DbPopover.vue'
import OpenModeIcon from './OpenModeIcon.vue'
import PropIcon from './PropIcon.vue'

const props = defineProps<{ rows: Row[], anchor: HTMLElement | DOMRect, subItems?: boolean }>()
const emit = defineEmits<{ close: [], done: [], addSub: [parent: Row] }>()
const db = useDb()
const m = computed(() => db.m.value)
const panel = ref<'menu' | 'open' | 'props'>('menu')
const editing = ref<Prop | null>(null)
const single = computed(() => props.rows.length === 1 ? props.rows[0]! : null)
const editable = computed(() => db.canEditContent.value)
const writable = computed(() => db.props.value.filter(p => !isReadOnly(p.type)))
const url = computed(() => single.value && db.options.rowUrl ? db.options.rowUrl(db.databaseId, single.value.id) : null)
const MODES: OpenMode[] = ['side_peek', 'center_peek', 'full_page']

function open(mode: OpenMode) {
  if (single.value) db.openRow(single.value.id, null, mode)
  emit('close')
}

function duplicate() {
  duplicateRows(db, props.rows)
  emit('done')
  emit('close')
}

async function copyLink() {
  if (url.value) {
    try {
      await navigator.clipboard.writeText(url.value)
    }
    catch (error) {
      db.report(error)
    }
  }
  emit('close')
}

/** The row's writable values become a template ("New ▾ → Templates"), named after its title; its page is the template's page. */
function saveTemplate() {
  const row = single.value
  if (!row) return
  const keep = new Set(writable.value.map(p => p.id))
  const title = db.props.value.find(p => p.type === 'title')
  const values = Object.fromEntries(Object.entries(row.values).filter(([k, v]) => keep.has(k) && k !== title?.id && v !== null && v !== undefined))
  const name = (title && String(row.values[title.id] ?? '').trim()) || m.value.untitled
  db.saveTemplates([...db.templates.value, { id: uuidv7(), name, values, body_from: row.id }])
  emit('close')
}
function remove() {
  db.source.deleteRows(props.rows.map(r => r.id))
  emit('done')
  emit('close')
}

/** Bulk edit: one editor whose writes go to every row. */
const blank = computed<Row>(() => ({ id: single.value?.id ?? '__rows__', position: '', values: single.value?.values ?? {} }))
</script>

<template>
  <DbPopover v-if="!editing" :anchor="anchor" :scope="db.scope.value" :label="m.rowActions" @close="emit('close')">
    <div class="me-menu me-db-menu me-db-row-menu" role="menu">
      <template v-if="panel === 'menu'">
        <div class="me-menu-label">{{ single ? m.rowActions : fmt(m.selected, { count: rows.length }) }}</div>
        <button v-if="single" type="button" class="me-menu-item" role="menuitem" data-action="open-in" @click="panel = 'open'">
          <ArrowUpRight class="me-db-menu-icon" /><span class="me-menu-title">{{ m.openIn }}</span><ChevronRight class="me-db-menu-end" />
        </button>
        <button v-if="editable" type="button" class="me-menu-item" role="menuitem" data-action="edit-property" @click="panel = 'props'">
          <Pencil class="me-db-menu-icon" /><span class="me-menu-title">{{ m.editProperty }}</span><ChevronRight class="me-db-menu-end" />
        </button>
        <button v-if="url" type="button" class="me-menu-item" role="menuitem" data-action="copy-link" @click="copyLink">
          <Link2 class="me-db-menu-icon" />{{ m.copyLink }}
        </button>
        <template v-if="editable">
          <button v-if="single && subItems" type="button" class="me-menu-item" role="menuitem" data-action="add-sub" @click="emit('addSub', single!); emit('close')">
            <ListTree class="me-db-menu-icon" />{{ m.addSubItem }}
          </button>
          <button type="button" class="me-menu-item" role="menuitem" data-action="duplicate" @click="duplicate">
            <Copy class="me-db-menu-icon" /><span class="me-menu-title">{{ m.duplicate }}</span><kbd class="me-db-menu-end me-db-kbd">⌘D</kbd>
          </button>
          <button v-if="single && db.canEditStructure.value" type="button" class="me-menu-item" role="menuitem" data-action="save-template" @click="saveTemplate">
            <FileText class="me-db-menu-icon" />{{ m.saveAsTemplate }}
          </button>
          <div class="me-db-separator" role="separator" />
          <button type="button" class="me-menu-item is-danger" role="menuitem" data-action="delete" @click="remove">
            <Trash2 class="me-db-menu-icon" /><span class="me-menu-title">{{ m.deleteRows }}</span><kbd class="me-db-menu-end me-db-kbd">Del</kbd>
          </button>
        </template>
      </template>
      <template v-else-if="panel === 'open'">
        <div class="me-menu-label">{{ m.openIn }}</div>
        <button v-for="mode in MODES" :key="mode" type="button" class="me-menu-item" role="menuitem" :data-mode="mode" @click="open(mode)">
          <OpenModeIcon :mode="mode" class="me-db-menu-icon" />{{ m.openModes[mode] }}
        </button>
      </template>
      <template v-else>
        <div class="me-menu-label">{{ m.editProperty }}</div>
        <button v-for="p in writable" :key="p.id" type="button" class="me-menu-item" role="menuitem" :data-prop="p.id" @click="editing = p">
          <PropIcon :type="p.type" /><span class="me-menu-title">{{ p.name }}</span>
        </button>
      </template>
    </div>
  </DbPopover>
  <CellEditor
    v-else
    :prop="editing"
    :row="blank"
    :row-ids="rows.map(r => r.id)"
    :anchor="anchor"
    initial-text=""
    @close="emit('close')"
  />
</template>
