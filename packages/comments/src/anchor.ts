import type { Node as PMNode } from '@tiptap/pm/model'
import type { EditorState } from '@tiptap/pm/state'
import type { Anchor, Thread } from './types'

/** Longest quote kept in an anchor. */
export const MAX_QUOTE = 500
export const COMMENT_MARK = 'comment'

/** Id (`data-id`) of the innermost block around `pos` that has one. */
export function blockIdAt(state: EditorState, pos: number): string | null {
  const $pos = state.doc.resolve(pos)
  for (let d = $pos.depth; d > 0; d--) {
    const id = $pos.node(d).attrs.id
    if (typeof id === 'string' && id) return id
  }
  return null
}

/**
 * Anchor for the current text selection: the first block's id and the selected text.
 * Comment-only users can't change the document, so the anchor is all that identifies the
 * text; the quote is limited to the first block so it can be found again by search.
 */
export function selectionAnchor(state: EditorState): { anchor: Anchor, from: number, to: number } | null {
  const { from, to, empty, $from } = state.selection
  if (empty) return null
  const blockId = blockIdAt(state, from)
  if (!blockId) return null
  // Within the first textblock (comment-only anchors are found by searching that block).
  const end = $from.parent.isTextblock ? Math.min(to, $from.end()) : to
  const quote = state.doc.textBetween(from, Math.max(from, end), ' ', ' ').trim().slice(0, MAX_QUOTE)
  if (!quote) return null
  return { anchor: { kind: 'text', block_id: blockId, quote }, from, to }
}

export interface AnchorIndex {
  /** Ranges of `comment` marks, per thread id. */
  marks: Map<string, { from: number, to: number }[]>
  /** Blocks with an id: position and node. */
  blocks: Map<string, { pos: number, node: PMNode }>
}

/** One pass over the document: comment-mark ranges and block positions. */
export function indexDocument(doc: PMNode): AnchorIndex {
  const marks = new Map<string, { from: number, to: number }[]>()
  const blocks = new Map<string, { pos: number, node: PMNode }>()
  doc.descendants((node, pos) => {
    const id = node.attrs?.id
    if (typeof id === 'string' && id && !node.isText) blocks.set(id, { pos, node })
    if (node.isText) {
      for (const mark of node.marks) {
        if (mark.type.name !== COMMENT_MARK || !mark.attrs.threadId) continue
        const list = marks.get(mark.attrs.threadId) ?? []
        const last = list[list.length - 1]
        if (last && last.to === pos) last.to = pos + node.nodeSize
        else list.push({ from: pos, to: pos + node.nodeSize })
        marks.set(mark.attrs.threadId, list)
      }
    }
    return true
  })
  return { marks, blocks }
}

/** Finds `quote` in a textblock (or the first textblock containing it inside a block). */
export function findQuote(block: { pos: number, node: PMNode }, quote: string): { from: number, to: number } | null {
  if (!quote) return null
  let found: { from: number, to: number } | null = null
  const search = (node: PMNode, start: number) => {
    if (found) return
    if (node.isTextblock) {
      // Text offsets → document positions (inline atoms count as one char of "￼").
      let text = ''
      const positions: number[] = []
      node.forEach((child, offset) => {
        if (child.isText) {
          for (let i = 0; i < child.text!.length; i++) positions.push(start + 1 + offset + i)
          text += child.text
        }
        else {
          positions.push(start + 1 + offset)
          text += '￼'
        }
      })
      const at = text.indexOf(quote)
      if (at >= 0) found = { from: positions[at]!, to: positions[at + quote.length - 1]! + 1 }
      return
    }
    node.forEach((child, offset) => search(child, start + 1 + offset))
  }
  search(block.node, block.pos)
  return found
}

/** Document ranges to highlight for a thread: its marks, else its quote searched in its block. */
export function threadRanges(thread: Thread, index: AnchorIndex): { from: number, to: number }[] {
  const marked = index.marks.get(thread.id)
  if (marked?.length) return marked
  const a = thread.anchor
  if (a.kind !== 'text') return []
  const block = index.blocks.get(a.block_id)
  const range = block && findQuote(block, a.quote)
  return range ? [range] : []
}

/** Block id a thread belongs to (gutter), or null for page comments. */
export const threadBlockId = (thread: Thread) => (thread.anchor.kind === 'page' ? null : thread.anchor.block_id)
