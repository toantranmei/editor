import type { Editor } from '@tiptap/core'
import type { PageBlockOptions } from './types'

export const PAGE_LINK_NODE = 'pageLink'

export const reportError = (options: PageBlockOptions, error: unknown) => (options.onError ? options.onError(error) : console.error('[page-block]', error))

/**
 * A position that follows the document while we wait (createPage, the search popover). Uses the editor's
 * mappable positions, which the Collaboration extension makes Yjs-aware (remote changes replace the whole doc).
 */
export function trackPosition(editor: Editor, pos: number) {
  let position = editor.utils.createMappablePosition(pos)
  const onTransaction = ({ transaction }: { transaction: Parameters<Editor['utils']['getUpdatedPosition']>[1] }) => {
    position = editor.utils.getUpdatedPosition(position, transaction).position
  }
  editor.on('transaction', onTransaction)
  return { get: () => position.position, stop: () => editor.off('transaction', onTransaction) }
}

/** Start of the text block holding the caret (the empty line the slash menu ran on). */
export function caretBlockPos(editor: Editor): number | null {
  const { $from } = editor.state.selection
  return $from.depth > 0 ? $from.before($from.depth) : null
}

/** Puts a link at `pos`: replaces an empty paragraph there, else goes right after that block, else at the caret. */
export function insertPageLinkAt(editor: Editor, pos: number | null, pageId: string): boolean {
  const content = { type: PAGE_LINK_NODE, attrs: { pageId } }
  const { doc, schema } = editor.state
  if (pos !== null && pos >= 0 && pos < doc.content.size) {
    const target = doc.nodeAt(pos)
    const $pos = doc.resolve(pos)
    const type = schema.nodes[PAGE_LINK_NODE]!
    if (target?.type.name === 'paragraph' && target.content.size === 0 && $pos.parent.canReplaceWith($pos.index(), $pos.index() + 1, type)) {
      return editor.chain().insertContentAt({ from: pos, to: pos + target.nodeSize }, content).run() && caretAfter(editor, pos)
    }
    if (target && editor.can().insertContentAt(pos + target.nodeSize, content)) {
      return editor.chain().insertContentAt(pos + target.nodeSize, content).run() && caretAfter(editor, pos + target.nodeSize)
    }
  }
  return editor.chain().focus().insertContent(content).run()
}


/** Puts the caret in the line after the link at `pos` (like Notion), so Enter doesn't open the page right away. */
function caretAfter(editor: Editor, pos: number): true {
  const link = editor.state.doc.nodeAt(pos)
  if (link?.type.name !== PAGE_LINK_NODE) return true
  const next = pos + link.nodeSize
  if (editor.state.doc.nodeAt(next)?.isTextblock) editor.commands.setTextSelection(next + 1)
  return true
}
