/**
 * Operations on a range of sibling blocks. Shared by the ⋮⋮ menu, keyboard shortcuts,
 * block selection and drag & drop, so each behavior has exactly one implementation.
 *
 * A "block" is a direct child of the doc or of a column.
 */
import type { Editor } from '@tiptap/core'
import { Fragment, type Node as PMNode, type ResolvedPos } from '@tiptap/pm/model'
import { type EditorState, TextSelection, type Transaction } from '@tiptap/pm/state'
import { NodeRangeSelection } from '@tiptap/extension-node-range'
import type { BlockType } from './block-items'
import type { ColorName } from './colors'

/** `[from, to)` covers whole sibling blocks; `depth` is their parent's depth. */
export interface BlockRange { from: number, to: number, depth: number }

const CONTAINERS = ['doc', 'column']

/** The block owning `$pos`: deepest ancestor whose parent is the doc or a column. */
export function blockAt($pos: ResolvedPos): { node: PMNode, pos: number, depth: number } | null {
  for (let d = $pos.depth; d >= 1; d--) {
    const node = $pos.node(d)
    if (CONTAINERS.includes($pos.node(d - 1).type.name) && !['column', 'columns'].includes(node.type.name)) {
      return { node, pos: $pos.before(d), depth: d - 1 }
    }
  }
  // Atom blocks (image, divider…) selected as nodes.
  const after = $pos.nodeAfter
  if (after?.isBlock && CONTAINERS.includes($pos.parent.type.name)) return { node: after, pos: $pos.pos, depth: $pos.depth }
  return null
}

export const rangeOfBlock = (block: { node: PMNode, pos: number, depth: number }): BlockRange =>
  ({ from: block.pos, to: block.pos + block.node.nodeSize, depth: block.depth })

/** Range spanning the blocks of `a` and `b` (falls back to their shared container level). */
export function rangeBetween(doc: PMNode, a: number, b: number): BlockRange | null {
  const ba = blockAt(doc.resolve(a))
  const bb = blockAt(doc.resolve(b))
  if (!ba || !bb) return null
  if (ba.depth === bb.depth && doc.resolve(ba.pos).parent === doc.resolve(bb.pos).parent) {
    return { from: Math.min(ba.pos, bb.pos), to: Math.max(ba.pos + ba.node.nodeSize, bb.pos + bb.node.nodeSize), depth: ba.depth }
  }
  // Different containers (e.g. inside vs. outside columns): select whole top-level blocks.
  const top = (pos: number) => {
    const $p = doc.resolve(pos)
    return { from: $p.before(1), to: $p.after(1) }
  }
  const ta = top(ba.pos + 1)
  const tb = top(bb.pos + 1)
  return { from: Math.min(ta.from, tb.from), to: Math.max(ta.to, tb.to), depth: 0 }
}

export const isBlockSelection = (state: EditorState) => state.selection instanceof NodeRangeSelection

/** Blocks the next command acts on: the block selection, or the block(s) holding the cursor. */
export function currentRange(state: EditorState): BlockRange | null {
  const sel = state.selection
  if (sel instanceof NodeRangeSelection) return { from: sel.from, to: sel.to, depth: sel.depth ?? 0 }
  return rangeBetween(state.doc, sel.from, sel.to)
}

/** Nodes in a range, in order. */
export function blocksIn(doc: PMNode, range: BlockRange): { node: PMNode, pos: number }[] {
  const out: { node: PMNode, pos: number }[] = []
  for (let pos = range.from; pos < range.to;) {
    const node = doc.nodeAt(pos)
    if (!node) break
    out.push({ node, pos })
    pos += node.nodeSize
  }
  return out
}

export function setBlockSelection(tr: Transaction, range: BlockRange) {
  return tr.setSelection(NodeRangeSelection.create(tr.doc, range.from + 1, range.to - 1, range.depth))
}

