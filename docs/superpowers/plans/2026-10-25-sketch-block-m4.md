# Sketch Block M4 (Export, Library, Templates, Minimap, Performance) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@toantranmei/sketch-block@0.5.0`:
- Export PNG, SVG and the clipboard image, for the whole board, a selection or a frame (F1).
- A personal shape library (F2).
- Board templates (F3).
- Import of `.excalidraw` files (F4).
- A minimap (D9).
- A performance pass on the deferred items from M1–M3.

**Architecture:**
- Export reuses the element kinds:
  - SVG goes through `exportSvg` (extended with an element subset, frame clipping, the resolver, and links as `<a>`).
  - PNG goes through an offscreen-canvas renderer that shares the canvas preview path.
- Library items are serialized element groups, in the same sanitized clipboard format, stored per viewer in localStorage. They can be dragged, or clicked to insert.
- Templates are static element sets built by code (no network), localized, and inserted like a paste.
- The `.excalidraw` import maps Excalidraw's element schema onto ours.
- The minimap renders the scene at LOD into a small canvas, throttled.

**Spec:** `docs/superpowers/specs/2026-10-25-sketch-block-design.md`, "Các mốc" → M4.

## Global Constraints
- **Inherited from M1–M3:**
  - Entry ≤ 15 KB gzip, counting its static import graph.
  - One gesture = one undo step.
  - Locked elements are never written, except by frame carry and toggleLock.
  - Hex colors only; style through `--me-*` tokens.
  - vi/en strings.
  - No attribution lines.
  - Stage files explicitly.
