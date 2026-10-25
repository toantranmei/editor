# Sketch Block M2 (Miro Core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@toantranmei/sketch-block@0.3.0` with:
- sticky notes and quick-create
- an extended shape library and flowchart shapes
- images with crop
- frames
- arrows bound to shapes, arrow labels, and quick flowchart creation (Ctrl/Cmd + Arrow)
- group/ungroup and lock
- align/distribute
- grid and object snapping with guides

**Architecture:** builds on the M1 `ElementKind` registry. New element types are `sticky`, `image` and `frame`, each with its own kind. New shape types are added to the shape kind through outline generators.
- Shared props `groupIds` and `frameId` are added to `CommonProps`.
- Arrows get `startBinding`/`endBinding`, which are anchors in the bound element's local unit frame. Arrows also get `label` plus a text style.
- Bound arrows are recomputed in the same write as the change that moved their target. This is done by a pure `followBindings(store, changedIds)` used by every writer: select move/resize/rotate, align, paste and quick-create.

**Tech Stack:** same as M1. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-10-25-sketch-block-design.md` → "Các mốc" M2 (B1–B6, C1–C3, D4–D6).

## Global Constraints
- Everything in M1's Global Constraints still holds: bundle split, Y layout, one gesture = one undo step, w,h ≥ 0, hex colors, `--me-*` tokens, vi/en, no attribution lines, explicit staging.
- M0/M1 boards open unchanged: `normalizeElement` defaults `groupIds: []`, `frameId: null`, `startBinding: null`, `endBinding: null`, and for linear elements `label: ''` plus `DEFAULT_STYLE` text props.
- Sticky palette (exact): `['#fff3bf', '#ffe3e3', '#d3f9d8', '#d0ebff', '#f3d9fa', '#ffe8cc', '#e9ecef', '#c5f6fa']`. Default `#fff3bf`, default size 200×200. Auto-fit font: the largest of `[36, 28, 20, 16, 12]` that fits within `w-24 × h-24`.
- Image: the board accepts `uploadImage?: (file: File) => Promise<string>`. SketchView passes `provider.uploadImage ?? editor.storage.meiConfig.uploadImage ?? null`. Without one, images become data URLs downscaled to max 2048 px on the long edge (JPEG quality 0.85, or PNG when the source has alpha), and are rejected above 4 MB after encoding with a toast-like inline error message.
- Snap: grid 20 units; object snap threshold `6 / zoom`. Shortcuts: `mod+'` toggles grid, `Alt+S` toggles object snap. Both settings are board-local and default to grid off, object snap on.
- Binding: an arrow endpoint binds when it is released within `12 / zoom` of a bindable element's outline (shapes, sticky, text, image; not frame, not linear/freedraw). Gap between arrow tip and outline: `4` units.
- Quick create: `mod+ArrowRight/Left/Up/Down` with exactly one unlocked shape or sticky selected creates a copy at offset `size + 80` in that direction, plus a bound arrow (current style) between them, and selects the copy. It is one undo step. If the slot is occupied (it intersects an existing element), it shifts perpendicular by `size + 40` until free (max 10 tries).

## Review Focus
1. Deleting, undoing or remotely editing a bound target must never leave an arrow pointing at NaN or a missing element. Missing targets are treated as unbound: the arrow keeps its last points. → Task 6 tests.
2. Moving a frame moves its children exactly once. A child that is also selected must not be moved twice. → Task 5 test.
3. Group selection: clicking a member selects the whole outermost group. Ungroup of nested groups peels one level. Copy/paste keeps groups (new group ids) and does not merge with existing groups. → Task 9 tests.
4. Images:
   - A failed load or upload never breaks the board. Show a placeholder box with an icon; no rejection escapes.
   - The preview of a board containing cross-origin images still saves: the tainted canvas is caught, and those images are omitted.
   → Task 4 and Task 12 tests.
5. Snapping must never fight the user. Snapping is off while Alt is held during a drag (temporary disable). Guides disappear on pointer up and Escape. → Task 11 tests.

---

