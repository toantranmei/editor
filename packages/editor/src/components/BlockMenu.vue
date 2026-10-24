<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import type { Component } from 'vue'
import { ArrowDown, ArrowUp, Check, ChevronRight, Copy, Link2, Palette, Repeat2, Search, Trash } from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { type BlockType, blockTitle, turnIntoBlocks } from '../block-items'
import {
  type BlockRange, blocksIn, colorBlocks, deleteBlocks, duplicateBlocks, moveBlocks, rangeColors, turnBlocksInto,
} from '../block-ops'
import type { ColorName } from '../colors'
import { useClickOutside } from '../composables/useClickOutside'
import { useScope } from '../composables/useScope'
import { TURN_INTO_SHORTCUTS } from '../extensions/block-selection'
import { isMod, kbd } from '../keys'
import { pushRecentColor, recent } from '../recent'
import { readTokenPx } from '../theme/read'
import ColorList, { colorRows } from './ColorList.vue'

const props = defineProps<{
  editor: Editor
  range: BlockRange
  anchor: DOMRect
}>()
const emit = defineEmits<{ close: [], copyLink: [id: string] }>()

const root = ref<HTMLElement | null>(null)
const input = ref<HTMLInputElement | null>(null)
useClickOutside(root, ref(true), () => emit('close'))

const m = computed(() => props.editor.storage.meiConfig.messages)
const scope = useScope(() => props.editor)
const blocks = computed(() => blocksIn(props.editor.state.doc, props.range))
const targets = computed(() => turnIntoBlocks(props.editor))
/** Current type when every selected block has the same one. */
const current = computed(() => {
  const types = blocks.value.map(b => targets.value.find(t => t.matches?.(b.node))?.id)
  return types.every(t => t && t === types[0]) ? targets.value.find(t => t.id === types[0]) : undefined
})
const canTurnInto = computed(() => blocks.value.every(b => targets.value.some(t => t.matches?.(b.node)) || b.node.type.name === 'callout'))
const hasText = computed(() => blocks.value.some(b => b.node.textContent.length > 0 || b.node.isTextblock))
const colors = computed(() => rangeColors(props.editor.state, props.range))
const blockId = computed(() => (blocks.value.length === 1 ? blocks.value[0]!.node.attrs.id as string | undefined : undefined))

// --- Rows ------------------------------------------------------------------
interface Row {
  key: string
  label: string
  icon?: Component
  /** Swatch for color rows. */
  swatch?: { kind: 'text' | 'bg', color: ColorName }
  hint?: string
  checked?: boolean
  submenu?: 'turn' | 'color'
  group?: string
  run?: () => void
}

function done(fn: () => void) {
  emit('close')
  fn()
}
const shortcutFor = (b: BlockType) => {
  const key = Object.entries(TURN_INTO_SHORTCUTS).find(([, id]) => id === b.id)?.[0]
  return key ? kbd(`Mod-Alt-${key}`) : undefined
}
const turnInto = (b: BlockType) => done(() => turnBlocksInto(props.editor, props.range, b))
function pickColor(kind: 'text' | 'bg', color: ColorName) {
  if (color !== 'default') pushRecentColor({ kind, color })
  done(() => colorBlocks(props.editor, props.range, kind, color))
}

const actions = computed<Row[]>(() => [
  { key: 'delete', label: m.value.blockMenu.delete, icon: Trash, hint: kbd('Delete'), run: () => done(() => deleteBlocks(props.editor, props.range)) },
  { key: 'duplicate', label: m.value.blockMenu.duplicate, icon: Copy, hint: kbd('Mod-d'), run: () => done(() => duplicateBlocks(props.editor, props.range)) },
  ...(blockId.value ? [{ key: 'link', label: m.value.blockMenu.copyLink, icon: Link2, run: () => done(() => emit('copyLink', blockId.value!)) }] : []),
  { key: 'up', label: m.value.blockMenu.moveUp, icon: ArrowUp, hint: kbd('Mod-Shift-ArrowUp'), run: () => done(() => moveBlocks(props.editor, props.range, 'up')) },
  { key: 'down', label: m.value.blockMenu.moveDown, icon: ArrowDown, hint: kbd('Mod-Shift-ArrowDown'), run: () => done(() => moveBlocks(props.editor, props.range, 'down')) },
  ...(canTurnInto.value ? [{ key: 'turn', label: m.value.blockMenu.turnInto, icon: Repeat2, submenu: 'turn' as const }] : []),
  ...(hasText.value ? [{ key: 'color', label: m.value.blockMenu.color, icon: Palette, submenu: 'color' as const }] : []),
])