export function selectBlocks(editor: Editor, range: BlockRange) {
  editor.view.dispatch(setBlockSelection(editor.state.tr, range))
}

/**
 * Called after removing content from inside a column: drops the column if it became
 * empty and unwraps the columns block when a single column is left (Notion behavior).
 */
export function dissolveEmptyColumn(tr: Transaction, pos: number) {
  const $pos = tr.doc.resolve(Math.min(pos, tr.doc.content.size))
  let columnDepth = -1
  for (let d = $pos.depth; d >= 1; d--) {
    if ($pos.node(d).type.name === 'column') {
      columnDepth = d
      break
    }
  }
  if (columnDepth < 1) return
  const column = $pos.node(columnDepth)
  const isEmpty = column.childCount === 1 && column.firstChild!.isTextblock && column.firstChild!.content.size === 0
  if (!isEmpty) return

  const columns = $pos.node(columnDepth - 1)
  const columnsPos = $pos.before(columnDepth - 1)
  const rest: PMNode[] = []
  columns.forEach(c => c !== column && rest.push(c))
  const replacement = rest.length >= 2
    ? Fragment.from(columns.copy(Fragment.from(rest)))
    : rest.length === 1 ? rest[0]!.content : Fragment.empty
  tr.replaceWith(columnsPos, columnsPos + columns.nodeSize, replacement)
}

/** Restores a block or text selection over `range` after it moved to `next`. */
function reselect(tr: Transaction, wasBlocks: boolean, oldFrom: number, caret: number, next: BlockRange) {
  if (wasBlocks) return setBlockSelection(tr, next)
  return tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(next.from + (caret - oldFrom), tr.doc.content.size))))
}

export function deleteBlocks(editor: Editor, range: BlockRange) {
  const tr = editor.state.tr.delete(range.from, range.to)
  dissolveEmptyColumn(tr, tr.mapping.map(range.from))
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(tr.mapping.map(range.from), tr.doc.content.size))))
  editor.view.dispatch(tr.scrollIntoView())
  editor.view.focus()
}

export function duplicateBlocks(editor: Editor, range: BlockRange) {
  const { state } = editor
  const slice = state.doc.slice(range.from, range.to)
  const tr = state.tr.insert(range.to, slice.content)
  const next = { from: range.to, to: range.to + slice.content.size, depth: range.depth }
  reselect(tr, isBlockSelection(state), range.from, state.selection.from, next)
  editor.view.dispatch(tr.scrollIntoView())
}

/** Swaps the range with its previous/next sibling. Returns false at the edge. */
export function moveBlocks(editor: Editor, range: BlockRange, dir: 'up' | 'down') {
  const { state } = editor
  const $from = state.doc.resolve(range.from)
  const parent = $from.parent
  const startIndex = $from.index()
  const endIndex = state.doc.resolve(range.to).index()
  const slice = state.doc.slice(range.from, range.to)
  const tr = state.tr

  let insertAt: number
  if (dir === 'up') {
    if (startIndex === 0) return false
    insertAt = range.from - parent.child(startIndex - 1).nodeSize
    tr.delete(range.from, range.to)
  }
  else {
    if (endIndex >= parent.childCount) return false
    const after = range.to + parent.child(endIndex).nodeSize
    tr.delete(range.from, range.to)
    insertAt = tr.mapping.map(after)
  }
  tr.insert(insertAt, slice.content)
  reselect(tr, isBlockSelection(state), range.from, state.selection.from, { from: insertAt, to: insertAt + slice.content.size, depth: range.depth })
  editor.view.dispatch(tr.scrollIntoView())
  return true
}

/** Selects the text of every block in the range (for marks / turn into). */
function selectText(tr: Transaction, from: number, to: number) {
  return tr.setSelection(TextSelection.between(tr.doc.resolve(from + 1), tr.doc.resolve(Math.max(from + 1, to - 1))))
}

/**
 * Converts every block in the range, keeping text. Toggles are unwrapped first, then
 * lists/quotes/callouts are cleared to paragraphs and the new type is applied.
 */
