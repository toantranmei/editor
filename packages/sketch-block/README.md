# @toantranmei/sketch-block

Excalidraw-style whiteboard block for [`@toantranmei/editor`](https://www.npmjs.com/package/@toantranmei/editor).

- Hand-drawn shapes (rectangle, ellipse, diamond) drawn with [Rough.js](https://roughjs.com) on a Canvas2D board
- Lines and arrows (straight, elbow, curved), pen and highlighter ([perfect-freehand](https://github.com/steveruizok/perfect-freehand)),
  text and shape labels in a hand-written font with Vietnamese support
- Eraser, laser pointer, lasso, eyedropper; a style panel with an Excalidraw-like palette
- Select, move, resize, rotate, marquee selection, nudge with arrow keys; pan and zoom (10% – 3000%)
- Copy / paste (also between boards), duplicate, copy / paste style; zen and view mode
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

## Tools

Pick a tool in the toolbar or with its key (Excalidraw shortcuts). After drawing, the board goes back to
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
| Eraser | `E` / `0` | Drag over elements, release to delete them (one undo step) |
| Laser | `K` | A fading trail for pointing; nothing is saved |
| Eyedropper | `I` | Click an element to take its colors |
| Lasso | toolbar | Draw a free shape; selects the elements fully inside |
| Tool lock | `Q` | Keep the current tool after drawing |

Double-click a shape to edit its label, a text to edit it. A selected line or arrow shows a handle on each
point: drag to move one.

### Style panel

The panel opens next to the toolbar while a drawing tool is active or something is selected, and edits
the selection (or sets the style for the next element):

- **Stroke** and **background** colors from a fixed palette, plus a custom color. Colors are stored as hex,
  so previews and other viewers show the same colors (in dark theme only the default black is drawn light)
- Fill style (hachure, cross-hatch, solid), stroke width, stroke style (solid, dashed, dotted),
  sloppiness, edges (sharp / round), opacity
- Arrowheads (none, arrow, triangle, dot, bar) and routing (straight, elbow, curved) for lines and arrows
- Font family (hand-written, normal, code), size (S / M / L / XL) and alignment for text and labels
- Layer order: send to back, bring to front

### Clipboard

- `Ctrl/⌘ + C`, `X`, `V` copy, cut and paste the selection through the system clipboard (as JSON text), so
  elements can move between boards and tabs. Pasted elements land at the pointer (or next to the
  originals), with new ids.
- Pasting plain text creates a text element.
- `Ctrl/⌘ + D` duplicates the selection.
- `Ctrl/⌘ + Alt + C` copies the style of the selected element; `Ctrl/⌘ + Alt + V` applies it to the selection.

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
| `Alt` while drawing / resizing | From the center |
| `Shift` while rotating | Snap the angle |
| `Delete` / `Backspace` | Delete the selection |
| Arrow keys (`Shift` = 10 px) | Nudge the selection |
| `Ctrl/⌘ + A` | Select all |
| `Ctrl/⌘ + C` / `X` / `V` | Copy, cut, paste |
| `Ctrl/⌘ + D` | Duplicate |
| `Ctrl/⌘ + Alt + C` / `V` | Copy / paste style |
| `Ctrl/⌘ + Z`, `Ctrl/⌘ + Shift + Z` / `Ctrl/⌘ + Y` | Undo, redo (your own edits only) |
| `Alt + Z` | Zen mode: hide the toolbar and panels (`Esc` leaves it) |
| `Alt + R` | View mode: pan and zoom only, no editing |
| Wheel / trackpad | Pan |
| `Ctrl/⌘ + wheel`, pinch | Zoom at the cursor |
| `Esc` | Cancel the current gesture, then clear the selection; with nothing selected, leave the board |

## Roadmap

- **M0 – Foundation (done):** the `sketch` block, Yjs board store, two-layer canvas renderer with caching and level of detail, pan/zoom, select/move/resize/rotate, rectangle/ellipse/diamond, undo/redo, IndexedDB and memory providers, SVG preview.
- **M1 – Drawing tools (done):** pen, highlighter, line, arrow (straight/elbow/curved), text and shape labels, eraser, laser, lasso, style panel, eyedropper, copy/paste/duplicate and copy style, zen and view mode.
- **M2 – Miro core:** sticky notes, images with crop, frames, shape library and flowchart shapes, arrows bound to shapes, arrow labels, quick flowchart (`Ctrl/⌘ + arrow`), group/lock, align/distribute, grid and snapping.
- **M3 – Backend & collaboration:** `http()` and `websocket()` providers with live cursors, cloning boards on paste and duplicate (until then a copied block shares its board with the original), board export, search, element links.
- **M4 – Export & library:** PNG/SVG/clipboard export, library, templates, `.excalidraw` import, minimap, performance work.
- **M5 – Rich content (→ 1.0):** web embeds, emoji/stamps, code blocks, tables, cards/kanban, Mermaid → sketch, mind maps, auto layout.

## License

MIT
