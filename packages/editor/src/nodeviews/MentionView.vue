<script setup lang="ts">
/**
 * @mention chip. Click (when editable):
 * - date → calendar to change the date
 * - person/page → searchable list to switch to someone/something else
 * Read-only: calls the block's `onClick`, or opens a page's link.
 */
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom'
import { Calendar, ExternalLink, FileText, User } from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import DatePicker from '../components/DatePicker.vue'
import { useScope } from '../composables/useScope'
import { type DateValue, formatDateValue, reminderTime } from '../date-utils'
import type { MentionItem, MentionOptions } from '../extensions/mention'
import { readTokenPx } from '../theme/read'

const props = defineProps(nodeViewProps)

const scope = useScope(() => props.editor)
const config = computed(() => props.editor.storage.meiConfig)
const m = computed(() => config.value.messages.mention)
const options = computed(() => props.extension.options as MentionOptions)
const kind = computed(() => (props.node.attrs.kind ?? 'user') as MentionItem['kind'])

/** A date mention's value, from its attributes (id = start date). */
const dateValue = computed<DateValue>(() => {
  const a = props.node.attrs
  return { start: a.id, end: a.end, time: a.time, endTime: a.endTime, format: a.format ?? 'relative', timeFormat: a.timeFormat, remind: a.remind }
})
/** Dates render from the stored value, so relative labels and locale stay current. */
const label = computed(() => (kind.value === 'date'
  ? formatDateValue(dateValue.value, config.value.locale, m.value)
  : props.node.attrs.label ?? props.node.attrs.id))

// --- Popover ------------------------------------------------------------------
const open = ref(false)
const chip = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)
let cleanup: (() => void) | null = null

// Close on clicks outside the popover — but not on the chip itself (it toggles).
function onDocPointer(e: PointerEvent) {
  if (!open.value) return
  const t = e.target as Node
  if (panel.value?.contains(t) || chip.value?.contains(t)) return
  close()
}
onMounted(() => document.addEventListener('pointerdown', onDocPointer, true))

function position() {
  const el = panel.value
  const ref = chip.value
  if (!el || !ref) return
  const gap = readTokenPx(props.editor.view.dom, 'popover.offset')
  cleanup?.()
  cleanup = autoUpdate(ref, el, () => {
    computePosition(ref, el, { placement: 'bottom-start', strategy: 'fixed', middleware: [offset(gap), flip({ padding: gap }), shift({ padding: gap })] })
      .then(({ x, y }) => Object.assign(el.style, { left: `${x}px`, top: `${y}px` }))
  })
}

function onClick(e: MouseEvent) {
  if (!props.editor.isEditable) {
    const item = props.node.attrs as MentionItem
    if (options.value.onClick) options.value.onClick(item)
    else if (item.href) window.open(item.href, '_blank', 'noopener')
    return
  }
  e.preventDefault()
  if (open.value) return close()
  open.value = true
  query.value = ''
  nextTick(() => {
    position()
    searchInput.value?.focus()
  })
}

function close() {
  open.value = false
  cleanup?.()
  cleanup = null
}

function apply(attrs: Record<string, unknown>) {
  props.updateAttributes(attrs)
  close()
  props.editor.commands.focus()
}

// --- Date ---------------------------------------------------------------------
/** Saves changes right away and keeps the picker open (like Notion). */
function changeDate(next: DateValue) {
  const before = dateValue.value.remind ?? null
  props.updateAttributes({
    id: next.start,
    end: next.end ?? null,
    time: next.time ?? null,
    endTime: next.endTime ?? null,
    format: next.format ?? 'relative',
    timeFormat: next.timeFormat ?? null,
    remind: next.remind ?? null,
    // Plain-text label (copy/export): absolute, so it doesn't go stale.
    label: formatDateValue({ ...next, format: next.format === 'relative' ? 'short' : next.format }, config.value.locale),
  })
  if ((next.remind ?? null) !== before || (next.remind && (next.start !== dateValue.value.start || next.time !== dateValue.value.time))) {
    const fireAt = reminderTime(next)
    options.value.onRemind?.(fireAt && next.remind ? { date: next.start, time: next.time ?? null, remind: next.remind, fireAt } : null, next)
  }
}
function clearDate() {
  close()
  props.deleteNode()
  props.editor.commands.focus()
}