export function turnBlocksInto(editor: Editor, range: BlockRange, block: BlockType) {
  if (!block.turnInto) return
  const wasBlocks = isBlockSelection(editor.state)
  let to = range.to

  const chain = editor.chain().focus().command(({ tr }) => {
    // Unwrap toggles from last to first so earlier positions stay valid.
    for (const { node, pos } of blocksIn(tr.doc, range).reverse()) {
      if (node.type.name !== 'details') continue
      const [summary, content] = [node.child(0), node.child(1)]
      const paragraph = tr.doc.type.schema.nodes.paragraph!.create(null, summary.content)
      const fragment = Fragment.from(paragraph).append(content.content)
      tr.replaceWith(pos, pos + node.nodeSize, fragment)
    }
    to = tr.mapping.map(range.to)
    selectText(tr, range.from, to)
    return true
  }).clearNodes()
  block.turnInto(chain).run()

  if (wasBlocks) {
    const { from: a, to: b } = editor.state.selection
    const next = rangeBetween(editor.state.doc, a, b)
    if (next) selectBlocks(editor, next)
  }
}

/**
 * Colors whole blocks, like Notion: blocks that support it get a block color (the
 * background fills the block, and empty blocks color what's typed later); others
 * (callouts, code…) get the color on their text. Inline colors of the same kind are
 * cleared so the block color shows.
 */
export function colorBlocks(editor: Editor, range: BlockRange, kind: 'text' | 'bg', color: ColorName) {
  const attr = kind === 'text' ? 'blockColor' : 'blockBg'
  const mark = editor.schema.marks[kind === 'text' ? 'textColor' : 'bgColor']
  const value = color === 'default' ? null : color
  const wasBlocks = isBlockSelection(editor.state)
  editor.chain().focus().command(({ tr }) => {
    for (const { node, pos } of blocksIn(tr.doc, range)) {
      const end = pos + node.nodeSize
      if (kind === 'bg' && node.type.name === 'callout') {
        // A callout's background is its own color.
        tr.setNodeAttribute(pos, 'color', value ?? 'gray')
      }
      else if (node.type.spec.attrs?.[attr]) {
        tr.setNodeAttribute(pos, attr, value)
        if (mark) tr.removeMark(pos, end, mark)
      }
      else if (mark) {
        tr.removeMark(pos, end, mark)
        if (value) tr.addMark(pos, end, mark.create({ color: value }))
      }
    }
    return true
  }).run()
  if (wasBlocks) selectBlocks(editor, range)
}

/** Text/background color shared by all text in the range, if uniform. */
export function rangeColors(state: EditorState, range: BlockRange) {
  const found = { text: new Set<string>(), bg: new Set<string>() }
  let any = false
  // Inline mark wins, else the nearest colored block around the text.
  const add = (pos: number, marks: readonly { type: { name: string }, attrs: Record<string, any> }[]) => {
    const $pos = state.doc.resolve(pos)
    const fromBlocks = (attr: string) => {
      for (let d = $pos.depth; d > 0; d--) if ($pos.node(d).attrs[attr]) return $pos.node(d).attrs[attr] as string
      return 'default'
    }
    any = true
    found.text.add(marks.find(m => m.type.name === 'textColor')?.attrs.color ?? fromBlocks('blockColor'))
    found.bg.add(marks.find(m => m.type.name === 'bgColor')?.attrs.color ?? fromBlocks('blockBg'))
  }
  state.doc.nodesBetween(range.from, range.to, (node, pos) => {
    if (node.isText) add(pos, node.marks)
    // An empty colored line still shows (and ticks) its color.
    else if (node.isTextblock && !node.content.size) add(pos + 1, [])
  })
  const single = (s: Set<string>): string | null => (any && s.size === 1 ? [...s][0]! : null)
  return { text: single(found.text), bg: single(found.bg) }
}
