# @toantranmei/sketch-block

## 0.2.0

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

## 0.1.1

### Patch Changes

- c637b36: Presence: strip zero-width and other invisible characters from collaborator names, so a name can't render as a blank tag.

## 0.1.0

### Minor Changes

- 804015a: Initial release: sketch whiteboard block (M0)
- b3e4117: Drawing tools: pen, highlighter, line, arrow, text, eraser, laser, lasso, style panel, clipboard
- acd1bfb: Miro core: sticky notes, shape library, images, frames, arrow binding and labels, quick flowchart, group/lock, align/distribute, grid and snapping
- fa6e4c0: Backend and collaboration: http and websocket providers, presence and follow, convergence repair, clone-on-paste, board bundles, search and links
