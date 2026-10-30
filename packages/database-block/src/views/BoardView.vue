<script setup lang="ts">
/**
 * Board view: a column per group (`group_by`, select / status / person / checkbox), cards loaded per column in
 * windows. Dragging a card to another column writes the new group value with `setCell`; inside a column it calls
 * `moveRow`. "+ Add group" creates a new option.
 */
import { Plus } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import CellValue from '../components/CellValue.vue'
import { useDb } from '../context'
import { fmt } from '../messages'
import type { Row } from '../types'
import { useRowStore } from '../use-rows'
import { cellValue, coverImage, isEmptyValue, isReadOnly } from '../util'
import { newOption, optionById } from '../values'

defineProps<{ full?: boolean }>()
const db = useDb()
const m = computed(() => db.m.value)
const store = useRowStore(db, { grouped: () => !!db.view.value?.config.group_by?.prop })
const groupProp = computed(() => db.props.value.find(p => p.id === db.view.value?.config.group_by?.prop))
const title = computed(() => db.props.value.find(p => p.type === 'title'))
const shown = computed(() => (db.view.value?.config.card?.props ?? []).map(id => db.props.value.find(p => p.id === id)).filter(p => !!p))
const coverProp = computed(() => db.props.value.find(p => p.id === db.view.value?.config.card?.cover && p.type === 'files'))
const config = computed(() => db.view.value?.config ?? {})
const cardSize = computed(() => config.value.card?.size ?? 'm')
const coverUrl = (row: Row) => (coverProp.value ? coverImage(cellValue(row, coverProp.value)) : null)
/** Option color of a column (when "Color columns" is on). */
const columnColor = (key: string | null | undefined) => {
  if (!config.value.color_columns) return undefined
  const c = optionOf(key)?.color
  return c && c !== 'default' ? c : undefined
}
const PAGE = 50
/** Cards loaded per column (grows with "Load more"). */
const limits = ref<Record<string, number>>({})
const segments = computed(() => store.value?.segments.value ?? [])
const limitOf = (key: string | null | undefined) => limits.value[String(key)] ?? PAGE

watch([segments, limits], () => {
  segments.value.forEach((s, i) => store.value?.ensure(i, 0, limitOf(s.key) - 1, false))
}, { immediate: true })

const cardsOf = (seg: number) => {
  void store.value?.tick.value
  const s = segments.value[seg]
  return s ? store.value!.loadedRows(seg, 0, limitOf(s.key) - 1) : []
}
const optionOf = (key: string | null | undefined) => (groupProp.value && key ? optionById(groupProp.value, key) : undefined)
function valueFor(key: string | null | undefined, row?: Row): unknown {
  const p = groupProp.value
  if (!p) return undefined
  if (key === null || key === undefined) return null
  if (p.type === 'checkbox') return key === 'true'
  if (p.type === 'multi_select' || p.type === 'person') {
    // Moving between columns swaps that one value, keeping the others.
    const current = row ? (cellValue(row, p) as string[] | undefined) ?? [] : []
    const from = dragging.value?.from
    return [...current.filter(v => v !== from), key]
  }
  return key
}

// ── Drag & drop ──
const dragging = ref<{ id: string, from: string | null | undefined, seg: number } | null>(null)
const over = ref<{ seg: number, before: string | null } | null>(null)
function onDragStart(e: DragEvent, row: Row, seg: number) {
  if (!db.canEditContent.value) return e.preventDefault()
  dragging.value = { id: row.id, from: segments.value[seg]?.key, seg }
  e.dataTransfer?.setData('application/x-me-db-row', row.id)
}
function onDragOver(e: DragEvent, seg: number, before: string | null) {
  if (!dragging.value) return
  e.preventDefault()
  e.stopPropagation()
  over.value = { seg, before }
}
function onDrop(e: DragEvent) {
  e.preventDefault()
  const d = dragging.value
  const o = over.value
  dragging.value = null
  over.value = null
  if (!d || !o || !store.value) return
  const cards = cardsOf(o.seg)
  const row = cardsOf(d.seg).find(r => r.id === d.id)
  const key = segments.value[o.seg]?.key
  if (o.seg !== d.seg && groupProp.value && !isReadOnly(groupProp.value.type)) {
    db.source.setCell(d.id, groupProp.value.id, valueFor(key, row))
  }
  if (!db.view.value?.config.sorts?.length) {
    const at = o.before ? cards.findIndex(r => r.id === o.before) : cards.length
    const before = o.before
    const after = (at > 0 ? cards[at - 1]?.id : null) ?? null
    if (before !== d.id && after !== d.id) db.source.moveRow(d.id, after, before)
  }
}