### Task 1: Model extensions
**Files:** modify `src/model/types.ts`, `src/model/store.ts` (only if needed), and update tests. Test: `test/model-m2.test.ts`.
**Produces:**
```ts
type ShapeType = 'rectangle' | 'ellipse' | 'diamond' | 'triangle' | 'pentagon' | 'hexagon' | 'star' | 'parallelogram' | 'trapezoid'
  | 'cylinder' | 'cloud' | 'callout' | 'document' | 'stadium' | 'blockArrow'
type ElementType = ShapeType | 'line' | 'arrow' | 'freedraw' | 'text' | 'sticky' | 'image' | 'frame'
interface Binding { id: string; ax: number; ay: number }          // anchor in target's unrotated unit box (0..1), on/near outline
CommonProps += { groupIds: string[]; frameId: string | null }
LinearElement += TextStyle & { label: string; startBinding: Binding | null; endBinding: Binding | null }
interface StickyElement extends CommonProps, Omit<TextStyle,'fontSize'> { type: 'sticky'; text: string; color: string }   // stroke unused
interface ImageElement extends CommonProps { type: 'image'; src: string; naturalW: number; naturalH: number; crop: { x: number; y: number; w: number; h: number } | null }
interface FrameElement extends CommonProps { type: 'frame'; name: string }
isSticky, isImage, isFrame, isBindable(el) = isShape||isSticky||isText||isImage
```
- [ ] Tests:
  - `normalizes M1 elements with M2 defaults` (groupIds [], frameId null, linear label '' and null bindings).
  - `sticky defaults` (color '#fff3bf', w/h when created via defaults helper).
  - `image and frame normalize`.
  - `ElementInit accepts new types`.
- [ ] RED → implement (fix compile fallout minimally) → GREEN.
- [ ] Commit `feat(sketch-block): M2 element model`.

### Task 2: Shape library (B3, B4)
**Files:** modify `src/elements/shape.ts`. Create `src/elements/outlines.ts`. Test: `test/outlines.test.ts`.
**Produces:**
```ts
function shapeOutline(type: ShapeType, w: number, h: number): { kind: 'polygon'; points: LocalPoint[] } | { kind: 'path'; d: string; hitPolygon: LocalPoint[] }
```
- Exact geometry (box 0..w, 0..h):
  - triangle `[[w/2,0],[w,h],[0,h]]`
  - pentagon and hexagon: regular, inscribed in the box (hexagon flat sides left/right: `[[w*.25,0],[w*.75,0],[w,h/2],[w*.75,h],[w*.25,h],[0,h/2]]`)
  - star: 5-point, inner radius 0.5
  - parallelogram: skew `w*0.2`
  - trapezoid: top inset `w*0.2`
  - cylinder: path with ellipse caps of height `min(h*0.2, 24)`
  - cloud: path of 6 arcs
  - callout: rect with a tail at the bottom-left, 20% width, 20% height below; the box includes the tail
  - document: rect with a wavy bottom of amplitude `h*0.08`
  - stadium: rect with radius `h/2`
  - blockArrow: right-pointing, head 35% of w, shaft 50% of h
- `hitPolygon` samples curves at 24 segments.
- The shape kind uses `shapeOutline` for draw (rough polygon/path), svg, LOD (plain path) and hit (point-in-polygon when filled, polyline distance to the outline otherwise).
- rectangle/ellipse/diamond keep their M0 code paths, so their snapshots stay unchanged.
- [ ] Tests:
  - `every shape type yields a closed outline inside its box`
  - `triangle hit inside/outside`
  - `unfilled star hit near edge only`
  - `svg for each type renders without NaN`
  - `rect/ellipse/diamond svg unchanged` (existing fixture)
- [ ] RED → GREEN.
- [ ] Commit `feat(sketch-block): extended shape library`.

### Task 3: Sticky notes (B1, B2)
**Files:** create `src/elements/sticky.ts` and `src/tools/sticky.ts`. Modify `src/tools/controller.ts` (key `s`, Tab / mod+Enter quick-create, editing kind `'sticky'`) and `src/ui/TextEditor.vue` (sticky editing uses auto-fit size). Test: `test/sticky.test.ts`.
**Produces:**
- `stickyFontSize(el): number` returns the auto-fit size from the constraint list.
- Sticky kind:
  - draw: a solid fill rounded rect (radius 4, no rough), a soft shadow (offset 0,2, blur 6, rgba(0,0,0,.15)), and wrapped text centered at the auto-fit size using `fontFamily`.
  - visualPad 8 (shadow).
  - shapeKey: w, h, color, text, fontFamily, textAlign.
  - hit: the box.
  - resize: box only.
  - svg: rect + `<text>`.
- Tool:
  - Click creates a 200×200 sticky centered at the pointer, with color from the last-used sticky color (board-local), and starts editing.
  - Drag creates a sticky with the dragged size (min 40).
  - The tool returns to select unless locked.
