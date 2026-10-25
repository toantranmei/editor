# @toantranmei/sketch-block

Excalidraw / Miro-style whiteboard block for [`@toantranmei/editor`](https://www.npmjs.com/package/@toantranmei/editor).

- Hand-drawn shapes drawn with [Rough.js](https://roughjs.com) on a Canvas2D board: rectangle, ellipse, diamond and
  a library of 15 shapes including flowchart shapes
- Sticky notes, images (with crop), frames, arrows that stay attached to shapes, arrow labels, quick flowchart
  creation, group / lock, align / distribute, grid and snapping
- Lines and arrows (straight, elbow, curved), pen and highlighter ([perfect-freehand](https://github.com/steveruizok/perfect-freehand)),
  text and shape labels in a hand-written font with Vietnamese support
- Eraser, laser pointer, lasso, eyedropper; a style panel with an Excalidraw-like palette
- Select, move, resize, rotate, marquee selection, nudge with arrow keys; pan and zoom (10% – 3000%)
- Copy / paste (also between boards), duplicate, copy / paste style; zen and view mode
- Local undo / redo; boards are [Yjs](https://yjs.dev) documents
- Backends and live collaboration: `http()` and `websocket()` providers with an offline cache, live cursors,
  selections and laser trails, follow a collaborator's view, and a connection status dot
- Search inside a board, element links, board export / import (bundles), and pasted blocks get their own board
- The document keeps only a board id and a preview image: pages stay light, and the board
  engine loads only when someone clicks "Edit"
- Inline board with drag-to-resize height, or full-screen view
- Vietnamese and English UI, styled with the editor's design tokens (light / dark)

## Install

```bash
npm i @toantranmei/sketch-block yjs
# or: pnpm add @toantranmei/sketch-block yjs
```

Requires `@toantranmei/editor` `^0.2.0` (and its peers: Vue `^3.5`, Tiptap, `@lucide/vue`) and `yjs` `^13.6`.
Apps that don't install this package get no extra code in the editor bundle.

The package has not been published yet. Its first release, **0.1.0**, ships M0 (foundation), M1
(drawing tools), M2 (Miro core) and M3 (backend and collaboration) together: the pending changesets are all minor
bumps from `0.0.0`.

### Vite

If the hand-written font falls back to a system font in your Vite dev server (dependency pre-bundling can
break the URLs of the package's font files), exclude the package from dependency optimization:

```ts
// vite.config.ts
export default defineConfig({
  optimizeDeps: { exclude: ['@toantranmei/sketch-block'] },
})
```

In Nuxt, set the same option under `vite: { optimizeDeps: { exclude: [...] } }` in `nuxt.config.ts`.

## Usage

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { MeiEditor, defaultBlocks, type JSONContent } from '@toantranmei/editor'
import { sketch } from '@toantranmei/sketch-block'
import '@toantranmei/editor/style.css'
import '@toantranmei/sketch-block/style.css'

const doc = ref<JSONContent | null>(null)
</script>

<template>
  <MeiEditor v-model="doc" :blocks="[...defaultBlocks, sketch]" />
</template>
```

Type `/` and pick **Sketch** (vi: **Bảng vẽ**; also found by `sketch`, `whiteboard`, `draw`). The
block shows its preview image; click **Edit** (or double-click) to draw, press `Esc` (see [Escape](#escape)) or
click outside to leave. The expand button opens the board full screen.

Options:

```ts
sketch.configure({
  provider: myProvider, // where boards live; default: IndexedDB in this browser
  defaultHeight: 480,   // px, for boards without a stored height (users drag 240–1600)
  user: { name: 'Minh Anh', color: '#1971c2' }, // or () => …; who you are to collaborators (default: a guest)
  onPasteClone: true,   // a pasted / duplicated block gets its own copy of the board (see Storage)
})
```

### Nuxt

With the editor's Nuxt module (`modules: ['@toantranmei/editor/nuxt']`), register the block app-wide
in a plugin and add the CSS:

```ts
// plugins/mei-editor.ts
import { defaultBlocks, MeiEditorPlugin } from '@toantranmei/editor'
import { sketch } from '@toantranmei/sketch-block'

export default defineNuxtPlugin((nuxtApp) => {
  // The module already registers <MeiEditor>; only set the blocks here.
  nuxtApp.vueApp.use(MeiEditorPlugin, { component: false, blocks: [...defaultBlocks, sketch] })
})
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@toantranmei/editor/nuxt'],
  css: ['@toantranmei/sketch-block/style.css'],
})
```

Or pass `:blocks="[...defaultBlocks, sketch]"` to a single `<MeiEditor>`.

## Providers

A provider opens a board (a `Y.Doc`) by id. The built-in ones live in `@toantranmei/sketch-block/providers`:

| Provider | Description |
| --- | --- |
| `indexeddb({ prefix? })` | **Default.** One IndexedDB database per board (`mei-sketch:<boardId>`), via `y-indexeddb`. Loaded lazily |
| `memory()` | Keeps boards in memory for the page's lifetime. For tests and demos |
| `http({ load, save, … })` | Your HTTP backend: loads the board's Yjs state, saves local edits as merged, debounced Yjs updates. See [http()](#http) |
| `websocket({ url, … })` | Live collaboration through a [y-websocket](https://github.com/yjs/y-websocket) server, with presence. See [websocket()](#websocket) |

```ts
import { sketch } from '@toantranmei/sketch-block'
import { indexeddb, memory } from '@toantranmei/sketch-block/providers'

sketch.configure({ provider: indexeddb({ prefix: 'my-app' }) })
```

`websocket()` loads the optional peer dependency `y-websocket` only when a board connects. Some bundlers still
resolve that dynamic import at build time, so install `y-websocket` (or mark it external) even if you don't use
`websocket()`.

### http()

```ts
import { http } from '@toantranmei/sketch-block/providers'

sketch.configure({
  provider: http({
    // the stored Yjs state (an update), or null for a new board
    load: async id => {
      const res = await fetch(`/api/boards/${encodeURIComponent(id)}`, {
        headers: auth(),
        signal: AbortSignal.timeout(10_000), // a hung server falls back to the offline cache
      })
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`load ${res.status}`)
      return res.arrayBuffer()
    },
    // a Yjs update to merge into the stored state
    save: async (id, update) => {
      const res = await fetch(`/api/boards/${encodeURIComponent(id)}`, { method: 'POST', body: update, headers: auth() })
      if (!res.ok) throw new Error(`save ${res.status}`)
    },
    uploadImage: file => uploadFile(file), // optional, see Images
    debounceMs: 1000, // default
    offline: true,    // default: also keep the board in IndexedDB
  }),
})
```

- Local edits are merged (`Y.mergeUpdates`) and saved 1 s after the last one (at least every 5 s during a long
  burst). A failed save keeps the merged update and retries after 1 s, 2 s, 4 s … up to 30 s. Closing the board
  attempts a final save.
- **Timeouts:** the provider waits for `load` as long as it takes (the board shows *Loading…*). Give the request
  a timeout, as above with `AbortSignal.timeout`, so a hung server falls back to the offline cache (or fails).
- **Corrupt data:** when `load` returns bytes that are not a Yjs update, `connect` rejects (the board shows its
  load error); during the background retries of an offline start, the status turns to error and loading keeps
  retrying.
- **Server side:** store the board as a Yjs state. On `save`, merge the update into it, e.g.
  `Y.mergeUpdates([stored, update])` with the `yjs` package (or apply it to a `Y.Doc`). Updates are idempotent and
  commutative, so a retried or reordered save is harmless. Authenticate `load` / `save` as usual (cookies, a
  header): the provider only calls your functions.
- **Offline cache** (`offline: true`): the board is also kept in IndexedDB (`mei-sketch:<id>`). When the server
  cannot be reached it opens from the cache (status *offline*) and keeps retrying; after a successful load,
  edits only this browser has are sent to the server (computed by state vector). Without a cache, `connect`
  rejects while the server is down.
- **Board ids** are `bd_` plus 10 URL-safe characters. Every provider rejects an id that does not match
  `isBoardId` (1–64 of `A–Z a–z 0–9 _ -`; exported from the main entry), and a block whose document holds an
  invalid id gets a fresh one when it opens. Still encode the id in URLs (`encodeURIComponent`), as above.
- `http()` has no presence: there is no live channel. Peers see each other's edits the next time they open the
  board.

### websocket()

```ts
import { websocket } from '@toantranmei/sketch-block/providers'

sketch.configure({
  provider: websocket({
    url: 'wss://sync.example.com', // the room is the board id
    params: () => ({ token: getToken() }), // query parameters, read on every (re)connect
    offline: true,          // default: also keep the board in IndexedDB
    connectTimeoutMs: 4000, // default
    uploadImage: file => uploadFile(file), // optional, see Images
  }),
  user: () => ({ name: currentUser.name, color: currentUser.color }),
})
```

- Install the optional peer dependency: `npm i y-websocket` (see the note above the [http()](#http) section).
- `connect` resolves after the first sync with the server, or after `connectTimeoutMs`: then with the IndexedDB
  copy (`offline: true`) or an empty board, while it keeps reconnecting in the background.
- **Server:** any y-websocket compatible server. The reference one is
  [`@y/websocket-server`](https://github.com/yjs/y-websocket-server): `npm i -D @y/websocket-server`, then
  `HOST=localhost PORT=1234 npx y-websocket` serves `ws://localhost:1234`. **Install note:** version 0.1.5
  imports `yjs`, but its `@y/protocols` range resolves to a release built on the renamed `@y/y` package, and the
  two Yjs copies make the server drop updates. Pin both to the Yjs 13 line the clients use. With pnpm
  (`overrides` in `pnpm-workspace.yaml`, or `pnpm.overrides` in `package.json`):
  `{ "@y/websocket-server>yjs": "^13.6.0", "@y/websocket-server>@y/protocols": "1.0.6-2" }`. With npm, in
  `package.json`: `"overrides": { "@y/websocket-server": { "yjs": "^13.6.0", "@y/protocols": "1.0.6-2" } }`.
  This monorepo's playground does that, runs the server with `pnpm sync`, and opens
  shared boards with `?sync=1` or `/sketch-collab?board=<id>`.
- **Auth:** `params` become URL query parameters of the WebSocket request (e.g. `?token=…`). Check them in the
  server's `upgrade` handler before accepting the connection, and that the user may open the room (the board id).
  `params` is called again before every reconnect, so a renewed token is picked up. A server that closes the
  connection for good shows the error status; when it does so before the first sync, `connect` resolves at once
  (with the IndexedDB copy or an empty board) instead of waiting for `connectTimeoutMs`.
- **Persistence:** the reference server keeps rooms in memory only: they are gone when it restarts. For
  production, store each room's Yjs state: with `@y/websocket-server`, embed it and register
  `setPersistence({ bindState, writeState })` (load the stored state into the room's doc, save its updates), or
  use a server with storage built in (e.g. Hocuspocus, y-sweet). With `offline: true` clients also keep a copy
  in IndexedDB and send what the server lacks when they reconnect.
- **Images:** inline images are sent to every peer, so set an uploader for anything but small images, and serve
  uploaded images with CORS headers (see [Images](#images)).

### Connection status

For networked providers (`http()`, `websocket()`), the block bar shows a small status dot while the board is open,
with a tooltip: green when online / saved, amber while connecting / saving, grey when offline, red on an error
(e.g. the server refused the connection, or a save keeps failing). Local providers (`indexeddb()`, `memory()`) have
no status and show no dot. A custom provider can report one through `BoardConnection.status`
(`{ get(), on(cb) }`).

### Presence and follow

On a `websocket()` board (or any connection with an `awareness`), collaborators see each other live:

- **Cursors** with the collaborator's name, their **selection** outlined in their color, and their **laser**
  trail. Updates are sent at most every 50 ms.
- **Avatars** of the people on the board (top right, up to 5 plus a count). Click one to **follow** their view:
  your board pans and zooms with theirs. A pan, zoom or click of your own, `Esc` or the pill's close button stops
  following.
- **Identity:** `sketch.configure({ user })` takes `{ name, color }` or a function returning it. Without one,
  each client is a guest ("Khách N" / "Guest N") with a color picked from its Yjs client id.

### Concurrent edits

Boards are Yjs documents, so concurrent edits merge without conflicts. A few things to know:

- **Each element property is last-writer-wins.** Two people changing the same property (say, the color of one
  shape) keep one value. Arrays such as `groupIds` are one value too: if two people group or ungroup the same
  element at the same time, one side's grouping is kept.
- **Derived data is repaired.** An arrow's geometry follows the shapes it is bound to, and an element's frame follows
  where it is. When concurrent edits merge into a state nobody wrote (an arrow bound to a shape a peer moved, a
  child of a frame a peer deleted), every client recomputes it the same way, so all peers converge. A board is also
  checked once when it opens (a server state merged with offline edits) and when a read-only board becomes
  editable. Repairs are not undo steps.
- **Undo is local:** `Ctrl/⌘ + Z` undoes only your own edits, never a collaborator's.

### Custom provider

Implement `SketchProvider` to keep boards on your backend:

```ts
import type { BoardConnection, SketchProvider } from '@toantranmei/sketch-block'
import * as Y from 'yjs'

const api: SketchProvider = {
  // Required: return the board's Y.Doc. `existed: false` means nothing was stored for this id.
  async connect(boardId): Promise<BoardConnection> {
    const doc = new Y.Doc()
    const update = await fetchBoard(boardId) // Uint8Array | null
    if (update) Y.applyUpdate(doc, update)
    const save = () => saveBoard(boardId, Y.encodeStateAsUpdate(doc))
    doc.on('update', save)
    return { doc, existed: !!update, destroy: () => { doc.off('update', save); doc.destroy() } }
  },
  // Optional: store the preview yourself and return its URL (default: a data URL in the document).
  async savePreview(boardId, preview: Blob) {
    return uploadFile(`sketch/${boardId}`, preview)
  },
  // Optional: upload an image added to a board and return its URL (see "Images" below).
  async uploadImage(file: File) {
    return uploadFile(`sketch/images/${file.name}`, file)
  },
  // Optional: copy a board server-side when a block is pasted or duplicated (default: connect + copy).
  async clone(from, to) {
    await copyBoardOnServer(from, to)
  },
}

sketch.configure({ provider: api })
```

### Export and import boards

The document only holds board ids; a **bundle** carries the boards with it (e.g. to move a document between
backends or keep a full backup):

```ts
import { collectBoardIds } from '@toantranmei/sketch-block' // pure, no yjs
import { exportBoards, importBoards } from '@toantranmei/sketch-block/providers'

const doc = editor.getJSON()
collectBoardIds(doc) // ['bd_…', …] depth-first, each once (invalid ids skipped)

const blob = await exportBoards(doc, provider) // JSON Blob
const { doc: imported, imported: ids, skipped } = await importBoards(file, otherProvider)
editor.commands.setContent(imported)
```

- Format: `{ type: 'mei-sketch/bundle', version: 1, doc, boards: { [boardId]: base64 Yjs state }, missing }`.
  Boards the provider has nothing stored for are left out and listed in `missing`.
- `importBoards` accepts a `Blob`/`File` or its text. It rejects files over 50 MB, invalid JSON, or a wrong `type`
  or `version`. A malformed board (bad base64 or Yjs data) is skipped and listed in `skipped`; it never throws for
  one bad board.
- Only boards the bundled document references (`collectBoardIds(doc)`) are imported; other entries in `boards`
  are listed in `skipped`, so a crafted bundle cannot write to unrelated boards. Invalid ids (`isBoardId`) are
  skipped too.
- Import **merges** into the provider's board with the same id (Yjs updates merge): existing content is kept, and
  importing twice changes nothing.

## Storage

- **The document** stores only `{ boardId, preview, height, version }` on the `sketch` node, never the
  drawing itself. `preview` is an image data URL, or the URL returned by `savePreview`. Read-only editors
  and exported HTML show this image:
  - **Boards without images:** an SVG (a PNG up to 1200 px wide when the SVG is over 150 KB). In a dark editor
    the SVG is inverted (keeping hues), so strokes stay readable.
  - **Boards with images:** the board is drawn onto a canvas (up to 1200 px wide) and encoded as WebP at
    quality 0.85, or JPEG 0.85 in browsers that cannot encode WebP. It is a white card in both themes (never
    inverted, so photos keep their colors).
- **The board** lives in the provider. With the default IndexedDB provider it is stored **per browser
  and device**: the same document opened on another device (or after clearing site data) shows the
  preview, and the board opens empty with a "not available on this device" notice. Use `http()`,
  `websocket()` or a custom provider to sync boards between devices.
- The preview is regenerated 2 s after the last edit and when you leave the board.
- **Copies get their own board.** When a paste, drop or the block's *Duplicate* creates a copy of a block, the
  copy gets a new id (`bd_…`) and the board is copied into it: `provider.clone(from, to)` when the provider
  implements it, else the block connects to both boards and copies the Yjs state. A copy is a block whose
  `boardId` is already used elsewhere in the document, and also a block pasted or dropped from **another**
  document or editor: copies are independent, an edit in one never shows in the other. The copy keeps the
  original's preview; it shows "Copying board…" and Interact is disabled until the copy finishes. If the copy
  fails, an inline error is shown and the new block keeps its new id with an empty board (and the preview).
- **Moves keep the id.** Dragging a block within the document, and cut + paste in the same editor (within
  10 minutes of the cut), keep its board. The id change is part of the same editor undo step as the paste or
  duplicate; undo and redo never copy the board again. Set `sketch.configure({ onPasteClone: false })` to let
  copies share the board instead.
- **Copying needs the source board.** A block pasted from another document whose board is not stored where this
  editor can read it (e.g. the default IndexedDB provider, and the other document's board lives in another
  browser) cannot be copied: the new block keeps its new id and the preview, and says the content could not be
  copied. A custom `provider.clone` can reject with an error whose `code` is `BOARD_MISSING` (exported from the
  main entry) to show that message.
- With a networked provider, a copy fails (and shows the error) when the server does not confirm it and the
  provider has no offline cache to hold it.
- Preview, board id and version changes are not editor undo steps: `Ctrl/⌘ + Z` in the text only
  undoes inserting or deleting the block.

## Tools

Pick a tool in the toolbar or with its key (Excalidraw shortcuts; tool keys only act without `Alt`, `Ctrl` or
`⌘`, so they never clash with browser or OS shortcuts). After drawing, the board goes back to
**Select** unless the tool is locked (`Q`, or the lock button).

| Tool | Key | Notes |
| --- | --- | --- |
| Select | `V` / `1` | Click, `Shift`+click, or drag a marquee |
| Hand | `H`, or hold `Space` | Pan |
| Rectangle | `R` / `2` | `Shift`: square; `Alt`: from the center |
| Diamond | `D` / `3` | |
| Ellipse | `O` / `4` | `Shift`: circle |
| Arrow | `A` / `5` | Drag for two points, or click to add points; `Enter` / `Esc` finishes |
| Line | `L` / `6` | Same as arrow, without heads |
| Pen | `P` / `7` | Uses pen pressure when available |
| Highlighter | `M` | Wide, translucent ink |
| Text | `T` / `8` | Click to add text, click a text to edit it, click a shape to edit its label. `Esc` or `Ctrl/⌘ + Enter` commits |
| Shapes | toolbar | Opens the [shape library](#shape-library) popover; the button then stands for the last shape picked |
| Sticky note | `S` | Click for a 200 × 200 note, or drag for any size; see [Sticky notes](#sticky-notes) |
| Frame | `F` | Drag to create a frame; see [Frames](#frames) |
| Image | toolbar | Opens the file picker; images can also be pasted or dropped. See [Images](#images) |
| Eraser | `E` / `0` | Drag over elements, release to delete them (one undo step) |
| Laser | `K` | A fading trail for pointing; nothing is saved |
| Eyedropper | `I` | Click an element to take its stroke color, `Alt`+click to take its background color. Applies to the selection and the next element, then returns to the previous tool |
| Lasso | toolbar | Draw a free shape; selects the elements fully inside |
| Tool lock | `Q` | Keep the current tool after drawing |

Double-click a shape to edit its label, a text to edit it, an arrow or a line to edit its label. A selected line or
arrow shows a handle on each point: drag to move one.

### Style panel

The panel opens next to the toolbar while a drawing tool is active or something is selected, and edits
the selection (or sets the style for the next element):

- **Stroke** and **background** colors from a fixed palette, plus a custom color. Colors are stored as hex,
  so previews and other viewers show the same colors (in dark theme only the default black is drawn light)
- Fill style (hachure, cross-hatch, solid), stroke width, stroke style (solid, dashed, dotted),
  sloppiness, edges (sharp / round), opacity
- Arrowheads (none, arrow, triangle, dot, bar) and routing (straight, elbow, curved) for lines and arrows
- Font family (hand-written, normal, code), size (S / M / L / XL) and alignment for text and labels
- Note color for sticky notes (8 pastel colors)
- Layer order: send to back, bring to front
- Group / ungroup and lock / unlock
- With 2 or more elements selected: align left, center, right, top, middle, bottom; with 3 or more: distribute
  horizontally or vertically (equal gaps). A group counts as one element, and locked elements stay put

## Miro features (M2)

### Sticky notes

- `S`, then click: a 200 × 200 note centered at the pointer, in the last note color used; drag instead for any size.
  The text editor opens right away.
- The text shrinks to fit the note: the largest of 36, 28, 20, 16 and 12 px that fits.
- While typing in a note, `Tab` commits it and creates the next note to its right, ready to type in. With one note
  selected (not editing), `Tab` or `Ctrl/⌘ + Enter` does the same. `Esc` or `Ctrl/⌘ + Enter` commits the text.
- Pick the note color in the style panel: `#fff3bf` (default), `#ffe3e3`, `#d3f9d8`, `#d0ebff`, `#f3d9fa`,
  `#ffe8cc`, `#e9ecef`, `#c5f6fa`.

### Shape library

The shapes button in the toolbar opens a popover with all 15 shapes: rectangle, ellipse, diamond, triangle,
pentagon, hexagon, star, parallelogram, trapezoid, cylinder, cloud, callout, document, stadium and block arrow.
Rectangle, diamond and ellipse also keep their own buttons and keys. Every shape takes a label, a fill and
arrows. `Esc` closes the popover; clicking the shapes button again closes it too.

### Images

- Add images with the **Insert image** button, by pasting an image (`Ctrl/⌘ + V`), or by dropping image files on
  the board. SVG files are not accepted.
- **Where images are stored:** the provider's `uploadImage`, else the editor's `uploadImage` option, else the
  image is stored in the board as a data URL.
- **CORS:** the URLs returned by `uploadImage` should be served with CORS headers
  (`Access-Control-Allow-Origin` for the editor's origin). The board shows them either way, but the preview is
  drawn on a canvas: an image without CORS headers would taint it, so the preview shows a placeholder in its
  place.
- **Data-URL fallback:** the image is scaled down to at most 2048 px on its long edge and re-encoded (JPEG at
  quality 0.85, or PNG when it has transparency). Images still over 4 MB after that are refused with an inline
  message. Set an uploader for large or many images.
- **Shared boards:** on a board opened through a networked provider (`http()`, `websocket()`) every peer
  downloads inline images, so without an uploader a data URL larger than `maxInlineImageBytes` (an option of
  both providers, default `256_000` bytes) is refused with an inline message asking for an uploader.
- **Allowlist / proxy:** a provider may implement `resolveImageSrc(src): string | null` (also an option of
  `http()` and `websocket()`). Every image load goes through it first: return the URL to load (e.g. your image
  proxy), or `null` to block the image (a placeholder is drawn). The board keeps the original `src`; previews
  use the resolved URL too. It runs on every lookup while drawing, so keep it cheap and pure. Boards with
  different providers on one page each use their own resolver.

```ts
http({
  load, save,
  resolveImageSrc: src => src.startsWith('https://cdn.example.com/')
    ? src
    : src.startsWith('data:') ? src : `https://proxy.example.com/img?u=${encodeURIComponent(src)}`,
})
```
- **Crop:** double-click an image, or select it and press `Enter`. Drag the handles or move the crop rectangle,
  then press `Enter` or double-click to apply (`Esc` cancels). Cropping is one undo step.

### Frames

- `F`, then drag: a frame named "Frame 1", "Frame 2"… It goes behind the other elements and takes in the elements
  fully inside it.
- Elements drawn, pasted or moved fully inside a frame join it; moving one out leaves it. A frame clips its
  elements to its box.
- Moving a frame moves its elements. Click the frame's border or name to select it (clicks inside reach its
  elements).
- Double-click the frame's name to rename it (`Enter` commits).

### Arrows that stay attached

- Release an arrow end within 12 px of a shape, sticky note, text or image outline and it binds to it (the
  target is highlighted while you drag). The tip stays 4 units off the outline.
- Moving, resizing or rotating a bound element re-routes its arrows. Dragging a bound end away, or moving the arrow without its targets, detaches it;
  deleting a target leaves the arrow in place, unbound.
- Frames, lines and pen strokes are not bindable.

### Arrow labels

Double-click an arrow (or a line) to add or edit a label at its middle. The label uses the arrow's text style
from the style panel, and the line is drawn with a gap behind the text.

### Quick flowchart

With exactly one unlocked shape or sticky note selected, `Ctrl/⌘ + →`, `←`, `↑` or `↓` creates a copy next to it
in that direction (offset: its size + 80), connects the two with an arrow in the current style, and selects the
copy, so you can keep going. If the spot is taken, the copy moves sideways until it finds a free one. One undo
step.

### Group and lock

- `Ctrl/⌘ + G` groups the selection, `Ctrl/⌘ + Shift + G` ungroups it (one level). Clicking any member of a
  group selects the whole group; groups can be nested.
- `Ctrl/⌘ + Shift + L` locks the selection (or unlocks it when everything is locked). Locked elements cannot be
  moved, resized, edited or deleted until unlocked.
- Both are also in the style panel.

### Align and distribute

With elements selected, the style panel shows align (left, center, right, top, middle, bottom; 2 or more) and
distribute (horizontally, vertically; 3 or more) buttons. Each is one undo step.

### Grid and snapping

- `Ctrl/⌘ + '` shows a 20-unit grid and snaps drawing, moving and resizing to it.
- `Alt + S` toggles snapping to other elements (on by default): edges and centers line up with nearby elements,
  with guide lines while dragging.
- Hold `Alt` while dragging to turn snapping off for that drag.
- Both toggles are also in the zoom controls. They are settings of the open board (kept when switching between the
  inline and full-screen views), not saved with the board: a board opens with the grid off and object snapping on.

### Clipboard

- `Ctrl/⌘ + C`, `X`, `V` copy, cut and paste the selection through the system clipboard (as JSON text), so
  elements can move between boards and tabs. Pasted elements land at the pointer (or next to the
  originals), with new ids.
- **Size limit:** a copied selection may be up to 24 million characters of JSON (images stored as data URLs
  count in full). Over that, copy and paste show an inline "too large" message and nothing is copied or
  pasted; use an image uploader to keep boards with many images small. Text from other apps is ignored above
  2 million characters.
- Pasting plain text creates a text element (cut to 10,000 characters).
- `Ctrl/⌘ + D` duplicates the selection.
- `Ctrl/⌘ + Alt + C` copies the style of the selected element; `Ctrl/⌘ + Alt + V` applies it to the selection.

### Search and links

- `Ctrl/⌘ + F` inside the board opens a search box (top right) instead of the browser's find. It matches text
  elements, shape and arrow labels, sticky notes and frame names, ignoring case and Vietnamese diacritics
  (`duong` finds "Đường"). Matches are highlighted; `Enter` / `Shift + Enter` step to the next / previous
  match, centering it (the zoom changes only when the match does not fit) and selecting it. `Esc` closes the box.
- With one element selected, the style panel's **Link** field sets the element's link (on `Enter` or when the
  field loses focus; empty removes it). Allowed: `https:`, `http:` and `mailto:` URLs, and `#el:<id>` links to
  another element of the board. Anything else (`javascript:`, `data:`, relative URLs...) shows a hint and is
  not saved, and is read as "no link" wherever it comes from (a peer, a paste, an old board).
- An element with a link shows a small link badge at its top-right corner when hovered or selected. Clicking the
  badge, or `Ctrl/⌘ + click` on the element, follows the link: web and mail links open in a new tab (with no
  opener or referrer); `#el:` links pan and zoom to their element and select it. Copies of linked elements pasted
  together keep their `#el:` links pointing at each other.

### Fonts

Text uses **[Patrick Hand](https://fonts.google.com/specimen/Patrick+Hand)** (SIL Open Font License 1.1,
license text in `dist/fonts/OFL.txt`), self-hosted and covering Vietnamese. The font files (latin,
latin-ext and vietnamese subsets, about 55 KB of woff2 in total) load lazily with the board engine, not
with the editor. The "normal" and "code" families use the system fonts. Preview images reference the
font by name only and fall back to a cursive font where it is not installed.

## Keyboard & mouse

| Key | Action |
| --- | --- |
| Tool keys | See [Tools](#tools) |
| `Shift` while drawing / resizing | Keep proportions (square, circle) |
| `Alt` while drawing / resizing | From the center (and no snapping) |
| `Shift` while rotating | Snap the angle |
| `Delete` / `Backspace` | Delete the selection |
| Arrow keys (`Shift` = 10 px) | Nudge the selection |
| `Ctrl/⌘ + A` | Select all |
| `Ctrl/⌘ + F` | [Search](#search-and-links) (`Enter` / `Shift + Enter` next / previous, `Esc` closes) |
| `Ctrl/⌘ + click` | Follow the element's [link](#search-and-links) |
| `Ctrl/⌘ + C` / `X` / `V` | Copy, cut, paste |
| `Ctrl/⌘ + D` | Duplicate |
| `Tab`, `Ctrl/⌘ + Enter` | Next sticky note (one note selected, or while typing in one: `Tab`) |
| `Enter` | Crop the selected image (in crop mode: apply) |
| `Ctrl/⌘ + ←` / `→` / `↑` / `↓` | [Quick flowchart](#quick-flowchart) |
| `Ctrl/⌘ + G`, `Ctrl/⌘ + Shift + G` | Group, ungroup |
| `Ctrl/⌘ + Shift + L` | Lock / unlock |
| `Ctrl/⌘ + '` | Grid on / off |
| `Alt + S` | Snap to objects on / off |
| `Alt` while dragging | No snapping for this drag |
| `Ctrl/⌘ + Alt + C` / `V` | Copy / paste style |
| `Ctrl/⌘ + Z`, `Ctrl/⌘ + Shift + Z` / `Ctrl/⌘ + Y` | Undo, redo (your own edits only) |
| `Alt + Z` | Zen mode: hide the toolbar and panels (`Esc` leaves it) |
| `Alt + R` | View mode: pan and zoom only, no editing |
| Wheel / trackpad | Pan |
| `Ctrl/⌘ + wheel`, pinch | Zoom at the cursor |
| `Esc` | See [Escape](#escape) |

### Escape

`Esc` does the most specific thing first, and only leaves the board when there is nothing else to do:

1. A gesture in progress: a multi-point line or arrow is **finished** (kept, if it has at least two points);
   a drag (move, resize, rotate, point drag, drawing) is cancelled; text editing commits; cropping is cancelled.
2. A tool other than **Select** is active: switch back to Select.
3. Something is selected: clear the selection.
4. Zen mode: leave zen mode.
5. Otherwise: leave the board (back to the document).

In view mode (`Alt + R`) step 2 is skipped, so the hand tool stays active.

## Roadmap

- **M0 – Foundation (done):** the `sketch` block, Yjs board store, two-layer canvas renderer with caching and level of detail, pan/zoom, select/move/resize/rotate, rectangle/ellipse/diamond, undo/redo, IndexedDB and memory providers, SVG preview.
- **M1 – Drawing tools (done):** pen, highlighter, line, arrow (straight/elbow/curved), text and shape labels, eraser, laser, lasso, style panel, eyedropper, copy/paste/duplicate and copy style, zen and view mode.
- **M2 – Miro core (done):** sticky notes, images with crop, frames, shape library and flowchart shapes, arrows bound to shapes, arrow labels, quick flowchart (`Ctrl/⌘ + arrow`), group/lock, align/distribute, grid and snapping.
- **M3 – Backend & collaboration (done):** `http()` and `websocket()` providers with an offline cache and a status dot, live cursors / selections / laser and follow mode, convergence repair of derived data, cloning boards on paste and duplicate, board bundles (export / import), search, element links.
- **M4 – Export & library:** PNG/SVG/clipboard export, library, templates, `.excalidraw` import, minimap, performance work.
- **M5 – Rich content (→ 1.0):** web embeds, emoji/stamps, code blocks, tables, cards/kanban, Mermaid → sketch, mind maps, auto layout.

## License

MIT
