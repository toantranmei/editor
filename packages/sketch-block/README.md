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

The package has not been published yet. Its first release, **0.1.0**, ships M0 (foundation), M1
(drawing tools) and M2 (Miro core) together: the pending M0, M1 and M2 changesets are all minor bumps from `0.0.0`.

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
  // Optional: upload an image added to a board and return its URL (see "Images" below).
  async uploadImage(file: File) {
    return uploadFile(`sketch/images/${file.name}`, file)
  },
}

sketch.configure({ provider: api })
```

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
- **M3 – Backend & collaboration:** `http()` and `websocket()` providers with live cursors, cloning boards on paste and duplicate (until then a copied block shares its board with the original), board export, search, element links.
- **M4 – Export & library:** PNG/SVG/clipboard export, library, templates, `.excalidraw` import, minimap, performance work.
- **M5 – Rich content (→ 1.0):** web embeds, emoji/stamps, code blocks, tables, cards/kanban, Mermaid → sketch, mind maps, auto layout.

## License

MIT