- Quick create: with exactly one sticky selected and no editing, **Tab** or **mod+Enter** creates the next sticky to the right (gap 20, same size and color), selects it and starts editing. While editing a sticky, Tab commits and creates the next one. One undo step covers create + commit.
- StylePanel shows the sticky palette (8 swatches) as the color section when the selection is all stickies.
- [ ] Tests:
  - `auto-fit picks 36 for short text and 12 for long text`
  - `click creates sticky and edits`
  - `Tab creates next sticky to the right with same color`
  - `sticky color applied via applyStyle`
  - `svg contains text`
- [ ] Commit `feat(sketch-block): sticky notes`.

### Task 4: Images (B5)
**Files:** create `src/elements/image.ts`, `src/io/image-loader.ts`, `src/io/image-insert.ts` and `src/tools/crop.ts`. Modify `src/ui/SketchBoard.vue` (`uploadImage` prop, drop and paste of files, hidden file input exposed as `insertImage()`), `src/block/SketchView.vue` (pass the uploader) and `src/io/clipboard.ts` (paste files: images go to insert, everything else is ignored). Test: `test/image.test.ts`.
**Produces:**
```ts
loadImage(src: string): Promise<HTMLImageElement>          // cached by src; crossOrigin 'anonymous'; rejects → caller shows placeholder
getLoadedImage(src): HTMLImageElement | 'error' | undefined  // sync, for rendering; triggers load + onImageLoaded callbacks
onImageLoaded(cb: (src: string) => void): () => void         // board invalidates & cache-prunes on load
prepareImage(file: File, upload: ((f: File) => Promise<string>) | null): Promise<{ src: string; naturalW: number; naturalH: number }>
   // non-image/oversize → throws ImageInsertError(code: 'type' | 'size' | 'upload'); data-URL path downsizes per constraints
ToolController.insertImage(info, at: Point | null): void     // fits within 600×600 scene units preserving ratio, centered at `at` or viewport center; one undo step; selects it
```
- Image kind:
  - draw: `drawImage` of the cropped region when loaded. While loading or after an error, draw a placeholder (dashed rect + a centered small "image" glyph drawn as lines).
  - shapeKey: src, crop, w, h, plus the load state (so the bitmap rebuilds after load).
  - svg: `<image href preserveAspectRatio="none">` with a clipPath for the crop.
  - hit: the box.
  - resize: box (keep ratio by default; free when Shift).
- Crop mode:
  - Double-click an image in select mode, or press Enter with one image selected, to enter crop.
  - The full image is shown dimmed and the crop rect has 8 handles.
  - Enter or click outside commits `{ crop, w/h adjusted to keep scale }`; Escape cancels.
  - One undo step.
- Errors show an inline message in the board (`messages.imageError`: type, size, upload) for 4 s.
- [ ] Tests (stub `Image`, `createImageBitmap` not required):
  - `prepareImage rejects non-image`
  - `downscales large image data URL path`
  - `uses uploader when given`
  - `insertImage fits 600 box and is one undo step`
  - `placeholder drawn on load error and no throw`
  - `crop commit adjusts crop and box`
  - `paste of image file inserts`
  - `svg uses clipPath when cropped`
- [ ] Commit `feat(sketch-block): images with crop`.

### Task 5: Frames (B6)
**Files:** create `src/elements/frame.ts` and `src/tools/frame.ts`. Modify `src/render/static.ts` (clip children to frame), `src/tools/select.ts` (move children with frame; membership update on move end) and `src/model/scene.ts` if a children index is needed. Test: `test/frame.test.ts`.
**Produces:**
- `frameMembership(scene, el): string | null`: the topmost frame whose box fully contains the element's corners, or null.
- `childrenOf(scene, frameId): SketchElement[]`
- Frame kind:
  - draw: thin rect (stroke `#868e96` light / `#adb5bd` dark, 1 px / zoom-independent at render). The name is drawn above the top-left corner in 12 px normal font by the interactive/static overlay, not inside the bitmap, so it stays readable at every zoom.
  - fill: transparent.
  - hit: the border band (±6/zoom) or the name label.
  - svg: rect + name text.
- Frames are created by drag with key `f`; the default name is `Frame N`.
- New frames are reordered to the back (`reorderMany([id], 'back')`).
- Elements whose `frameId` is the frame render clipped to the frame box (static renderer: `save`, clip rect, draw children, `restore`). The ordering stays global, but clipping applies per child.
- Moving a frame moves all its children in the same write (one undo step). Children that are also selected are moved once.
- After a move/create/paste/resize ends, membership is recomputed for the affected elements and `frameId` is written only when it changed.
- Deleting a frame clears `frameId` on its children (same transaction).
- The frame name is edited by double-clicking the name label (TextEditor kind `'frame'`).
- [ ] Tests:
  - `element dropped inside frame gets frameId`
  - `moving frame moves children once even if selected`
  - `moving child out clears frameId`
  - `deleting frame clears children frameId in one undo step`
  - `children clipped` (recording fake: clip called before child draw)
  - `rename frame`