const turnRows = computed<Row[]>(() => targets.value.map(b => ({
  key: `turn-${b.id}`,
  label: blockTitle(m.value, b),
  icon: b.icon,
  hint: shortcutFor(b),
  checked: current.value?.id === b.id,
  group: m.value.blockMenu.turnInto,
  run: () => turnInto(b),
})))
const colorRowList = computed(() => colorRows(recent.value.colors))

// --- Search ----------------------------------------------------------------
const query = ref('')
const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase()

/** Main list: actions; while searching, also matching turn-into types and colors. */
const rows = computed<Row[]>(() => {
  const q = normalize(query.value.trim())
  if (!q) return actions.value
  const match = (r: Row) => normalize(`${r.group ?? ''} ${r.label}`).includes(q)
  const colorMatches: Row[] = hasText.value
    ? colorRowList.value.filter(r => r.section !== 'recent').map(r => ({
        key: `color-${r.kind}-${r.color}`,
        label: r.kind === 'text' ? m.value.slash.textColor(m.value.colors[r.color] ?? r.color) : m.value.slash.bgColor(m.value.colors[r.color] ?? r.color),
        swatch: { kind: r.kind, color: r.color },
        group: m.value.blockMenu.color,
        run: () => pickColor(r.kind, r.color),
      }))
    : []
  return [
    ...actions.value.filter(r => !r.submenu).map(r => ({ ...r, group: m.value.blockMenu.actions })),
    ...(canTurnInto.value ? turnRows.value : []),
    ...colorMatches,
  ].filter(match)
})

// --- Navigation --------------------------------------------------------------
const active = ref(0)
const submenu = ref<'turn' | 'color' | null>(null)
const subActive = ref(-1)
const subCount = computed(() => (submenu.value === 'turn' ? turnRows.value.length : submenu.value === 'color' ? colorRowList.value.length : 0))

watch(query, () => {
  active.value = 0
  submenu.value = null
})

function scrollActive() {
  nextTick(() => root.value?.querySelector('.me-menu-item.is-active:not(.has-submenu-open), .me-submenu .me-menu-item.is-active')?.scrollIntoView({ block: 'nearest' }))
}

function openSubmenu(which: 'turn' | 'color', focusFirst = false) {
  submenu.value = which
  subActive.value = focusFirst ? 0 : -1
}

function runRow(row: Row | undefined) {
  if (!row) return
  if (row.submenu) return openSubmenu(row.submenu, true)
  row.run?.()
}

function runSubmenuItem(index: number) {
  if (submenu.value === 'turn') return runRow(turnRows.value[index])
  const row = colorRowList.value[index]
  if (row) pickColor(row.kind, row.color)
}

function onKeydown(e: KeyboardEvent) {
  const inSub = submenu.value && subActive.value >= 0
  const count = inSub ? subCount.value : rows.value.length
  const move = (delta: number) => {
    e.preventDefault()
    if (!count) return
    if (inSub) subActive.value = (subActive.value + delta + count) % count
    else active.value = (active.value + delta + count) % count
    scrollActive()
  }

  if (e.key === 'ArrowDown') return move(1)
  if (e.key === 'ArrowUp' && !e.shiftKey && !isMod(e)) return move(-1)
  if (e.key === 'ArrowRight' && !inSub && rows.value[active.value]?.submenu) {
    e.preventDefault()
    return openSubmenu(rows.value[active.value]!.submenu!, true)
  }
  if ((e.key === 'ArrowLeft' || e.key === 'Escape') && submenu.value) {
    e.preventDefault()
    submenu.value = null
    return
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    return emit('close')
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    return inSub ? runSubmenuItem(subActive.value) : runRow(rows.value[active.value])
  }
  // Menu shortcuts (only when not editing the search text).
  if ((e.key === 'Delete' || e.key === 'Backspace') && !query.value) {
    e.preventDefault()
    return done(() => deleteBlocks(props.editor, props.range))
  }
  if (isMod(e) && e.key.toLowerCase() === 'd') {
    e.preventDefault()
    return done(() => duplicateBlocks(props.editor, props.range))
  }
  if (isMod(e) && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    e.preventDefault()
    return done(() => moveBlocks(props.editor, props.range, e.key === 'ArrowUp' ? 'up' : 'down'))
  }
}

