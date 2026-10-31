# @toantranmei/comments

## 0.1.0

### Minor Changes

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