- [ ] Commit `feat(sketch-block): frames`.

### Task 6: Arrow binding (C1)
**Files:** create `src/geometry/binding.ts`. Modify `src/tools/linear.ts` (bind on create), `src/tools/select.ts` (rebind on endpoint drag; follow on move/resize/rotate), `src/render/interactive.ts` (highlight bind target) and `src/io/clipboard.ts` (pasted arrows keep bindings only to elements pasted with them; ids are remapped).
**Produces:**
```ts
outlineAnchor(target: SketchElement, scenePoint: Point): { ax: number; ay: number; distance: number }   // nearest outline point in unit coords
anchorScenePoint(target: SketchElement, b: Binding, gap: number, from: Point): Point                  // outline point, pushed outward by gap along the outward normal (approx: direction from target center)
findBindTarget(scene, p: Point, zoom: number, excludeIds: Set<string>): SketchElement | null         // within 12/zoom of outline, topmost bindable
followBindings(store: BoardStore, scene: Scene, changedIds: Iterable<string>): Record<string, ElementPatch>   // patches for arrows bound to changed ids; missing target → binding set null in patch
```
- Every writer that moves, resizes, rotates or aligns elements merges `followBindings` patches into the same `updateMany`. Deletion clears bindings pointing at deleted ids in the same transaction (`deleteSelection` and the eraser).
- Self-binding is prevented: both ends on the same element are allowed only with different anchors.
- [ ] Tests:
  - `arrow created between two rects binds both ends`
  - `moving bound rect updates arrow in same undo step`
  - `deleting target clears binding and keeps points`
  - `remote delete of target → next follow treats as unbound`
  - `rotated target anchor stays on outline`
  - `dragging endpoint away unbinds, onto another rect rebinds`
  - `paste remaps bindings among pasted elements only`
- [ ] Commit `feat(sketch-block): arrows bind to shapes`.

### Task 7: Arrow labels (C2)
**Files:** modify `src/elements/linear.ts`, `src/tools/controller.ts` (dblclick on a linear element edits its label) and `src/ui/TextEditor.vue` (`'label'` placement at the route midpoint).
- Label position: the midpoint along the routed polyline length.
- Draw the text with the element's text style. Before drawing, erase the line under the text box inside the element bitmap using `globalCompositeOperation='destination-out'` over the text bbox + 4 px padding.
- SVG uses a `<mask>` to cut the line.
- `visualPad` grows to include the label box when the label sticks out of the box.
- [ ] Tests:
  - `label midpoint on elbow route`
  - `bitmap erases under label` (fake ctx records destination-out)
  - `svg uses mask`
  - `dblclick arrow edits label`
- [ ] Commit `feat(sketch-block): arrow labels`.

### Task 8: Quick flowchart creation (C3)
**Files:** modify `src/tools/controller.ts`. Test: `test/flowchart.test.ts`.
- `ToolController.quickCreate(dir: 'left' | 'right' | 'up' | 'down'): boolean`, per the Global Constraints. The new element copies type, size, style and label `''`. The arrow is created with bindings on both ends (Task 6 helpers) using the current style's routing/arrowheads. Everything happens in one `createMany` (one undo step).
- [ ] Tests:
  - `mod+ArrowRight creates bound copy to the right`
  - `occupied slot shifts perpendicular`
  - `ignored with 0 or 2 selected`
  - `one undo step`
- [ ] Commit `feat(sketch-block): quick flowchart creation`.

### Task 9: Group, ungroup, lock (D4)
**Files:** modify `src/tools/controller.ts`, `src/tools/select.ts`, `src/io/clipboard.ts` (new group ids on paste) and `src/ui/StylePanel.vue` (group/ungroup/lock buttons).
- `group()` (mod+g): appends a new id to every selected element's `groupIds`. Needs at least 2 selected.
- `ungroup()` (mod+shift+g): removes the outermost (last) group id from the selected elements.
- Clicking a member selects all members of its outermost group.
- `toggleLock()` (mod+shift+l): all selected become locked, or all unlocked if all were locked. Locked elements stay selectable but immovable (M0 rule).
- Paste remaps `groupIds` to fresh ids consistently within the pasted set.
- [ ] Tests:
  - `group then click member selects group`
  - `nested ungroup peels one level`
  - `paste gets new group ids`
  - `toggleLock`
  - `group is one undo step`
