/**
 * Table operations used by the table controls (row/column handles, add buttons,
 * cell toolbar). Rows and columns are addressed by index within a table at `tablePos`.
 */
import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import { CellSelection, moveTableColumn, moveTableRow, TableMap } from '@tiptap/pm/tables'

export interface TableRef { pos: number, node: PMNode, map: TableMap }

export function tableAt(editor: Editor, pos: number): TableRef | null {
  const node = editor.state.doc.nodeAt(pos)
  if (!node || node.type.name !== 'table') return null
  return { pos, node, map: TableMap.get(node) }
}

/** Document position of the cell at (row, col). */
export function cellPos(t: TableRef, row: number, col: number) {
  return t.pos + 1 + t.map.map[row * t.map.width + col]!
}

/** Puts the cursor in a cell so Tiptap's table commands act on it. */
function focusCell(editor: Editor, t: TableRef, row: number, col: number) {
  const pos = cellPos(t, row, col)
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(pos + 1))))
}

export function selectRow(editor: Editor, t: TableRef, row: number) {
  const $cell = editor.state.doc.resolve(cellPos(t, row, 0))
  editor.view.dispatch(editor.state.tr.setSelection(CellSelection.rowSelection($cell)))
}

export function selectColumn(editor: Editor, t: TableRef, col: number) {
  const $cell = editor.state.doc.resolve(cellPos(t, 0, col))
  editor.view.dispatch(editor.state.tr.setSelection(CellSelection.colSelection($cell)))
}

export function insertRow(editor: Editor, t: TableRef, row: number, where: 'before' | 'after') {
  focusCell(editor, t, row, 0)
  editor.chain().focus()[where === 'before' ? 'addRowBefore' : 'addRowAfter']().run()
}

export function insertColumn(editor: Editor, t: TableRef, col: number, where: 'before' | 'after') {
  focusCell(editor, t, 0, col)
  editor.chain().focus()[where === 'before' ? 'addColumnBefore' : 'addColumnAfter']().run()
}

export function deleteRow(editor: Editor, t: TableRef, row: number) {
  if (t.map.height <= 1) return editor.chain().focus().setNodeSelection(t.pos).deleteSelection().run()
  focusCell(editor, t, row, 0)
  editor.chain().focus().deleteRow().run()
}

export function deleteColumn(editor: Editor, t: TableRef, col: number) {
  if (t.map.width <= 1) return editor.chain().focus().setNodeSelection(t.pos).deleteSelection().run()
  focusCell(editor, t, 0, col)
  editor.chain().focus().deleteColumn().run()
}

export function moveRow(editor: Editor, t: TableRef, from: number, to: number) {
  if (to < 0 || to >= t.map.height) return
  moveTableRow({ from, to, select: true, pos: t.pos + 1 })(editor.state, editor.view.dispatch)
}

export function moveColumn(editor: Editor, t: TableRef, from: number, to: number) {
  if (to < 0 || to >= t.map.width) return
  moveTableColumn({ from, to, select: true, pos: t.pos + 1 })(editor.state, editor.view.dispatch)
}

export function duplicateRow(editor: Editor, t: TableRef, row: number) {
  const $row = editor.state.doc.resolve(cellPos(t, row, 0))
  const rowNode = $row.parent
  const after = $row.after()
  editor.view.dispatch(editor.state.tr.insert(after, rowNode.copy(rowNode.content)))
}

/** Copies a column to its right. Skips cells that span several columns. */
export function duplicateColumn(editor: Editor, t: TableRef, col: number) {
  const tr = editor.state.tr
  for (let row = t.map.height - 1; row >= 0; row--) {
    const pos = cellPos(t, row, col)
    const cell = editor.state.doc.nodeAt(pos)
    if (!cell || (cell.attrs.colspan ?? 1) > 1 || (row > 0 && cellPos(t, row - 1, col) === pos)) continue
    tr.insert(pos + cell.nodeSize, cell.type.create({ ...cell.attrs, colwidth: cell.attrs.colwidth }, cell.content))
  }
  editor.view.dispatch(tr)
}

/** Empties the cells of the current cell selection. */
export function clearSelectedCells(editor: Editor) {
  const sel = editor.state.selection
  if (!(sel instanceof CellSelection)) return
  const tr = editor.state.tr
  const paragraph = editor.schema.nodes.paragraph!
  sel.forEachCell((cell, pos) => {
    const from = tr.mapping.map(pos + 1)
    const to = tr.mapping.map(pos + cell.nodeSize - 1)
    tr.replaceWith(from, to, paragraph.create())
  })
  editor.view.dispatch(tr)
}

export function colorSelectedCells(editor: Editor, color: string | null) {
  editor.chain().focus().setCellAttribute('color', color === 'default' ? null : color).run()
}

export const hasHeaderRow = (t: TableRef) => {
  let header = true
  t.node.firstChild?.forEach((cell) => {
    if (cell.type.name !== 'tableHeader') header = false
  })
  return header
}

export const hasHeaderColumn = (t: TableRef) => {
  let header = true
  t.node.forEach((row) => {
    if (row.firstChild?.type.name !== 'tableHeader') header = false
  })
  return header
}

export function toggleHeader(editor: Editor, t: TableRef, kind: 'row' | 'column') {
  focusCell(editor, t, 0, 0)
  editor.chain().focus()[kind === 'row' ? 'toggleHeaderRow' : 'toggleHeaderColumn']().run()
}
