<script setup lang="ts">
/**
 * Notion-style table controls, drawn over the editor:
 * - grip handles on the hovered row (left) and column (top) → row/column menu
 * - "+" bars below and to the right of the table to add a row / column
 * - a small toolbar for multi-cell selections (merge, split, color, clear)
 */
import type { Editor } from '@tiptap/vue-3'
import type { Component } from 'vue'
import {
  ArrowDown, ArrowDownToLine, ArrowLeft, ArrowLeftToLine, ArrowRight, ArrowRightToLine, ArrowUp, ArrowUpToLine,
  Check, ChevronRight, Copy, Eraser, GripHorizontal, GripVertical, Palette, PanelLeft, PanelTop, Plus,
  TableCellsMerge, TableCellsSplit, Trash,
} from '@lucide/vue'
import { CellSelection } from '@tiptap/pm/tables'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { COLORS } from '../colors'
import { useClickOutside } from '../composables/useClickOutside'
import { useScope } from '../composables/useScope'
import {
  clearSelectedCells, colorSelectedCells, deleteColumn, deleteRow, duplicateColumn, duplicateRow, hasHeaderColumn,
  hasHeaderRow, insertColumn, insertRow, moveColumn, moveRow, selectColumn, selectRow, tableAt, type TableRef, toggleHeader,
} from '../table-ops'

const props = defineProps<{ editor: Editor }>()

const scope = useScope(() => props.editor)
const m = computed(() => props.editor.storage.meiConfig.messages.table)
const colorNames = computed(() => props.editor.storage.meiConfig.messages.colors)
const layer = ref<HTMLElement | null>(null)

// --- Hover tracking -----------------------------------------------------------
interface Hover { tablePos: number, row: number, col: number, table: DOMRect, visible: DOMRect, rowRect: DOMRect, colRect: DOMRect }
const hover = shallowRef<Hover | null>(null)
let hideTimer: ReturnType<typeof setTimeout> | undefined
let frame = 0

/** Rect relative to the controls layer (which covers the editor root). */
function local(r: DOMRect) {
  const base = layer.value!.getBoundingClientRect()
  return new DOMRect(r.left - base.left, r.top - base.top, r.width, r.height)
}

function locate(cell: HTMLElement): Hover | null {
  const { view } = props.editor
  const tableEl = cell.closest('table')
  const wrapper = cell.closest('.tableWrapper') ?? tableEl
  if (!tableEl || !wrapper || !layer.value) return null
  const $pos = view.state.doc.resolve(view.posAtDOM(cell, 0))
  let depth = $pos.depth
  while (depth > 0 && !['tableCell', 'tableHeader'].includes($pos.node(depth).type.name)) depth--
  if (depth < 2) return null
  const tablePos = $pos.before(depth - 2)
  const t = tableAt(props.editor, tablePos)
  if (!t) return null
  const rect = t.map.findCell($pos.before(depth) - tablePos - 1)
  const tableRect = tableEl.getBoundingClientRect()
  const wrapRect = wrapper.getBoundingClientRect()
  const visible = new DOMRect(tableRect.left, tableRect.top, Math.min(tableRect.right, wrapRect.right) - tableRect.left, tableRect.height)
  return {
    tablePos,
    row: rect.top,
    col: rect.left,
    table: local(tableRect),
    visible: local(visible),
    rowRect: local((cell.parentElement as HTMLElement).getBoundingClientRect()),
    colRect: local(cell.getBoundingClientRect()),
  }
}

function onMouseMove(e: MouseEvent) {
  if (menu.value || !props.editor.isEditable) return
  const target = e.target as HTMLElement | null
  if (target?.closest('.me-table-controls-ui')) {
    clearTimeout(hideTimer)
    return
  }
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    const cell = target?.closest('td, th') as HTMLElement | null
    if (cell && props.editor.view.dom.contains(cell)) {
      clearTimeout(hideTimer)
      hover.value = locate(cell)
    }
    else if (hover.value) {
      clearTimeout(hideTimer)
      hideTimer = setTimeout(() => (hover.value = null), 250)
    }
  })
}

const table = computed<TableRef | null>(() => {
  void tick.value
  return hover.value ? tableAt(props.editor, hover.value.tablePos) : null
})

// Re-read the table after edits (positions and sizes change).
const tick = ref(0)
const onUpdate = () => {
  tick.value++
  if (hover.value && !tableAt(props.editor, hover.value.tablePos)) hover.value = null
}

// --- Menus --------------------------------------------------------------------
interface Item { key: string, label: string, icon: Component, run?: () => void, checked?: boolean, danger?: boolean, disabled?: boolean, submenu?: boolean }
const menu = shallowRef<{ kind: 'row' | 'col', index: number, tablePos: number, x: number, y: number, above: boolean } | null>(null)
const colorOpen = ref(false)
const menuEl = ref<HTMLElement | null>(null)
useClickOutside(menuEl, computed(() => !!menu.value), () => closeMenu())

