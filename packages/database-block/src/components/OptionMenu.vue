<script setup lang="ts">
/**
 * Menu of one option of a select / multi-select / status property (Notion's option menu): its name, Delete, then for
 * status "Set as default" and "Group ›", then the colors. Works on a property `config` and emits patches of it, so
 * the same menu serves an existing property (the caller saves) and one being created (the caller keeps the draft).
 */
import { Check, ChevronRight, Flag, Trash2 } from '@lucide/vue'
import { COLORS } from '@toantranmei/editor'
import { computed, nextTick, onMounted, ref } from 'vue'
import { useDb } from '../context'
import type { OptionColor, PropConfig, StatusGroup } from '../types'
import DbPopover from './DbPopover.vue'

const props = defineProps<{
  config: PropConfig
  optionId: string
  anchor: HTMLElement | null
  status?: boolean
}>()
const emit = defineEmits<{ change: [patch: Partial<PropConfig>], removed: [id: string], close: [] }>()
const db = useDb()
const m = computed(() => db.m.value)
const options = computed(() => props.config.options ?? [])
const groups = computed<StatusGroup[]>(() => props.config.groups ?? [])
const option = computed(() => options.value.find(o => o.id === props.optionId))
const groupOf = computed(() => groups.value.find(g => g.option_ids.includes(props.optionId)))
const isDefault = computed(() => props.config.default_option_id === props.optionId)
const name = ref(option.value?.name ?? '')
const input = ref<HTMLInputElement | null>(null)
const groupAnchor = ref<HTMLElement | null>(null)

onMounted(() => nextTick(() => {
  input.value?.focus()
  input.value?.select()
}))

const update = (patch: { name?: string, color?: OptionColor }) =>
  emit('change', { options: options.value.map(o => (o.id === props.optionId ? { ...o, ...patch } : o)) })

function rename() {
  const n = name.value.trim()
  if (n && option.value && n !== option.value.name) update({ name: n })
}
function remove() {
  const patch: Partial<PropConfig> = { options: options.value.filter(o => o.id !== props.optionId) }
  if (props.status) patch.groups = groups.value.map(g => ({ ...g, option_ids: g.option_ids.filter(x => x !== props.optionId) }))
  if (isDefault.value) patch.default_option_id = undefined
  emit('change', patch)
  emit('removed', props.optionId)
  emit('close')
}
function moveTo(groupId: string) {
  emit('change', { groups: groups.value.map(g => ({ ...g, option_ids: g.id === groupId ? [...g.option_ids.filter(x => x !== props.optionId), props.optionId] : g.option_ids.filter(x => x !== props.optionId) })) })
  groupAnchor.value = null
}
function close() {
  rename()
  emit('close')
}
</script>

<template>
  <DbPopover :anchor="anchor" :scope="db.scope.value" placement="right" :label="option?.name" @close="close">
    <div v-if="option" class="me-menu me-db-menu me-db-option-menu" role="menu" :data-option-menu="optionId">
      <input
        ref="input"
        v-model="name"
        class="me-input"
        :aria-label="m.optionName"
        data-option-name
        @keydown.enter.prevent="close"
        @blur="rename"
      >
      <button type="button" class="me-menu-item is-danger" role="menuitem" data-action="delete-option" @click="remove">
        <Trash2 class="me-db-menu-icon" />{{ m.deleteOption }}
      </button>
      <template v-if="status">
        <button type="button" class="me-menu-item" role="menuitem" data-action="set-default" :disabled="isDefault" @click="emit('change', { default_option_id: optionId })">
          <Flag class="me-db-menu-icon" /><span class="me-menu-title">{{ m.setAsDefault }}</span>
        </button>
        <button
          type="button"
          class="me-menu-item"
          role="menuitem"
          data-action="move-group"
          :aria-expanded="!!groupAnchor"
          @click="groupAnchor = groupAnchor ? null : ($event.currentTarget as HTMLElement)"
        >
          <span class="me-menu-title">{{ m.moveToGroup }}</span><span class="me-db-menu-value">{{ groupOf?.name }}</span><ChevronRight class="me-db-menu-end" />
        </button>
      </template>
      <div class="me-db-separator" role="separator" />
      <div class="me-menu-label">{{ m.optionColor }}</div>
      <button
        v-for="c in COLORS"
        :key="c"
        type="button"
        class="me-menu-item"
        role="menuitemradio"
        :aria-checked="option.color === c"
        :data-color-choice="c"
        @click="update({ color: c as OptionColor })"
      >
        <span class="me-db-swatch" :data-color="c === 'default' ? undefined : c" />
        <span class="me-menu-title">{{ m.colors[c] }}</span>
        <Check v-if="option.color === c" class="me-db-menu-end" />
      </button>
    </div>
  </DbPopover>
  <DbPopover v-if="groupAnchor" :anchor="groupAnchor" :scope="db.scope.value" placement="right" :label="m.moveToGroup" @close="groupAnchor = null">
    <div class="me-menu me-db-menu" role="menu">
      <button
        v-for="g in groups"
        :key="g.id"
        type="button"
        class="me-menu-item"
        role="menuitemradio"
        :aria-checked="groupOf?.id === g.id"
        :data-group-choice="g.id"
        @click="moveTo(g.id)"
      >
        <span class="me-menu-title">{{ g.name }}</span><Check v-if="groupOf?.id === g.id" class="me-db-menu-end" />
      </button>
    </div>
  </DbPopover>
</template>