// --- People / pages -------------------------------------------------------------
const query = ref('')
const results = shallowRef<MentionItem[]>([])
const active = ref(0)
const searchInput = ref<HTMLInputElement | null>(null)
let searchToken = 0

watch([query, open], async () => {
  if (!open.value || kind.value === 'date') return
  const token = ++searchToken
  const found = options.value.search ? await options.value.search(query.value) : []
  if (token !== searchToken) return
  results.value = found.filter(r => r.kind !== 'date')
  active.value = 0
})

function pickItem(item: MentionItem) {
  apply({ id: item.id, label: item.label, kind: item.kind, href: item.href ?? null, avatar: item.avatar ?? null })
}

function onKeydown(e: KeyboardEvent) {
  e.stopPropagation()
  const n = results.value.length
  if (e.key === 'Escape') {
    close()
    props.editor.commands.focus()
  }
  else if (n && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault()
    active.value = (active.value + (e.key === 'ArrowDown' ? 1 : n - 1)) % n
  }
  else if (e.key === 'Enter' && results.value[active.value]) {
    e.preventDefault()
    pickItem(results.value[active.value]!)
  }
}

const ICONS = { user: User, page: FileText, date: Calendar }
onBeforeUnmount(() => {
  cleanup?.()
  document.removeEventListener('pointerdown', onDocPointer, true)
})
</script>

<template>
  <NodeViewWrapper as="span" class="me-mention-wrap">
    <span
      ref="chip"
      class="me-mention"
      :class="[`me-mention--${kind}`, { 'is-selected': selected, 'is-open': open }]"
      :data-kind="kind"
      @click="onClick"
    >
      <img v-if="kind === 'user' && node.attrs.avatar" class="me-mention-avatar" :src="node.attrs.avatar" alt="">
      <FileText v-else-if="kind === 'page'" class="me-mention-icon" />
      <span>{{ kind === 'page' ? '' : '@' }}{{ label }}</span>
    </span>

    <Teleport to="body">
      <div
        v-if="open"
        ref="panel"
        v-bind="scope"
        class="me-popover me-mention-popover"
        :class="{ 'me-mention-popover--date': kind === 'date' }"
        contenteditable="false"
        @mousedown.stop
        @keydown="onKeydown"
      >
        <DatePicker
          v-if="kind === 'date'"
          :value="dateValue"
          :locale="config.locale"
          :messages="config.messages.datePicker"
          :relative="m"
          :help-url="options.reminderHelpUrl"
          @change="changeDate"
          @clear="clearDate"
        />
        <template v-else>
          <input ref="searchInput" v-model="query" class="me-input me-mention-search" :placeholder="m.searchPlaceholder">
          <div class="me-mention-results">
            <button
              v-for="(item, i) in results"
              :key="`${item.kind}-${item.id}`"
              type="button"
              class="me-menu-item"
              :class="{ 'is-active': i === active, 'is-current': item.id === node.attrs.id }"
              @mouseenter="active = i"
              @click="pickItem(item)"
            >
              <img v-if="item.avatar" class="me-menu-icon me-avatar" :src="item.avatar" alt="">
              <span v-else class="me-menu-icon"><component :is="ICONS[item.kind]" /></span>
              <span class="me-menu-text">
                <span class="me-menu-title">{{ item.label }}</span>
                <span v-if="item.description" class="me-menu-desc">{{ item.description }}</span>
              </span>
            </button>
            <div v-if="!results.length" class="me-menu-empty">
              {{ options.search ? m.empty : m.noSearch }}
            </div>
          </div>
          <a v-if="kind === 'page' && node.attrs.href" class="me-menu-item me-mention-open" :href="node.attrs.href" target="_blank" rel="noopener noreferrer">
            <span class="me-menu-icon"><ExternalLink /></span>
            <span class="me-menu-title me-menu-text">{{ m.openPage }}</span>
          </a>
        </template>
      </div>
    </Teleport>
  </NodeViewWrapper>
</template>
