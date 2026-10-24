# @toantranmei/sketch-block

Excalidraw-style whiteboard block for [`@toantranmei/editor`](https://www.npmjs.com/package/@toantranmei/editor).

- Hand-drawn shapes (rectangle, ellipse, diamond) drawn with [Rough.js](https://roughjs.com) on a Canvas2D board
- Select, move, resize, rotate, marquee selection, nudge with arrow keys; pan and zoom (10% – 3000%)
- Local undo / redo; boards are [Yjs](https://yjs.dev) documents, ready for collaboration
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
block shows its preview image; click **Edit** (or double-click) to draw, press `Esc` or click
outside to leave. The expand button opens the board full screen.

Options:

```ts
sketch.configure({
  provider: myProvider, // where boards live; default: IndexedDB in this browser
  defaultHeight: 480,   // px, for boards without a stored height (users drag 240–1600)
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

```ts
import { sketch } from '@toantranmei/sketch-block'
import { indexeddb, memory } from '@toantranmei/sketch-block/providers'

sketch.configure({ provider: indexeddb({ prefix: 'my-app' }) })
```

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
  // Optional, reserved for images on the board (M2): upload and return the URL.
  async uploadImage(file: File) {
    return uploadFile(`sketch/images/${file.name}`, file)
  },
}

sketch.configure({ provider: api })
```

## Storage

- **The document** stores only `{ boardId, preview, height, version }` on the `sketch` node, never the
  drawing itself. `preview` is an SVG data URL (a PNG up to 1200 px wide when the SVG is over 150 KB),
  or the URL returned by `savePreview`. Read-only editors and exported HTML show this image.
- **The board** lives in the provider. With the default IndexedDB provider it is stored **per browser
  and device**: the same document opened on another device (or after clearing site data) shows the
  preview, and the board opens empty with a "not available on this device" notice. Use a custom
  provider to sync boards between devices.
- The preview is regenerated 2 s after the last edit and when you leave the board.
- **Copies share the board.** Copy/paste, duplicating the block or pasting it into another document
  keeps its `boardId`, so both blocks open and edit the *same* board (each block keeps its own preview
  image, refreshed when that block saves). Giving a pasted block its own copy of the board is planned
  for M3. Until then, to start a separate board, insert a new sketch block instead.
- Preview, board id and version changes are not editor undo steps: `Ctrl/⌘ + Z` in the text only
  undoes inserting or deleting the block.

## Keyboard & mouse

| Key | Action |
| --- | --- |
| `V` / `1` | Select |
| `H`, or hold `Space` | Hand (pan) |
| `R` / `2` | Rectangle |
| `D` / `3` | Diamond |
| `O` / `4` | Ellipse |
| `Q` | Keep the tool after drawing (default: back to Select) |
| `Shift` while drawing / resizing | Keep proportions (square, circle) |
| `Alt` while drawing / resizing | From the center |
| `Shift` while rotating | Snap the angle |
| `Delete` / `Backspace` | Delete the selection |
| Arrow keys (`Shift` = 10 px) | Nudge the selection |
| `Ctrl/⌘ + A` | Select all |
| `Ctrl/⌘ + Z`, `Ctrl/⌘ + Shift + Z` / `Ctrl/⌘ + Y` | Undo, redo (your own edits only) |
| Wheel / trackpad | Pan |
| `Ctrl/⌘ + wheel`, pinch | Zoom at the cursor |
| `Esc` | Clear the selection; with nothing selected, leave the board |

## Roadmap

- **M1 – Drawing tools (0.2.0):** line/arrow, pen (perfect-freehand), text, eraser, style panel, Excalidraw shortcuts, copy/paste/duplicate.
- **M2 – Miro features (0.3.0):** arrows bound to shapes, sticky notes, frames, group/ungroup, lock, images, snapping.
- **M3 – Backend & collaboration (0.4.0):** `http()` and `websocket()` providers with live cursors, board export/import, cloning boards on paste and duplicate (until then a copied block shares its board with the original).
- **M4 – Export, library, polish (0.5.0 → 1.0):** PNG/SVG export, shape library, board templates, minimap, level of detail.

## License

MIT
