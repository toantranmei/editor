<script setup lang="ts">
/**
 * Option editor of select / multi-select / status (Notion's "Edit property" options): drag to reorder, a sort mode
 * (manual / A → Z / Z → A, kept in `config.option_sort` so new options land in order), per option a name, a color
 * picked from swatches and delete. Status lists its options under their group with "+" per group, "Set as default"
 * (`config.default_option_id`) and a move to another group. Every change is emitted at once (no Save).
 */
import { Check, ChevronDown, ChevronRight, GripVertical, Plus, Star, Trash2 } from '@lucide/vue'
import { COLORS } from '@toantranmei/editor'
import { computed, ref } from 'vue'
import { useDb } from '../context'
import type { OptionColor, PropConfig, SelectOption, StatusGroup } from '../types'
import { newOption } from '../values'

type OptionSort = 'manual' | 'asc' | 'desc'
const props = defineProps<{ config: PropConfig, status?: boolean }>()
const emit = defineEmits<{ change: [patch: Partial<PropConfig>] }>()
const db = useDb()
const m = computed(() => db.m.value)
const options = computed(() => props.config.options ?? [])
const groups = computed<StatusGroup[]>(() => props.config.groups ?? [])
const mode = computed<OptionSort>(() => (props.config.option_sort as OptionSort | undefined) ?? 'manual')
const open = ref<string | null>(null)
const draft = ref('')
const groupDraft = ref<{ group: string, name: string } | null>(null)
const SORTS: OptionSort[] = ['manual', 'asc', 'desc']

const collator = computed(() => new Intl.Collator(db.locale.value, { sensitivity: 'base', numeric: true }))
function sorted(list: SelectOption[], how: OptionSort = mode.value): SelectOption[] {
  if (how === 'manual') return list
  const out = [...list].sort((a, b) => collator.value.compare(a.name, b.name))
  return how === 'desc' ? out.reverse() : out
}
const emitOptions = (list: SelectOption[], extra: Partial<PropConfig> = {}) => emit('change', { options: sorted(list), ...extra })
const update = (id: string, patch: Partial<SelectOption>) => emitOptions(options.value.map(o => (o.id === id ? { ...o, ...patch } : o)))

function setSort(how: OptionSort) {
  emit('change', { option_sort: how === 'manual' ? undefined : how, options: sorted(options.value, how) })
}

function add(groupId?: string) {
  const name = (groupId ? groupDraft.value?.name : draft.value)?.trim()
  if (!name) return
  const o = newOption(name, options.value)
  if (groupId) {
    emitOptions([...options.value, o], { groups: groups.value.map(g => (g.id === groupId ? { ...g, option_ids: [...g.option_ids, o.id] } : g)) })
    groupDraft.value = { group: groupId, name: '' }
  }
  else {
    emitOptions([...options.value, o])
    draft.value = ''
  }
}

function remove(id: string) {
  const extra: Partial<PropConfig> = {}
  if (props.status) extra.groups = groups.value.map(g => ({ ...g, option_ids: g.option_ids.filter(x => x !== id) }))
  if (props.config.default_option_id === id) extra.default_option_id = undefined
  emitOptions(options.value.filter(x => x.id !== id), extra)
  open.value = null
}

function moveToGroup(id: string, groupId: string) {
  emit('change', { groups: groups.value.map(g => ({ ...g, option_ids: g.id === groupId ? [...g.option_ids.filter(x => x !== id), id] : g.option_ids.filter(x => x !== id) })) })
}
const groupOf = (id: string) => groups.value.find(g => g.option_ids.includes(id))?.id

// ── Drag to reorder (manual sort only); within a status group it reorders that group. ──
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

/** Status: groups with their options; others: one flat section. */
const sections = computed(() => {
  if (!props.status) return [{ id: '', name: '', options: options.value }]
  const byId = new Map(options.value.map(o => [o.id, o]))
  return groups.value.map(g => ({ id: g.id, name: g.name, options: g.option_ids.map(id => byId.get(id)).filter((o): o is SelectOption => !!o) }))
})
</script>

