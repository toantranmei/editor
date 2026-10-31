import type { JSONContent, LocaleName } from '@toantranmei/editor'
import type { Ref } from 'vue'
import type { CommentsMessages } from './messages'

/** What a thread is attached to (contract 2.4). Block ids are the editor's `data-id`. */
export type Anchor =
  | { kind: 'page' }
  | { kind: 'block', block_id: string }
  | { kind: 'text', block_id: string, quote: string }

export interface CommentAuthor {
  id: string
  name: string
  avatar_url?: string | null
}

export interface Comment {
  id: string
  author: CommentAuthor
  /** Small ProseMirror document (paragraphs, text, `mention` nodes). */
  body: JSONContent
  /** RFC 3339. */
  created_at: string
  edited_at?: string | null
}

export interface Thread {
  id: string
  anchor: Anchor
  /** RFC 3339 when resolved, else null. */
  resolved_at: string | null
  /** Oldest first; the first comment opens the thread. */
  comments: Comment[]
}

/** Signed-in user. */
export interface CommentsUser {
  id: string
  name: string
  avatar?: string | null
}

/** Someone to @mention in a comment. */
export interface Person {
  id: string
  name: string
  avatar?: string | null
  /** Secondary line in the picker (email…). */
  description?: string
}

/**
 * Your backend, behind one adapter. `threads` is the live list for the current page
 * (load it with `GET /resources/{id}/comments`, keep it fresh on sync events); the
 * methods call the API and update `threads` themselves (optimistically or after the response).
 */
export interface CommentsSource {
  me: Ref<CommentsUser | null>
  threads: Ref<Thread[]>
  create: (anchor: Anchor, body: JSONContent) => Promise<Thread>
  reply: (threadId: string, body: JSONContent) => Promise<Comment>
  edit: (commentId: string, body: JSONContent) => Promise<void | Comment>
  remove: (commentId: string) => Promise<void>
  resolve: (threadId: string, resolved: boolean) => Promise<void | Thread>
  /** People for @mentions in comment bodies. */
  people: (query: string) => Person[] | Promise<Person[]>
}

/**
 * Access on the page (contract 2.1 levels): `view` sees comments; `comment` adds and
 * replies without editing text (anchors by block id + quote); `edit` / `full` also mark
 * the commented text in the document (`comment` mark, synced in collaboration mode).
 */
export type CommentsLevel = 'view' | 'comment' | 'edit' | 'full'

export interface CommentsOptions {
  source: CommentsSource | null
  /** Default `'edit'`. A ref or getter follows changes. */
  level: CommentsLevel | Ref<CommentsLevel> | (() => CommentsLevel)
  /** Called when the bubble-menu "Comment" starts a draft (e.g. open your side panel). */
  onCompose: ((draft: CommentDraft) => void) | null
  /** Called when a highlight or gutter badge is clicked. */
  onOpenThread: ((threadId: string) => void) | null
  /** Override strings: `{ en: { comment: 'Add comment' } }`. */
  messages: Partial<Record<LocaleName, Partial<CommentsMessages>>> | null
}

/** A comment being written for a text selection (not saved yet). */
export interface CommentDraft {
  anchor: Anchor
  /** Document range of the selection at draft time (kept mapped while it's open). */
  from: number
  to: number
}