function openMenu(kind: 'row' | 'col', e: MouseEvent) {
  const h = hover.value
  const t = table.value
  if (!h || !t) return
  if (kind === 'row') selectRow(props.editor, t, h.row)
  else selectColumn(props.editor, t, h.col)
  const screen = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const r = local(screen)
  // Open upwards when the handle is in the lower part of the viewport (menu is ~360px tall).
  const above = screen.bottom + 360 > window.innerHeight
  menu.value = { kind, index: kind === 'row' ? h.row : h.col, tablePos: h.tablePos, x: r.left, y: r.bottom + 4, above }
  colorOpen.value = false
}

function closeMenu() {
  menu.value = null
  colorOpen.value = false
}

function run(fn: () => void) {
  fn()
  closeMenu()
  props.editor.commands.focus()
}

const menuItems = computed<Item[]>(() => {
  const mn = menu.value
  void tick.value
  const t = mn && tableAt(props.editor, mn.tablePos)
  if (!mn || !t) return []
  const ed = props.editor
  const i = mn.index
  const t2 = m.value
  if (mn.kind === 'row') {
    return [
      ...(i === 0 ? [{ key: 'header', label: t2.headerRow, icon: PanelTop, checked: hasHeaderRow(t), run: () => toggleHeader(ed, t, 'row') }] : []),
      { key: 'above', label: t2.insertAbove, icon: ArrowUpToLine, run: () => insertRow(ed, t, i, 'before') },
      { key: 'below', label: t2.insertBelow, icon: ArrowDownToLine, run: () => insertRow(ed, t, i, 'after') },
      { key: 'dup', label: t2.duplicate, icon: Copy, run: () => duplicateRow(ed, t, i) },
      { key: 'up', label: t2.moveUp, icon: ArrowUp, disabled: i === 0, run: () => moveRow(ed, t, i, i - 1) },
      { key: 'down', label: t2.moveDown, icon: ArrowDown, disabled: i === t.map.height - 1, run: () => moveRow(ed, t, i, i + 1) },
      { key: 'clear', label: t2.clear, icon: Eraser, run: () => clearSelectedCells(ed) },
      { key: 'color', label: t2.color, icon: Palette, submenu: true },
      { key: 'delete', label: t2.deleteRow, icon: Trash, danger: true, run: () => deleteRow(ed, t, i) },
    ]
  }
  return [
    ...(i === 0 ? [{ key: 'header', label: t2.headerColumn, icon: PanelLeft, checked: hasHeaderColumn(t), run: () => toggleHeader(ed, t, 'column') }] : []),
    { key: 'left', label: t2.insertLeft, icon: ArrowLeftToLine, run: () => insertColumn(ed, t, i, 'before') },
    { key: 'right', label: t2.insertRight, icon: ArrowRightToLine, run: () => insertColumn(ed, t, i, 'after') },
    { key: 'dup', label: t2.duplicate, icon: Copy, run: () => duplicateColumn(ed, t, i) },
    { key: 'mleft', label: t2.moveLeft, icon: ArrowLeft, disabled: i === 0, run: () => moveColumn(ed, t, i, i - 1) },
    { key: 'mright', label: t2.moveRight, icon: ArrowRight, disabled: i === t.map.width - 1, run: () => moveColumn(ed, t, i, i + 1) },
    { key: 'clear', label: t2.clear, icon: Eraser, run: () => clearSelectedCells(ed) },
    { key: 'color', label: t2.color, icon: Palette, submenu: true },
    { key: 'delete', label: t2.deleteColumn, icon: Trash, danger: true, run: () => deleteColumn(ed, t, i) },
  ]
})

function onMenuKey(e: KeyboardEvent) {
  if (e.key === 'Escape') closeMenu()
}

// --- Add row / column -----------------------------------------------------------
function addRow() {
  const t = table.value
  if (t) insertRow(props.editor, t, t.map.height - 1, 'after')
}
function addColumn() {
  const t = table.value
  if (t) insertColumn(props.editor, t, t.map.width - 1, 'after')
}

// --- Multi-cell toolbar -------------------------------------------------------------
const selection = shallowRef<{ x: number, y: number, canMerge: boolean, canSplit: boolean } | null>(null)
const cellColorOpen = ref(false)
function onSelection() {
  const sel = props.editor.state.selection
  if (!(sel instanceof CellSelection) || menu.value || !layer.value) {
    selection.value = null
    cellColorOpen.value = false
    return
  }
  let top = Infinity
  let left = Infinity
  sel.forEachCell((_cell, pos) => {
    const dom = props.editor.view.nodeDOM(pos)
    if (dom instanceof HTMLElement) {
      const r = local(dom.getBoundingClientRect())
      top = Math.min(top, r.top)
      left = Math.min(left, r.left)
    }
  })
  if (!Number.isFinite(top)) return
  selection.value = { x: left, y: top, canMerge: props.editor.can().mergeCells(), canSplit: props.editor.can().splitCell() }
}

