import { MessageSquareText } from '@lucide/vue'
import { defineBlock } from '@toantranmei/editor'
import { selectionAnchor } from './anchor'
import { canComment, CommentsExtension, levelOf } from './extension'
import { commentsMessages } from './messages'
import { useCommentsState } from './store'
import type { CommentsOptions } from './types'

/**
 * Comments for `<MeiEditor :blocks>`: `comments.configure({ source, level })`.
 * Adds the `comment` mark, highlights open threads, and a "Comment" button in the
 * selection bubble menu (also in read-only editors at `comment` level). Show the threads
 * with `<CommentsPanel>` and per-block counts with `<CommentsGutter>`.
 */
export const comments = defineBlock<CommentsOptions>({
  name: 'comments',
  defaults: { source: null, level: 'edit', onCompose: null, onOpenThread: null, messages: null },
  extensions: o => [CommentsExtension.configure(o)],
  formatActions: o => [{
    id: 'comment',
    icon: MessageSquareText,
    readOnly: true,
    title: editor => commentsMessages(editor.storage.meiConfig?.locale, o.messages).comment,
    isVisible: editor => !!o.source?.me.value && canComment(levelOf(o.level)) && !!selectionAnchor(editor.state),
    run: (editor) => {
      if (!o.source) return
      const found = selectionAnchor(editor.state)
      if (!found) return
      const state = useCommentsState(o.source)
      state.startDraft(editor, found)
      o.onCompose?.(found)
    },
  }],
  // Public pages don't show comments: the mark renders as plain text.
  render: () => ({ marks: { comment: (_mark, inner) => inner } }),
})