- **Export menu (top-right controls):**
  - Formats: PNG, SVG, and "Copy as PNG".
  - Scope: whole board, current selection, or the selected frame (only when exactly one frame is selected).
  - Options: background on/off (default on, white in light theme, `#121212` in dark), dark-mode export (inverts via kinds' theme), scale 1×/2×/3× for PNG (default 2×), padding 16.
  - The file name is `${frameName || 'sketch'}-${YYYYMMDD-HHmm}.png|svg`.
  - Tainted images are skipped with a placeholder and a toast.
  - Maximum PNG size is 16384 px on the long side; past that the scale is reduced, with a toast.
- **SVG export:** frames clip their children (`clipPath`). Links become `<a href>` with `target="_blank" rel="noopener noreferrer"`, and only `sanitizeLink`-allowed links. Image hrefs pass through `resolveImageSrc` when a resolver is given.
- **Library:**
  - localStorage key `mei-sketch:library:v1`, holding at most 200 items.
  - Each item is ≤ 1 MB serialized: `{ id, name, createdAt, elements }`, where `elements` uses the clipboard format.
  - Panel lists items with SVG thumbnails (generated on add, cached in the item as an svg string ≤ 50 KB, else omitted). Add the selection via the context action "Add to library" (mod+shift+A is not used); also: rename, delete, drag to the canvas, click to insert at the viewport center.
  - Storage errors (quota, private mode) show a toast and never throw.
- **Templates:** flowchart, mind map (a central node plus 4 branches), kanban (3 frames: To do / Doing / Done, with 2 stickies each), retro (3 frames: Went well / To improve / Actions), user journey (5 stages). Each is a pure function `(locale) => ElementInit[]` laid out around the origin and inserted as a paste at the viewport center (one undo step).
- **`.excalidraw` import:**
  - Accepts the `{type:'excalidraw', version:2, elements, files}` JSON, ≤ 20 MB.
  - Mapping:
    - rectangle/ellipse/diamond → same types
    - arrow/line → linear (points, arrowheads `arrow`/`triangle`/`dot`/`bar`/null → none, `elbow` when `elbowed`)
    - freedraw → freedraw (pressures when `simulatePressure` is false)
    - text → text (fontFamily 1 → hand, 2 → normal, 3 → code; fontSize mapped to the nearest of 16/20/28/36)
    - image → image (src from `files[fileId].dataURL`, checked with `isImageSrc`)
    - frame/magicframe → frame
    - embeddable → skipped (counted)
  - Strokes, fill and fillStyle (`hachure`/`cross-hatch`/`solid`/`zigzag` → `hachure`) and roughness 0/1/2 carry over. Opacity is divided by 100.
  - groupIds and frameId carry over, with remapped ids. Bindings `startBinding`/`endBinding` map to our anchors through `outlineAnchor` at the stored points.
  - Text bound to containers (`containerId`) becomes the container's `label`.
  - Everything goes through the clipboard sanitizer.
  - The result reports `{ imported, skipped: {type: count} }`.
  - Entry points: drag-dropping a `.excalidraw` file onto the board, or the "Import…" menu item.
- **Minimap:**
  - Bottom-left, 180×120, toggled with the ZoomControls button (lucide `Map`); off by default, state kept in the session.
  - Shows all elements as simple shapes at LOD plus the viewport rectangle.
  - Click or drag moves the viewport.
  - Redraws are throttled to 4 per second (250 ms) on scene changes, and happen immediately on viewport changes, which only redraw the rectangle overlay.
- **Performance pass** (the deferred items, measured by the bench before and after):
  - (a) Bounded module image cache: LRU of decoded images by bytes (≤ 256 MB) and count (≤ 500), excluding images referenced by mounted scenes.
  - (b) BitmapCache budget scales with device memory (`navigator.deviceMemory` × 8e6 px, clamped 16e6..64e6).
  - (c) `isRenderable` point validation cached per Y.Map version (WeakMap keyed by the raw object from toJSON is not stable, so cache in the store by id+version).
  - (d) Freedraw LOD draws `simplify(points, 1/zoom)`.
  - (e) Frame labels scan only visible frames using `queryBox`.
  - (f) Interactive-layer knockout LRU bounded by pixels.
  - (g) Bench: report sync handler time and per-frame long-task count (PerformanceObserver `longtask`), not only rAF fps.

## Notes from the M3 final review (binding)
- Centralize the networked inline-image limit in the controller's insert/paste path (`pasteElements`/`insert`), not only in `prepareImage`. Library items, templates and `.excalidraw` import all pass through it.
  - For Excalidraw data-URL images on a networked board that has an uploader, convert the data URL to a `File`, upload it, then insert.
  - Otherwise skip the image and count it in `skipped`.
- Pass the image resolver explicitly through the kinds' draw options instead of relying on the module-global `current`. Every new draw path (PNG export, minimap, offscreen) must use it.
  - Test: a src blocked by the resolver is never requested by any M4 path.
- Links in M4:
  - SVG `<a>` uses only sanitized external links; `#el:` links are dropped or mapped to in-SVG anchors.
  - Library items drop `#el:` links whose target isn't in the item.
  - The Excalidraw mapping passes `link` through `sanitizeLink`.
  - Add a "Copy link to element" context action (copies `#el:<id>`) so internal links are discoverable.
- Minimap: subscribe to `session.scene`, unsubscribe on unmount, keep state on BoardSession, and draw peers' viewport rectangles from presence.
- Perf pass additions:
  - item (c) caches the whole `normalizeElement` result;
  - repair's `frameIdPatches` full scan runs only when a changed id was a frame or was deleted;
  - add a relay-based "remote drag receiver" bench scenario;
  - repairer election (lowest writable awareness clientID with jitter) cuts duplicate repair writes across peers.
- Other fold-ins:
  - republish the cursor from the last screen position after wheel/pan;
  - drive `session.canWrite` from SketchView `editable` even while no board is mounted;
  - assert the clone test spy;
  - harden e2e port checks and kill with SIGKILL as a fallback.

## Review Focus
1. Export of huge or empty selections:
   - An empty scope disables the export item.
   - A huge board reduces the scale with a toast instead of crashing (canvas max size).
   → Task 1–2 tests.
2. Library storage failures and malicious stored items:
   - Corrupted JSON or oversized items are skipped.
   - Items go through the sanitizer before insert.
   → Task 3.
3. `.excalidraw` files with unknown or new fields, bound text, bindings to missing elements, or images without files import partially without throwing. → Task 5.
4. Minimap must never cost frames during drags. Its scene-redraw throttle is verified with a counter. → Task 6.
5. Performance changes must not change rendering output: existing render, svg and kinds tests stay green; the bench shows no regressions. → Task 7.

---

### Task 1: SVG export of scopes (frames clip, links, resolver)
**Files:** modify `src/io/svg.ts`; create `src/io/export.ts` (scope resolution: `exportScope(scene, selection, mode): SketchElement[]`, a frame plus its children, a selection plus bound arrows whose two ends are both in the selection). Tests: `test/export-svg.test.ts`.
**Produces:** `exportSvg(elements, { padding, background, theme, resolveImageSrc, frameClip: true })`.
- [ ] Tests:
  - `frame export clips children and includes frame children only`
  - `links rendered as anchors only when allowed`
  - `resolver rewrites image href`
  - `dark theme export maps default ink`
  - `empty scope returns null`
- [ ] Commit `feat(sketch-block): svg export scopes`.

### Task 2: PNG export, copy as PNG, export menu
**Files:** create `src/io/export-png.ts` and `src/ui/ExportMenu.vue`; modify `src/ui/ZoomControls.vue` or the board controls and `src/messages.ts`.
**Produces:** `exportPng(elements, { scale, background, theme, padding, resolveImageSrc }): Promise<Blob>` (reuses the canvas preview drawing; caps at 16384 px; tainted images become placeholders), `downloadBlob(blob, name)`, and `copyPng(blob)` (ClipboardItem; falls back to a toast when unsupported).
- [ ] Tests:
  - `scale caps at 16384 and reports reduction`
  - `tainted images placeholdered with toast flag`
  - `file name format`
  - `copy falls back when ClipboardItem missing`
  - `menu disables selection/frame scopes when not applicable`
- [ ] Commit `feat(sketch-block): png export and export menu`.

### Task 3: Library
**Files:** create `src/library/store.ts` (localStorage persistence with guards) and `src/ui/LibraryPanel.vue`; modify the toolbar Library button (the M1 spec listed it; add lucide `Library`), `src/tools/controller.ts` (`addToLibrary`, `insertLibraryItem(item, at)`), and the board drop handling for library drags (`dataTransfer` type `application/x-mei-sketch-library`).
- [ ] Tests:
  - `add/rename/delete persist`
  - `quota error toasts and does not throw`
  - `corrupted storage ignored`
  - `insert sanitizes and is one undo step`
  - `drag from panel inserts at drop point`
  - `200 item cap`
- [ ] Commit `feat(sketch-block): personal library`.

### Task 4: Templates
**Files:** create `src/templates/*.ts` (one per template plus an index) and `src/ui/TemplatesMenu.vue` (a menu item in the export/more menu, or a toolbar overflow); vi/en titles and content.
- [ ] Tests:
  - `each template produces valid renderable elements`
  - `kanban frames contain their stickies (frameId set after insert)`
  - `mind map arrows bound to nodes`
  - `insert is one undo step at viewport center`
- [ ] Commit `feat(sketch-block): board templates`.

### Task 5: `.excalidraw` import
**Files:** create `src/io/excalidraw.ts`; modify the board drop/menu.
**Produces:** `importExcalidraw(json: unknown): { elements: ElementInit[]; skipped: Record<string, number> }`.
- [ ] Tests:
  - `maps each element type`
  - `bound text becomes label`
  - `bindings mapped to anchors; missing targets unbound`
  - `images from files; disallowed src skipped`
  - `rejects over 20MB and wrong type`
  - `unknown fields ignored`
  - `fontSize mapping`
- [ ] Commit `feat(sketch-block): import excalidraw files`.

### Task 6: Minimap
**Files:** create `src/ui/Minimap.vue` and `src/render/minimap.ts`; modify ZoomControls and the session state.
- [ ] Tests:
  - `renders elements at LOD and viewport rect`
  - `click centers viewport`
  - `drag pans`
  - `scene redraw throttled to 250ms` (counter)
  - `hidden by default; state survives remount`
- [ ] Commit `feat(sketch-block): minimap`.

### Task 7: Performance pass
**Files:** `src/io/image-loader.ts`, `src/render/bitmap-cache.ts`, `src/model/store.ts`, `src/elements/freedraw.ts`, `src/render/frame-labels.ts`, `src/render/interactive.ts`, `scripts/bench-sketch.mjs`.
- [ ] Tests, one per item (a)–(f), proving bounded caches, unchanged output and fewer calls.
- [ ] Bench before/after numbers go in the report.
- [ ] Commit `perf(sketch-block): bounded caches and cheaper LOD`.

### Task 8: E2E, README, changeset
- e2e: export PNG from the menu (intercept the download, check the PNG signature and size > 0), insert a kanban template and check 3 frames, import a small `.excalidraw` fixture via drop and check the element count, toggle the minimap.
- README: export, library, templates, Excalidraw import, minimap, perf notes. Mark M4 done in the roadmap.
- Changeset minor: "Export, library, templates, Excalidraw import, minimap, performance".
- Full verification: build, typecheck, test, e2e, collab e2e, pack, bench.
- [ ] Commit `feat(sketch-block): M4 e2e and docs`.