- [ ] Commit `feat(sketch-block): group, ungroup and lock`.

### Task 10: Align and distribute (D5)
**Files:** create `src/geometry/align.ts`. Modify `src/tools/controller.ts` and `src/ui/StylePanel.vue` (align section when ≥2 selected; distribute when ≥3).
- `alignPatches(els, mode: 'left'|'hcenter'|'right'|'top'|'vcenter'|'bottom'): Record<id, {x,y}>` uses the AABB of `elementCorners` and treats groups as one unit.
- `distributePatches(els, axis: 'h'|'v')` gives equal gaps between AABBs, keeps the outer two in place, and treats groups as units.
- The controller applies the patches merged with `followBindings` in one `updateMany` (one undo step). Locked elements are skipped.
- [ ] Tests:
  - `align left`
  - `align vcenter`
  - `distribute h equal gaps`
  - `group treated as unit`
  - `bound arrows follow`
  - `one undo step`
- [ ] Commit `feat(sketch-block): align and distribute`.

### Task 11: Grid and object snapping (D6)
**Files:** create `src/geometry/snap.ts`. Modify `src/tools/select.ts`, `src/tools/shape.ts`, `src/tools/linear.ts`, `src/render/interactive.ts` (guides), `src/ui/ZoomControls.vue` (grid toggle and snap toggle buttons) and `src/ui/SketchBoard.vue` (`grid` state).
- `snapMove(moving: Box, candidates: Box[], threshold: number): { dx: number; dy: number; guides: Guide[] }` aligns left/center/right and top/middle/bottom edges.
- `snapPoint(p, grid: number | null)`.
- Grid on: positions and sizes snap to 20. Object snap on: during move/resize, snap to visible elements' AABBs (excluding the moving ones) within `6/zoom`. Holding Alt disables snapping for that drag.
- Guides are drawn as accent 1 px lines in the interactive layer and cleared on up and Escape.
- `Overlay.guides: { x1, y1, x2, y2 }[]`.
- [ ] Tests:
  - `snapMove aligns left edges within threshold`
  - `no snap beyond threshold`
  - `grid snaps create`
  - `alt disables snap`
  - `guides cleared on up`
  - `mod+' toggles grid`
- [ ] Commit `feat(sketch-block): grid and object snapping`.

### Task 12: UI integration, preview, messages
**Files:** modify `src/ui/Toolbar.vue`, `src/io/svg.ts`, `src/messages.ts` and `src/block/SketchView.vue`.
- Toolbar adds sticky (S, `StickyNote` icon), frame (F, `Frame`), image (`ImagePlus`, which opens the file picker; no key) and a "shapes" button that opens a small popover grid of all 15 shape types (`Shapes` icon). The rectangle/diamond/ellipse buttons stay. The selected shape type is remembered for the shapes button. Verify the lucide icon names exist and use similar ones if missing.
- `exportSvg` handles every new kind.
- `makePreview`: when the board contains images, render the preview through canvas (draw kinds with the image cache, `toDataURL` PNG ≤ 1200 px wide). If the canvas is tainted, catch the error and re-render without images (placeholders). Otherwise use the SVG path as before.
- Messages: vi and en for every new UI string.
- [ ] Tests:
  - `toolbar shows M2 tools`
  - `shapes popover sets tool to chosen shape`
  - `preview with image uses canvas path`
  - `tainted canvas falls back without images and does not throw`
  - `svg exports sticky, frame, image, labeled arrow`
- [ ] Commit `feat(sketch-block): M2 toolbar, preview and messages`.

### Task 13: E2E, bench, docs, changeset
- Extend `scripts/e2e-sketch.mjs`:
  - sticky (s, click, type "Ghi chú", Tab to create the next sticky)
  - two rects plus a bound arrow; move one rect and assert the arrow endpoint moved
  - frame around a rect, move the frame, assert the rect moved
  - mod+g group
  - preview visible after exit
  - reload persists
- Bench: add 1000 stickies + 500 bound arrows and measure dragging 50 bound shapes.
- README: document every M2 feature and shortcut, and mark M2 done in the roadmap.
- Changeset: `.changeset/sketch-block-m2.md` minor.
- Full verification: `pnpm build && pnpm typecheck && pnpm test && NUXT_IGNORE_LOCK=1 pnpm e2e:sketch`, `npm pack --dry-run`, `pnpm bench:sketch`.
- [ ] Commit `feat(sketch-block): M2 e2e, bench, docs`.
