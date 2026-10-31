# @toantranmei/editor

## 0.3.0

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
- 59f6faa: Notion-style databases and charts.
  
  **@toantranmei/database-block** (new)
  
  - `databaseBlock.configure({ source, createDatabase, open? })`: `databaseView` node (atom, `databaseId`, `viewId`,
    `inline`, block id) rendering a database from the app's `DatabaseSource` (notes contract 1.7). Slash items
    "Database – inline" / "Database – full page" (vi / en / zh).
  - Title, view tabs (add / rename / duplicate / delete), toolbar (filter builder with And / Or groups and the
    contract operators per type, sorts, group by, property visibility, search, New).
  - Table on TanStack Table + TanStack Virtual: rows and columns virtualized, only visible windows requested
    (`rows(viewId, { offset, limit })`, refetched on `version`), sticky header / first column, resize and reorder
    columns, per-type cell editors, spreadsheet keyboard, TSV copy / paste (creates rows), footer calculations, row
    reorder (`moveRow`), select + delete, open row. 100k rows scroll at ~60 fps.
  - Board, calendar, timeline, gallery, list, chart (via chart-block) and pivot views; property menu (rename, edit,
    change type with a lossy warning, hide, sort, filter, delete) and "add property" with formula check.
  - `<DatabaseView>` for full-page databases; `@toantranmei/database-block/memory` in-memory source for demos / tests.
  - Static HTML: a `render` hook (read-only table from `data.databases[databaseId]`) and a DOM-free
    `@toantranmei/database-block/render` entry (`databaseBlockRender`).
  - Optional source additions: `validateFormula`, `rowsInRange`, and a `{ search }` query argument.
  
  **@toantranmei/chart-block** (new)
  
  - `<DatabaseChart :data :config>` (bar, line, area, pie, donut, scatter; stacked; LTTB above 5000 points) with
    ECharts imported per module and loaded lazily; colors from the editor tokens, light / dark.
  - Standalone `chart` block (`{ data: { columns, rows }, config }`) with an inline data grid, CSV paste and settings.
  
  **@toantranmei/editor**
  
  - New design tokens `component.database.*` and `component.chart.*`.
  - `scripts/check-styles.mjs` takes a source directory, so block packages run the token check on their own sources.
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

### Patch Changes

- 343e181: Fixes found by the ai-factory /notes kitchen-sink page.
  
  - **editor:** redo in collaboration mode; code blocks without a language stay `null`; Tab / Shift-Tab indent and
    outdent the right lines in code blocks; unsafe image sources are never loaded or opened; the file block accepts
    same-origin upload paths; Mermaid diagrams render independently and keep the last good diagram while the code is
    invalid; menus at the caret ignore a resting pointer; mention links and avatars go through `safeUrl`; image link
    actions tell same-origin from other hosts.
  - **editor, Markdown paste:** pasted Markdown text becomes blocks (linear parsers, no paste rules, bounded inline
    nesting, 100 KB cap).
  - **editor, collaboration:** first render once per binding and view, no editing before sync, a sticky read-only
    fallback; `@tiptap/y-tiptap` pinned to 3.0.11.
  - **database-block:** no chart / pivot query without axes; a pivot without rows or columns still shows its grand total.

## 0.2.0

### Minor Changes

- 1fb950e: Export `blockNodeView`, `useScope`, `useClickOutside`, `useEditable` for block packages.

### Patch Changes

- bae80da: Callouts: "/text" on a line inside a callout (or column, toggle, table cell) keeps it in place instead of turning the whole callout into text; the icon now stays centered on the first line whatever block it is (heading, list, code…), with even top and left padding.

## 0.1.2

### Patch Changes

- bae80da: Callouts: "/text" on a line inside a callout (or column, toggle, table cell) keeps it in place instead of turning the whole callout into text; the icon now stays centered on the first line whatever block it is (heading, list, code…), with even top and left padding.
- 4182fea: Even spacing inside callouts, columns, toggles and quotes: their first and last blocks no longer keep an outer margin, so a heading or code block at the top/bottom doesn't leave more space on one side.
- f3783d0: Fix the "Type '/'…" placeholder staying on empty blocks the cursor had left (Tiptap's incremental placeholder was off by one); it now shows only on the cursor's block. Center the block handle (+ ⋮⋮) on each block's first text line, header bar, divider or top edge, and make it Notion-sized (24px buttons, 18px icons).
- 30d3c26: Read-only mode hides empty image, file, audio, video, embed, HTML and equation blocks (like Notion) instead of showing their upload/editing UI; the blocks stay in the document. The equation editor closes when switching to read-only, and clicking outside it closes it again.

## 0.1.1

### Patch Changes

- db6794b: Docs: how to match a shadcn/ui + Tailwind app with design tokens, and a note on Tailwind v3's unlayered preflight.
