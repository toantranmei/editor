# @toantranmei/comments

Notion-style comments for [`@toantranmei/editor`](https://www.npmjs.com/package/@toantranmei/editor).

- Select text → **Comment** in the bubble menu → write in the side panel (@mention people, ⌘/Ctrl+Enter sends)
- `comment` mark (`threadId`) on the commented text: not inclusive, overlapping threads, synced in collaboration mode
- Gutter badges with the number of open threads per block (block ids = `data-id`)
- `<CommentsPanel>`: open / resolved filter, threads in document order, replies, edit / delete your own
  comments, resolve / re-open; click a highlight or a badge to open its thread
- Access levels: `view` sees comments, `comment` comments in a **read-only** editor (no document change),
  `edit` / `full` also mark the text
- Vietnamese, English and Simplified Chinese, styled with the editor's design tokens (`component.comments.*`)

## Install

```bash
npm i @toantranmei/comments
```

Peers: `@toantranmei/editor` `^0.3.0`, `vue` `^3.5`, Tiptap `3.32.0` (`@tiptap/core`, `@tiptap/pm`, `@tiptap/vue-3`,
`@tiptap/starter-kit`) and `@lucide/vue` — all installed with the editor.

## Usage

```vue
<script setup lang="ts">
import { defaultBlocks, MeiEditor, mention, type Editor } from '@toantranmei/editor'
import { comments, CommentsGutter, CommentsPanel, type CommentsSource } from '@toantranmei/comments'
import '@toantranmei/editor/style.css'
import '@toantranmei/comments/style.css'

const props = defineProps<{ pageId: string, level: 'view' | 'comment' | 'edit' | 'full' }>()
const source: CommentsSource = useCommentsApi(props.pageId) // your adapter, see below
const blocks = [...defaultBlocks, mention, comments.configure({ source, level: () => props.level })]
const editor = shallowRef<Editor | null>(null)
</script>

<template>
  <div class="page">
    <div class="editor-column"><!-- leave ~40px on the right for the badges -->
      <MeiEditor :blocks="blocks" :editable="level === 'edit' || level === 'full'" @ready="editor = $event" />
      <CommentsGutter :editor="editor" :source="source" locale="vi" />
    </div>
    <CommentsPanel :source="source" :editor="editor" :level="level" locale="vi" />
  </div>
</template>
```

### Adapter (`CommentsSource`)

Data shapes follow the notes API contract (2.4):

```ts
type Anchor = { kind: 'page' } | { kind: 'block', block_id: string } | { kind: 'text', block_id: string, quote: string }
interface Thread { id: string, anchor: Anchor, resolved_at: string | null, comments: Comment[] }
interface Comment { id: string, author: { id, name, avatar_url? }, body: JSONContent, created_at: string, edited_at?: string | null }

interface CommentsSource {
  me: Ref<{ id: string, name: string, avatar?: string | null } | null>  // null: signed out (read only)
  threads: Ref<Thread[]>                                                // live list for the page
  create(anchor: Anchor, body: JSONContent): Promise<Thread>            // POST /resources/{id}/comments
  reply(threadId: string, body: JSONContent): Promise<Comment>         // POST /comments/{thread}/replies
  edit(commentId: string, body: JSONContent): Promise<void | Comment>  // PATCH /comments/{id}
  remove(commentId: string): Promise<void>                              // DELETE /comments/{id}
  resolve(threadId: string, resolved: boolean): Promise<void | Thread>  // POST /comments/{thread}/resolve
  people(query: string): Person[] | Promise<Person[]>                   // @mention suggestions
}
```

The methods update `threads` themselves (optimistically or from the response); load `threads` on open and
refresh it on sync events. Bodies are small ProseMirror documents (paragraphs, marks, `mention` nodes with
`kind: 'user'`): scan them for mentions to send notifications.

### How anchors work

Every new thread is anchored `{ kind: 'text', block_id, quote }` (the first block of the selection, its
selected text). Editors (`edit` / `full`, editable editor) also put the `comment` mark on the text, which
follows edits and syncs through Yjs. Comment-only users can't change the document, so their threads are
found again by searching `quote` in the block `block_id`. Resolved threads aren't highlighted. Threads whose
text is gone stay in the panel (struck-through quote).

### Options

`comments.configure({ ... })`:

| Option | Description |
| --- | --- |
| `source` | The adapter |
| `level` | `'view' \| 'comment' \| 'edit' \| 'full'` (default `'edit'`), a ref or a getter |
| `onCompose(draft)` | Called when "Comment" starts a draft (e.g. open your panel) |
| `onOpenThread(id)` | Called when a highlight is clicked |
| `messages` | Override strings: `{ en: { comment: 'Add comment' } }` |

`<CommentsPanel>` props: `source`, `editor?`, `level?`, `locale?`, `messages?`.
`<CommentsGutter>` props: `editor`, `source`, `locale?`, `messages?`; event `open(threadIds)`. It renders inside
the editor root (`.me-root`), to its right (`component.comments.badgeOffset`).

Also exported: `useCommentsState(source)` (shared `activeId`, `draft`, `filter`, `startDraft`, `submitDraft`),
`CommentMark`, `selectionAnchor`, `findQuote`, `indexDocument`, `threadRanges`, `bodyHtml`,
`editor.commands.setComment(threadId, range?)` / `unsetComment(threadId)`.

Load `comments` in **every** editor of a page (also the read-only ones): editors without it drop the
`comment` marks when they save. `renderHTML` renders the mark as plain text (public pages show no comments).

### Styling

Tokens under `component.comments` (`highlight`, `highlightActive`, `underline`, `badge*`, `panel*`, `thread*`,
`quote*`, `avatarSize`, `meta*`, `bodyFontSize`, `composer*`). Classes: `.me-comment-highlight` (`.is-active`),
`.me-comments-badge`, `.me-comments-panel`, `.me-comment-thread` (`.is-active`, `.is-resolved`, `.is-draft`),
`.me-comment`, `.me-comment-composer`.

## License

MIT