// Hover intent: submenus open/close after a short delay so diagonal mouse moves don't flicker.
let timer: ReturnType<typeof setTimeout> | undefined
function hoverRow(index: number) {
  active.value = index
  clearTimeout(timer)
  const target = rows.value[index]?.submenu ?? null
  if (target === submenu.value) return
  timer = setTimeout(() => {
    if (target) openSubmenu(target)
    else submenu.value = null
  }, 150)
}
const keepSubmenu = () => clearTimeout(timer)

// --- Position --------------------------------------------------------------
// Below the handle, kept inside the viewport (the menu is at most ~420px tall).
const gap = readTokenPx(props.editor.view.dom, 'popover.offset')
const style = computed(() => {
  const top = Math.min(props.anchor.bottom + gap, window.innerHeight - 420)
  return { left: `${Math.max(gap, props.anchor.left)}px`, top: `${Math.max(gap, top)}px` }
})
// Open submenus to the left when there's no room on the right.
const flipSubmenu = computed(() => {
  const el = props.editor.view.dom
  const width = readTokenPx(el, 'menu.width') + readTokenPx(el, 'menu.submenuWidth') + gap * 2
  return props.anchor.left + width > window.innerWidth
})

onMounted(() => input.value?.focus({ preventScroll: true }))
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <Teleport to="body">
    <div
      ref="root"
      v-bind="scope"
      class="me-popover me-floating me-block-menu"
      :class="{ 'is-flipped': flipSubmenu }"
      :style="style"
      @keydown="onKeydown"
    >
      <label class="me-menu-search">
        <Search />
        <input ref="input" v-model="query" class="me-menu-search-input" :placeholder="m.blockMenu.search">
      </label>
      <div v-if="blocks.length > 1" class="me-menu-label">
        {{ m.blockMenu.selected(blocks.length) }}
      </div>

      <!-- Scrolls only while searching: in the action list, submenus sit outside the box. -->
      <div class="me-block-menu-list" :class="{ 'is-scroll': query }">
      <template v-for="(row, i) in rows" :key="row.key">
        <div v-if="query && row.group && (i === 0 || rows[i - 1]!.group !== row.group)" class="me-menu-label">
          {{ row.group }}
        </div>
        <div class="me-submenu-anchor" @mouseenter="hoverRow(i)">
          <button
            type="button"
            class="me-menu-item"
            :class="{ 'is-active': i === active, 'has-submenu-open': row.submenu && submenu === row.submenu }"
            @mousedown.prevent
            @click="runRow(row)"
          >
            <span v-if="row.swatch" class="me-menu-icon" :class="row.swatch.kind === 'text' ? 'me-swatch--text' : 'me-swatch--bg'" :data-color="row.swatch.color === 'default' ? undefined : row.swatch.color">A</span>
            <span v-else class="me-menu-icon"><component :is="row.icon" /></span>
            <span class="me-menu-title me-menu-text">{{ row.label }}</span>
            <Check v-if="row.checked" class="me-menu-check" />
            <span v-if="row.hint" class="me-menu-shortcut">{{ row.hint }}</span>
            <ChevronRight v-if="row.submenu" class="me-menu-chevron" />
          </button>

          <div v-if="row.submenu && submenu === row.submenu" class="me-popover me-submenu" @mouseenter="keepSubmenu" @mousedown.prevent>
            <template v-if="row.submenu === 'turn'">
              <button
                v-for="(t, ti) in turnRows"
                :key="t.key"
                type="button"
                class="me-menu-item"
                :class="{ 'is-active': ti === subActive }"
                @mouseenter="subActive = ti"
                @click="t.run?.()"
              >
                <span class="me-menu-icon"><component :is="t.icon" /></span>
                <span class="me-menu-title me-menu-text">{{ t.label }}</span>
                <Check v-if="t.checked" class="me-menu-check" />
                <span v-if="t.hint" class="me-menu-shortcut">{{ t.hint }}</span>
              </button>
            </template>
            <ColorList
              v-else
              :messages="m"
              :recent="recent.colors"
              :current="colors"
              :active-index="subActive"
              @hover="subActive = $event"
              @pick="pickColor"
            />
          </div>
        </div>
      </template>
      </div>
      <div v-if="!rows.length" class="me-menu-empty">
        {{ m.blockMenu.noResults }}
      </div>
    </div>
  </Teleport>
</template>