const bgColors = COLORS

onMounted(() => {
  document.addEventListener('mousemove', onMouseMove)
  props.editor.on('update', onUpdate)
  props.editor.on('selectionUpdate', onSelection)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onMouseMove)
  props.editor.off('update', onUpdate)
  props.editor.off('selectionUpdate', onSelection)
  clearTimeout(hideTimer)
  cancelAnimationFrame(frame)
})
</script>

<template>
  <div ref="layer" class="me-table-controls">
    <template v-if="hover && table && !menu">
      <button
        type="button"
        class="me-table-controls-ui me-table-grip me-table-grip--row"
        :style="{ left: `${hover.table.left}px`, top: `${hover.rowRect.top}px`, height: `${hover.rowRect.height}px` }"
        :title="m.rowMenu"
        @mousedown.prevent
        @click="openMenu('row', $event)"
      >
        <GripVertical />
      </button>
      <button
        type="button"
        class="me-table-controls-ui me-table-grip me-table-grip--col"
        :style="{ left: `${hover.colRect.left}px`, top: `${hover.table.top}px`, width: `${hover.colRect.width}px` }"
        :title="m.columnMenu"
        @mousedown.prevent
        @click="openMenu('col', $event)"
      >
        <GripHorizontal />
      </button>
      <button
        type="button"
        class="me-table-controls-ui me-table-add me-table-add--row"
        :style="{ left: `${hover.visible.left}px`, top: `${hover.table.top + hover.table.height}px`, width: `${hover.visible.width}px` }"
        :title="m.addRow"
        @mousedown.prevent
        @click="addRow"
      >
        <Plus />
      </button>
      <button
        type="button"
        class="me-table-controls-ui me-table-add me-table-add--col"
        :style="{ left: `${hover.visible.left + hover.visible.width}px`, top: `${hover.table.top}px`, height: `${hover.table.height}px` }"
        :title="m.addColumn"
        @mousedown.prevent
        @click="addColumn"
      >
        <Plus />
      </button>
    </template>

    <div
      v-if="menu"
      ref="menuEl"
      v-bind="scope"
      class="me-table-controls-ui me-popover me-block-menu me-table-menu"
      :class="{ 'is-above': menu.above }"
      :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
      tabindex="-1"
      @keydown="onMenuKey"
      @mousedown.prevent
    >
      <div v-for="item in menuItems" :key="item.key" class="me-submenu-anchor" @mouseenter="colorOpen = !!item.submenu">
        <button
          type="button"
          class="me-menu-item"
          :class="{ 'is-danger': item.danger, 'is-active': item.submenu && colorOpen }"
          :disabled="item.disabled"
          @click="item.submenu ? (colorOpen = !colorOpen) : run(item.run!)"
        >
          <span class="me-menu-icon"><component :is="item.icon" /></span>
          <span class="me-menu-title me-menu-text">{{ item.label }}</span>
          <Check v-if="item.checked" class="me-menu-check" />
          <ChevronRight v-if="item.submenu" class="me-menu-chevron" />
        </button>
        <div v-if="item.submenu && colorOpen" class="me-popover me-submenu">
          <button v-for="c in bgColors" :key="c" type="button" class="me-menu-item" @click="run(() => colorSelectedCells(editor, c))">
            <span class="me-menu-icon me-swatch--bg" :data-color="c === 'default' ? undefined : c">A</span>
            <span class="me-menu-title me-menu-text">{{ colorNames[c] }}</span>
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="selection && !menu"
      v-bind="scope"
      class="me-table-controls-ui me-popover me-toolbar me-table-toolbar"
      :style="{ left: `${selection.x}px`, top: `${selection.y}px` }"
      @mousedown.prevent
    >
      <button v-if="selection.canMerge" type="button" class="me-tool-btn" :title="m.merge" @click="editor.chain().focus().mergeCells().run()">
        <TableCellsMerge /> {{ m.merge }}
      </button>
      <button v-if="selection.canSplit" type="button" class="me-tool-btn" :title="m.split" @click="editor.chain().focus().splitCell().run()">
        <TableCellsSplit /> {{ m.split }}
      </button>
      <span class="me-submenu-anchor">
        <button type="button" class="me-tool-btn" :title="m.color" @click="cellColorOpen = !cellColorOpen">
          <Palette />
        </button>
        <div v-if="cellColorOpen" class="me-popover me-toolbar-panel me-menu">
          <button v-for="c in bgColors" :key="c" type="button" class="me-menu-item" @click="colorSelectedCells(editor, c); cellColorOpen = false">
            <span class="me-menu-icon me-swatch--bg" :data-color="c === 'default' ? undefined : c">A</span>
            <span class="me-menu-title me-menu-text">{{ colorNames[c] }}</span>
          </button>
        </div>
      </span>
      <button type="button" class="me-tool-btn" :title="m.clear" @click="clearSelectedCells(editor)">
        <Eraser />
      </button>
    </div>
  </div>
</template>