function newCard(seg: number, e?: MouseEvent) {
  const p = groupProp.value
  const key = segments.value[seg]?.key
  const values: Record<string, unknown> = {}
  const v = valueFor(key)
  if (p && v !== undefined && v !== null) values[p.id] = v
  const id = db.source.createRow({ values })
  db.openRow(id, e)
}

// ── Add group (new option) ──
const addingGroup = ref(false)
const groupName = ref('')
const canAddGroup = computed(() => db.canEditStructure.value && !!groupProp.value && ['select', 'multi_select', 'status'].includes(groupProp.value.type))
function addGroup() {
  const p = groupProp.value
  const name = groupName.value.trim()
  addingGroup.value = false
  groupName.value = ''
  if (!p || !name) return
  const options = p.config?.options ?? []
  const opt = newOption(name, options)
  const config = { ...p.config, options: [...options, opt] }
  // A new status option goes into the first group (to-do), like Notion.
  if (p.type === 'status' && config.groups?.length) config.groups = config.groups.map((g, i) => (i === 0 ? { ...g, option_ids: [...g.option_ids, opt.id] } : g))
  db.source.upsertProp({ ...p, config })
}
const loadMore = (key: string | null | undefined) => (limits.value = { ...limits.value, [String(key)]: limitOf(key) + PAGE })
</script>

<template>
  <div class="me-db-scroll me-db-board" :class="{ 'is-full': full, 'is-fit': !!config.fit_image }" :data-size="cardSize">
    <div v-if="!groupProp" class="me-db-empty">{{ m.groupBy }}</div>
    <div
      v-for="(s, i) in segments"
      v-else
      :key="String(s.key)"
      class="me-db-column"
      :class="{ 'is-over': over?.seg === i, 'is-colored': !!columnColor(s.key) }"
      :data-color="columnColor(s.key)"
      :data-group="s.key ?? ''"
      @dragover="onDragOver($event, i, null)"
      @drop="onDrop"
    >
      <div class="me-db-column-head">
        <span v-if="optionOf(s.key)" class="me-db-tag" :data-color="optionOf(s.key)!.color === 'default' ? undefined : optionOf(s.key)!.color">{{ s.label }}</span>
        <span v-else class="me-db-group-label">{{ s.label || fmt(m.noValue, { name: groupProp.name }) }}</span>
        <span class="me-db-group-count">{{ s.count }}</span>
        <button v-if="db.canEditContent.value" type="button" class="me-db-icon-button" :aria-label="m.newRow" :title="m.newRow" @click="newCard(i, $event)"><Plus /></button>
      </div>
      <div class="me-db-column-cards">
        <button
          v-for="row in cardsOf(i)"
          :key="row.id"
          type="button"
          class="me-db-card"
          :class="{ 'is-drop-before': over?.seg === i && over.before === row.id, 'is-dragging': dragging?.id === row.id }"
          :draggable="db.canEditContent.value"
          :data-row-id="row.id"
          @dragstart="onDragStart($event, row, i)"
          @dragover="onDragOver($event, i, row.id)"
          @dragend="dragging = null; over = null"
          @click="db.openRow(row.id, $event)"
        >
          <span v-if="coverProp && coverUrl(row)" class="me-db-cover">
            <img :src="coverUrl(row)!" alt="" loading="lazy" decoding="async" class="me-db-cover-img">
          </span>
          <span class="me-db-card-title">{{ title ? String(cellValue(row, title) ?? '') || m.untitled : m.untitled }}</span>
          <template v-for="p in shown" :key="p!.id">
            <CellValue v-if="!isEmptyValue(cellValue(row, p!))" :prop="p!" :value="cellValue(row, p!)" compact />
          </template>
        </button>
        <button v-if="s.count > limitOf(s.key)" type="button" class="me-db-text-button" @click="loadMore(s.key)">{{ m.loadMore }}</button>
        <button v-if="db.canEditContent.value" type="button" class="me-db-new-row is-card" @click="newCard(i, $event)"><Plus />{{ m.newRow }}</button>
      </div>
    </div>
    <div v-if="canAddGroup" class="me-db-column is-add">
      <input v-if="addingGroup" v-model="groupName" class="me-input" :placeholder="m.newGroupName" :aria-label="m.newGroupName" autofocus @keydown.enter.prevent="addGroup" @blur="addGroup">
      <button v-else type="button" class="me-db-text-button" data-add-group @click="addingGroup = true"><Plus />{{ m.addGroup }}</button>
    </div>
  </div>
</template>
