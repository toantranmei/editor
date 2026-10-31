# @toantranmei/page-block

## 0.1.0

### Minor Changes

- 3946418: Notion-style notes building blocks.
  
  **@toantranmei/editor**
  
  - New `collaboration` prop on `<MeiEditor>`: `{ document: Y.Doc, field?: string }` (field defaults to `'default'`,
    read at mount). The editor binds to the Yjs document with Tiptap's Collaboration extension and Yjs undo
    (`Mod-z`, `Mod-Shift-z`, `Mod-y`). The Y.Doc is the source of truth: `modelValue` is never loaded and
    `update:modelValue` is not emitted (no `getJSON()` per keystroke). Block ids and all built-in blocks work in
    shared documents.
  - New `change({ editor })` event on every local or remote change, without serializing the document (also emitted
    without collaboration).
  - New entry `@toantranmei/editor/collaboration` (`collaborationExtensions`, `MeiCollaboration`), loaded lazily by
    `<MeiEditor>` so editors without collaboration never load Yjs; `createExtensions` takes `undoRedo: false`.
  - `yjs` is now an optional peer dependency (install it in the app to use collaboration; one copy only).
  - Simplified Chinese locale: `locale="zh"`, exported `zh` messages, Chinese slash-menu keywords, zh emoji search,
    and Chinese date / time input (`2026年10月24日`, `下午2:30`).
  - Slash menu: an exact title or id match now ranks above blocks that only list the query as a keyword.
  - New `component.pageLink.*` design tokens (used by `@toantranmei/page-block`).
  
  **@toantranmei/page-block** (new)
  
  - `pageBlock.configure({ resolve, createPage, open, href?, search? })`: `pageLink` node (atom, draggable,
    `pageId` attribute) rendered as icon + title, with loading / untitled / not-found states; slash items "Page"
    (creates a sub-page, inserts the link, opens it) and "Link to page" (search popover). vi / en / zh.
  
  **@toantranmei/sketch-block**
  
  - Simplified Chinese UI (`zh`), following the editor's locale.
- 2ffb26b: Server-side rendering, comments and synced blocks.
  
  **@toantranmei/editor**
  
  - New entry `@toantranmei/editor/render`: `renderHTML(doc, { blocks, locale, resolveLink, mentionHref, katex, wrap, theme, data })`
    turns editor JSON into the editor's markup without a DOM (Node or browser), so `style.css` styles it like a
    read-only editor. Heading anchors and TOC links, lowlight highlighting, KaTeX (`renderHTMLAsync` loads it),
    `<details>` toggles, images (width, alignment, crop, caption), tables, columns, callouts, files / audio / video,
    mentions as links, sandboxed embeds and HTML blocks. Escapes all text and attributes and allow-lists URL
    schemes. Also `renderTokensStyle()`, `hydrateMermaid()`, `safeUrl`, `escapeHtml`, `highlightCode`, `hasMath`.
    ~5 ms for 1,000 blocks.
  - `defineBlock`: optional `render` (static HTML hooks for nodes / marks) and `formatActions` (selection
    bubble-menu buttons; `readOnly: true` also shows them in read-only editors, e.g. "Comment").
  - `@toantranmei/editor/collaboration`: `fillDocument(doc, json, schema, field?)` and `documentToJSON(doc, field?)`.
  - Fix: in collaboration mode the first local edit after mount was reverted (menus register plugins after the
    editor is created, which left the Yjs binding with a stale node mapping).
  - New `component.comments.*` and `component.synced.*` design tokens.
  
  **@toantranmei/page-block**
  
  - `pageLink` renders server-side through `renderHTML`'s `resolveLink`; DOM-free entry `@toantranmei/page-block/render`.
  
  **@toantranmei/comments** (new)
  
  - `comments.configure({ source, level })`: `comment` mark (`threadId`, not inclusive, overlapping, synced with Yjs),
    highlights, "Comment" bubble action (also for comment-only users in read-only editors, anchored by block id +
    quote), `<CommentsGutter>` badges per block, `<CommentsPanel>` (open / resolved, replies, edit / delete own,
    resolve / re-open, @mentions in bodies). Adapter `CommentsSource`. vi / en / zh.
  
  **@toantranmei/synced-block** (new)
  
  - `syncedBlock.configure({ doc, create, originHref?, blocks? })`: `syncedBlock` node (`sourceId`) showing a nested
    collaborative editor on the source's Y.Doc; slash item "Synced block" moves the selected blocks into a new
    source; read-only / missing states; `renderHTML` hook (`@toantranmei/synced-block/render`). vi / en / zh.