<template>
  <div class="me-db-options">
    <div v-if="!status" class="me-db-option-sort" role="radiogroup" :aria-label="m.optionSort">
      <span class="me-menu-label">{{ m.optionSort }}</span>
      <button v-for="s in SORTS" :key="s" type="button" class="me-db-seg" role="radio" :aria-checked="mode === s" :class="{ 'is-on': mode === s }" :data-sort="s" @click="setSort(s)">{{ m.optionSorts[s] }}</button>
    </div>

    <div v-for="sec in sections" :key="sec.id" class="me-db-option-section" :data-group="sec.id || undefined">
      <div v-if="status" class="me-db-option-group-head">
        <span class="me-menu-label">{{ sec.name }}</span>
        <button type="button" class="me-db-icon-button" :aria-label="m.addOption" :title="m.addOption" data-add-to-group @click="groupDraft = { group: sec.id, name: '' }"><Plus /></button>
      </div>
      <div
        v-for="o in sec.options"
        :key="o.id"
        class="me-db-option-item"
        :class="{ 'is-over': over === o.id && dragging !== o.id }"
        :data-option="o.id"
        @dragover.prevent="over = o.id"
        @drop.prevent="onDrop(o.id)"
      >
        <div class="me-db-row me-db-option-row">
          <span
            class="me-db-row-handle me-db-option-handle"
            :draggable="mode === 'manual' || status"
            :title="m.dragToMove"
            @dragstart="dragging = o.id"
            @dragend="dragging = over = null"
          ><GripVertical /></span>
          <button type="button" class="me-db-swatch-button" :aria-label="m.optionColor" :aria-expanded="open === o.id" @click="open = open === o.id ? null : o.id">
            <span class="me-db-swatch" :data-color="o.color === 'default' ? undefined : o.color" />
          </button>
          <input class="me-input" :value="o.name" :aria-label="m.optionName" @change="update(o.id, { name: ($event.target as HTMLInputElement).value.trim() || o.name })">
          <span v-if="status && config.default_option_id === o.id" class="me-db-menu-value" data-default>{{ m.defaultBadge }}</span>
          <button type="button" class="me-db-icon-button" :aria-label="m.editOptions" :aria-expanded="open === o.id" @click="open = open === o.id ? null : o.id">
            <ChevronDown v-if="open === o.id" /><ChevronRight v-else />
          </button>
        </div>
        <div v-if="open === o.id" class="me-db-option-panel">
          <div class="me-db-swatches" role="radiogroup" :aria-label="m.optionColor">
            <button
              v-for="c in COLORS"
              :key="c"
              type="button"
              class="me-db-swatch-button"
              role="radio"
              :aria-checked="o.color === c"
              :aria-label="m.colors[c]"
              :title="m.colors[c]"
              :data-color-choice="c"
              @click="update(o.id, { color: c as OptionColor })"
            >
              <span class="me-db-swatch" :data-color="c === 'default' ? undefined : c"><Check v-if="o.color === c" /></span>
            </button>
          </div>
          <template v-if="status">
            <button type="button" class="me-menu-item" role="menuitem" data-action="set-default" @click="emit('change', { default_option_id: o.id })">
              <Star class="me-db-menu-icon" />{{ m.setAsDefault }}
            </button>
            <label class="me-db-field">
              <span class="me-menu-label">{{ m.moveToGroup }}</span>
              <select class="me-input me-db-select" :value="groupOf(o.id)" data-move-group @change="moveToGroup(o.id, ($event.target as HTMLSelectElement).value)">
                <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
              </select>
            </label>
          </template>
          <button type="button" class="me-menu-item is-danger" role="menuitem" data-action="delete-option" @click="remove(o.id)"><Trash2 class="me-db-menu-icon" />{{ m.deleteOption }}</button>
        </div>
      </div>
      <div v-if="status && groupDraft?.group === sec.id" class="me-db-row">
        <Plus class="me-db-menu-icon" />
        <input v-model="groupDraft.name" class="me-input" :placeholder="m.addOption" :aria-label="m.addOption" autofocus @keydown.enter.prevent="add(sec.id)">
      </div>
    </div>

    <div v-if="!status" class="me-db-row">
      <Plus class="me-db-menu-icon" />
      <input v-model="draft" class="me-input" :placeholder="m.addOption" :aria-label="m.addOption" @keydown.enter.prevent="add()">
    </div>
  </div>
</template>
