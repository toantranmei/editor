import type { Editor } from '@tiptap/core'
import { type Ref, ref, type ShallowRef, shallowRef } from 'vue'
import { COMMENT_MARK, findQuote, indexDocument } from './anchor'
import type { CommentDraft, CommentsSource, Thread } from './types'

export interface ActiveDraft extends CommentDraft {
  editor: Editor
  /** Stable per draft (ranges change as the document is edited). */
  key: number
}

/** UI state shared by the editor extension, the gutter and the panel of one source. */
export interface CommentsState {
  /** Thread shown / highlighted (clicked highlight or badge, or picked in the panel). */
  activeId: Ref<string | null>
  /** Comment being written for a selection. */
  draft: ShallowRef<ActiveDraft | null>
  /** Panel filter. */
  filter: Ref<'open' | 'resolved'>
  startDraft: (editor: Editor, draft: CommentDraft) => void
  cancelDraft: () => void
  /** Saves the draft as a new thread; editors also get the `comment` mark on the text. */
  submitDraft: (body: Parameters<CommentsSource['create']>[1]) => Promise<Thread | null>
}

const states = new WeakMap<CommentsSource, CommentsState>()

/** The shared state of a source (created on first use). */
export function useCommentsState(source: CommentsSource): CommentsState {
  let state = states.get(source)
  if (state) return state

  const activeId = ref<string | null>(null)
  const draft = shallowRef<ActiveDraft | null>(null)
  const filter = ref<'open' | 'resolved'>('open')
  let stopMapping: (() => void) | null = null
  let drafts = 0

  // Keep the draft's range in step with edits made while the comment is written. The
  // editor's mappable positions follow remote Yjs changes too (they rebuild the document).
  function track(editor: Editor, from: number, to: number) {
    let a = editor.utils.createMappablePosition(from)
    let b = editor.utils.createMappablePosition(to)
    const onTransaction = ({ transaction }: { transaction: Parameters<Editor['utils']['getUpdatedPosition']>[1] }) => {
      const d = draft.value
      if (!d || !transaction.docChanged) return
      a = editor.utils.getUpdatedPosition(a, transaction).position
      b = editor.utils.getUpdatedPosition(b, transaction).position
      draft.value = { ...d, from: a.position, to: b.position }
    }
    editor.on('transaction', onTransaction)
    return () => editor.off('transaction', onTransaction)
  }

  function cancelDraft() {
    stopMapping?.()
    stopMapping = null
    draft.value = null
  }

  function startDraft(editor: Editor, d: CommentDraft) {
    cancelDraft()
    draft.value = { ...d, editor, key: ++drafts }
    stopMapping = track(editor, d.from, d.to)
    activeId.value = null
  }

  async function submitDraft(body: Parameters<CommentsSource['create']>[1]) {
    const d = draft.value
    if (!d) return null
    const thread = await source.create(d.anchor, body)
    const current = draft.value
    cancelDraft()
    const { editor } = current ?? d
    // Editors mark the text (synced through Yjs in collaboration mode). Comment-only users
    // can't change the document: their anchor (block id + quote) is all that's stored.
    if (thread && editor.isEditable && !editor.isDestroyed && editor.schema.marks[COMMENT_MARK]) {
      const range = draftRange(editor, current ?? d)
      if (range) {
        const tr = editor.state.tr.addMark(range.from, range.to, editor.schema.marks[COMMENT_MARK]!.create({ threadId: thread.id }))
        editor.view.dispatch(tr.setMeta('addToHistory', false))
      }
    }
    if (thread) activeId.value = thread.id
    return thread
  }

  state = { activeId, draft, filter, startDraft, cancelDraft, submitDraft }
  states.set(source, state)
  return state
}

/**
 * The draft's text now: its mapped range when it still holds the quote, else the quote
 * searched in its block (remote edits can rebuild the document in collaboration mode).
 */
function draftRange(editor: Editor, d: CommentDraft): { from: number, to: number } | null {
  const { doc } = editor.state
  const quote = d.anchor.kind === 'text' ? d.anchor.quote : ''
  const size = doc.content.size
  if (d.from < d.to && d.to <= size && doc.textBetween(d.from, d.to, ' ', ' ').trim().startsWith(quote.slice(0, 40))) return { from: d.from, to: d.to }
  if (d.anchor.kind !== 'text') return null
  const block = indexDocument(doc).blocks.get(d.anchor.block_id)
  return block ? findQuote(block, quote) : null
}
