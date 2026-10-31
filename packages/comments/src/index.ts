import './styles/comments.css'

export { comments } from './definition'
export { canComment, CommentMark, CommentsExtension, commentsPluginKey, levelOf } from './extension'
export { default as CommentsPanel } from './CommentsPanel.vue'
export { default as CommentsGutter } from './CommentsGutter.vue'
export { default as CommentComposer } from './CommentComposer.vue'
export { useCommentsState, type ActiveDraft, type CommentsState } from './store'
export { blockIdAt, findQuote, indexDocument, selectionAnchor, threadRanges, COMMENT_MARK } from './anchor'
export { bodyHtml } from './format'
export { commentsMessages, messages, type CommentsMessages } from './messages'
export type {
  Anchor, Comment, CommentAuthor, CommentDraft, CommentsLevel, CommentsOptions, CommentsSource, CommentsUser, Person, Thread,
} from './types'
