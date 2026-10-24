# Sketch Block M1 (Drawing Tools) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@toantranmei/sketch-block@0.2.0` with pen, highlighter, line, arrow, text (free and shape labels), eraser, laser, lasso, style panel, eyedropper, clipboard (copy/cut/paste/duplicate, copy/paste style), zen/view mode, and pay down the M0 tech debt.

**Architecture:**
- Elements become a discriminated union (`shape | line | arrow | freedraw | text`). Every element keeps the box `x,y,w,h,angle`; point-based elements store `points` in the box's local frame.
- Per-type behavior lives in an `ElementKind` registry (`src/elements/*`): draw, LOD draw, SVG, hit, visual padding, shape key and resize. The renderer, SVG export, hit-testing and the select tool dispatch through it.
- The bitmap cache is keyed by a shape key, so moving or rotating an element reuses its bitmap.

**Tech Stack:** As in M0, plus perfect-freehand 1.2.3 (MIT) and @fontsource/patrick-hand 5.3.0 (OFL-1.1; woff2 files copied into the package).

**Spec:** `docs/superpowers/specs/2026-10-25-sketch-block-design.md`, sections "Các mốc" → M1 and "Thiết kế M1".

## Global Constraints

- **Bundle split:**
  - The main entry must not statically import the engine, roughjs, rbush, perfect-freehand or yjs (the `check-entry` script enforces this); the entry stays under 15 KB gzip.
  - perfect-freehand is imported only by engine modules.
  - Fonts load lazily from the engine via `FontFace`.
- **Y.Doc layout is unchanged:** `elements` is a `Y.Map<id, Y.Map<prop>>`, z-order uses the fractional `index`, and arrays (`points`, `pressures`) are written whole, once per gesture.
- **Undo:** only local edits are undoable. One gesture = one undo step (one stroke, one eraser sweep, one paste, one point drag).
- **Geometry:** elements always have `w, h ≥ 0`.
- **Compatibility:** boards saved by M0 must open unchanged.
- **Colors:** stored as hex.
  - Palette (exact values):
    - stroke `['#1e1e1e', '#e03131', '#2f9e44', '#1971c2', '#f08c00', '#9c36b5']`
    - background `['transparent', '#ffc9c9', '#b2f2bb', '#a5d8ff', '#ffec99', '#eebefa']`
  - Plus a custom color input. Dark theme maps only `#1e1e1e` → `#e3e3e3` (existing `displayColor`).
- **Fonts:** `fontFamily` is `'hand' | 'normal' | 'code'`, mapped to CSS families:
  - `"Mei Hand", "Patrick Hand", cursive`
  - `system-ui, sans-serif`
  - `ui-monospace, SFMono-Regular, Menlo, monospace`
  - `fontSize` is `16 | 20 | 28 | 36` (S/M/L/XL); line height is 1.25.
- **Styles:** CSS uses only `var(--me-…)` tokens. UI strings exist in vi (default) and en.
- **Commits:** no Co-Authored-By/Claude attribution lines. Stage files explicitly by path.

## Review Focus

1. An M0 board (shape elements without `label`/`fontFamily`/…) opens in M1, renders identically and stays editable. → Task 1 test `normalizes M0 elements with defaults`.
2. A long pen stroke (thousands of coalesced points) must not bloat the doc or stall rendering. Points are simplified on commit. → Task 6 test `simplifies a 5000-point stroke to fewer points within 0.5 units`.
3. Paste of foreign, malformed or huge clipboard content never throws or corrupts the board:
   - non-sketch JSON or plain text becomes a text element;
   - anything over 2 MB or with more than 5000 elements is ignored.
   → Task 11 tests.
4. Text editing:
   - IME composition (Vietnamese Telex/VNI) must not commit or exit on Enter or Escape while composing;
   - an empty text element is deleted on commit;
   - editing while zoomed or rotated places the textarea over the element.
   → Task 8 tests.
5. Keys and tool switches during an active gesture must not corrupt state: Escape cancels the gesture (a draft is discarded and a move is reverted), and Delete, undo and nudge are ignored while a pointer is down. → Task 6 tests.

---

## File Structure
```
src/model/types.ts            (rewrite: union types, defaults, normalize)
src/model/store.ts            (createMany, O(1) top index, seed param, normalize on read)
src/elements/kind.ts          ElementKind interface + registry kindOf()
src/elements/shape.ts         rectangle/ellipse/diamond (+ label text)
src/elements/linear.ts        line/arrow (routing, arrowheads)
src/elements/freedraw.ts      pen/highlighter (perfect-freehand)
src/elements/text.ts          text element
src/text/fonts.ts             FontFace loading, family map
src/text/measure.ts           measure/wrap text (injectable measurer)
src/fonts/*.woff2 + OFL.txt   Patrick Hand latin, latin-ext, vietnamese
src/geometry/simplify.ts      Ramer–Douglas–Peucker
src/geometry/polygon.ts       point-in-polygon
src/tools/{pen,linear,text,eraser,laser,lasso,eyedropper}.ts
src/ui/{StylePanel.vue,TextEditor.vue,palette.ts}
src/io/clipboard.ts           serialize/parse clipboard payloads
src/engine.ts                 + createBoardSession
```

---

### Task 1: Element model union, normalization, store improvements

**Files:**
- Modify: `src/model/types.ts`, `src/model/store.ts`, `src/model/scene.ts` (only if types require)
- Test: `test/model-m1.test.ts`, update `test/store.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type ShapeType = 'rectangle' | 'ellipse' | 'diamond'
  type ElementType = ShapeType | 'line' | 'arrow' | 'freedraw' | 'text'
  type FontFamily = 'hand' | 'normal' | 'code'; type FontSize = 16 | 20 | 28 | 36; type TextAlign = 'left' | 'center' | 'right'
  type Arrowhead = 'none' | 'arrow' | 'triangle' | 'dot' | 'bar'; type Routing = 'straight' | 'elbow' | 'curved'
  type LocalPoint = [number, number]
  interface CommonProps { id; type: ElementType; x; y; w; h; angle; index; seed; version; locked: boolean; opacity: number;
    stroke: string; strokeWidth: 1 | 2 | 4; strokeStyle: 'solid'|'dashed'|'dotted'; roughness: 0|1|2;
    fill: string; fillStyle: FillStyle; roundness: 'sharp'|'round' }      // fill/roundness kept on all for a uniform style panel
  interface TextStyle { fontFamily: FontFamily; fontSize: FontSize; textAlign: TextAlign }
  interface ShapeElement extends CommonProps, TextStyle { type: ShapeType; label: string }
  interface LinearElement extends CommonProps { type: 'line' | 'arrow'; points: LocalPoint[]; routing: Routing; startArrowhead: Arrowhead; endArrowhead: Arrowhead }
  interface FreedrawElement extends CommonProps { type: 'freedraw'; points: LocalPoint[]; pressures: number[]; highlighter: boolean }
  interface TextElement extends CommonProps, TextStyle { type: 'text'; text: string; autoSize: boolean }
  type SketchElement = ShapeElement | LinearElement | FreedrawElement | TextElement
  type AllProps = Omit<ShapeElement,'type'> & Omit<LinearElement,'type'> & Omit<FreedrawElement,'type'> & Omit<TextElement,'type'>
  type ElementPatch = Partial<Omit<AllProps, 'id' | 'version'>>
  type ElementInit = DistributiveOmit<SketchElement, 'id'|'index'|'seed'|'version'> & { id?: string; seed?: number }
  const DEFAULT_STYLE   // M0 values + fontFamily 'hand', fontSize 20, textAlign 'center'
  const TYPE_DEFAULTS: { [T in ElementType]: Partial<…> }  // label '', routing 'straight', startArrowhead 'none', endArrowhead ('arrow' for arrow, 'none' for line), highlighter false, text '', autoSize true, pressures []
  function normalizeElement(raw: Record<string, unknown>): SketchElement   // fills missing fields from DEFAULT_STYLE + TYPE_DEFAULTS
  isShape(el), isLinear(el), isFreedraw(el), isText(el)   // type guards
  // store
  BoardStore.create(init: ElementInit): SketchElement           // uses init.seed when given
  BoardStore.createMany(inits: ElementInit[]): SketchElement[]  // one transaction, consecutive indices above the top
  ```
- Store reads go through `normalizeElement`. The top index is cached and marked dirty by `elements.observeDeep` for non-local transactions. `create` must not call `all()`; a dirty cache is recomputed by an O(n) scan of `index` values without `toJSON`.

- [ ] **Step 1: Tests:**
  - `normalizes M0 elements with defaults` (Review Focus 1): a raw M0 rect map → `label === ''`, `fontFamily 'hand'`, `fontSize 20`, `textAlign 'center'`, other props unchanged.
  - `normalizes arrow defaults`: `endArrowhead 'arrow'`, `routing 'straight'`.
  - `create uses the given seed`.
  - `createMany creates in one transaction with ascending indices above existing`.
  - `create does not call all()`: spy on `all`, expect no calls.
  - `top index stays correct after a remote create`: a remote doc creates the topmost element, then a local create lands above it.
- [ ] **Step 2–4:** RED → implement → GREEN. Fix compile errors in existing modules caused by the union with minimal type narrowing only (behaviour unchanged), and run the whole suite.
- [ ] **Step 5:** Commit `feat(sketch-block): element union, normalization, O(1) create`.

### Task 2: ElementKind registry, shape kind, shape-keyed caches, visual-pad bounds

**Files:**
- Create: `src/elements/kind.ts`, `src/elements/shape.ts`
- Modify:
  - `src/render/shapes.ts`: keep `displayColor`, `hasFill`, `roughOptions`, `cornerRadius`; move the shape drawables into `elements/shape.ts`
  - `src/render/bitmap-cache.ts`, `src/render/static.ts`, `src/render/interactive.ts` (draft drawing)
  - `src/io/svg.ts`, `src/geometry/bounds.ts`, `src/geometry/hit.ts`, `src/tools/select.ts` (resize via `kind.resize`)
- Test: `test/kinds.test.ts`; update `test/render.test.ts`, `test/geometry.test.ts`, `test/svg.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface ElementKind<E extends SketchElement = SketchElement> {
    visualPad(el: E): number                          // scene units beyond the box that ink can reach
    shapeKey(el: E): string                           // changes iff the unrotated rendering changes (not x, y, angle, index, version, locked)
    draw(ctx: CanvasRenderingContext2D, el: E, theme: Theme): void   // local frame, box (0,0)-(w,h), full fidelity
    drawLod(ctx: CanvasRenderingContext2D, el: E, theme: Theme, zoom: number): void   // centered frame like M0 plainPath
    svg(el: E, theme: Theme): string                  // markup in local frame (no wrapping <g>)
    hit(el: E, local: Point, tol: number): boolean    // local = point in the element's unrotated local frame (0,0)-(w,h)
    resize(el: E, next: { x: number; y: number; w: number; h: number }): ElementPatch
  }
  function kindOf(el: SketchElement): ElementKind
  function registerKind(type: ElementType, kind: ElementKind): void   // used by later tasks
  function shapeKeyOf(el: SketchElement): string    // memoized per element object (WeakMap)
  // cache
  cacheKey(el, zoom, dpr, theme) = `${el.id}:${shapeKeyOf(el)}:${zoomBucket(zoom)}:${dpr}:${theme}`
  BitmapCache.pruneElement(id: string, keepPrefix: string): void   // drops keys of id not starting with keepPrefix
  bindCacheInvalidation(scene, cache)  // now: pruneElement(id, `${id}:${shapeKeyOf(el)}:`) for changed ids, deleteElement for removed ids
  bitmapPad(el) = kindOf(el).visualPad(el)
  elementBounds(el) pads by kindOf(el).visualPad(el)   // MAX_ROUGH_PAD removed from static.ts
  ```
- Shape `visualPad` = `strokeWidth + roughness * 4`. Shape `shapeKey` hashes: type, w, h, stroke, fill, fillStyle, strokeWidth, strokeStyle, roughness, roundness, seed, label, fontFamily, fontSize, textAlign. Label drawing comes in Task 3, so for now `draw` ignores the label.
- The `shapeFor` drawable cache is keyed by `shapeKeyOf(el) + theme` in a Map capped at 5000 entries (LRU), not by object identity.
- The select tool's resize calls `kindOf(el).resize(el, box)`. Shape resize returns `{x, y, w, h}`.

- [ ] **Step 1: Tests:**
  - `moving an element keeps its shapeKey and reuses the bitmap`: render, `update {x}`, render; `createElement('canvas')` is not called the second time.
  - `changing stroke changes shapeKey and rebuilds`.
  - `concurrent remote edit with collapsed version still rebuilds`: two docs both edit stroke, merge; the shapeKey of the merged element equals the winner's and the bitmap is rebuilt.
  - `elementBounds pads by visualPad` (update the M0 expectation: rect 100×50 at 90°, strokeWidth 2, roughness 1 → pad 6 → `{minX:19,minY:-31,maxX:81,maxY:81}`).
  - `culling includes rough overshoot without MAX_ROUGH_PAD`.
  - `rotated resize keeps the opposite corner fixed` (tech-debt rotated resize tests for `se` and `nw` at 30°).
  - `svg output for shapes is unchanged`: compare the old snapshot with the `viewBox` adjusted for the new padding.
- [ ] **Step 2–4:** RED → implement → GREEN (full suite).
- [ ] **Step 5:** Commit `refactor(sketch-block): element kinds and shape-keyed caches`.

### Task 3: Fonts, text measurement, text kind, shape labels

**Files:**
- Create: `src/text/fonts.ts`, `src/text/measure.ts`, `src/elements/text.ts`
- Create: `src/fonts/patrick-hand-{latin,latin-ext,vietnamese}-400-normal.woff2` and `src/fonts/OFL.txt`, copied from `node_modules/@fontsource/patrick-hand/files/` and its LICENSE (add `@fontsource/patrick-hand` as a devDependency only)
- Modify: `src/elements/shape.ts` (draw the label), `vite.config.ts` (make sure the woff2 assets are emitted, `assetsInlineLimit: 0`)
- Test: `test/text.test.ts`

**Interfaces:**
- Produces:
  ```ts
  const FONT_FAMILIES: Record<FontFamily, string>     // exact strings from Global Constraints
  const LINE_HEIGHT = 1.25
  function loadFonts(): Promise<void>                 // registers FontFace 'Mei Hand' for the 3 woff2 files with their unicode-range
                                                     // (copy the ranges from @fontsource/patrick-hand's CSS), via new URL('../fonts/…', import.meta.url); resolves when loaded; idempotent; never rejects (warns)
  type Measurer = (text: string, font: string) => number   // width in px
  function setMeasurer(m: Measurer | null): void      // tests inject; default uses a shared offscreen canvas measureText
  function fontString(style: TextStyle): string        // `${fontSize}px ${FONT_FAMILIES[fontFamily]}`
  function wrapText(text: string, style: TextStyle, maxWidth: number | null): string[]   // splits on \n, then greedy word wrap when maxWidth; breaks over-long words by character
  function measureText(text: string, style: TextStyle, maxWidth: number | null): { w: number; h: number; lines: string[] }  // h = lines * fontSize * LINE_HEIGHT
  // text kind (registered for 'text')
  visualPad = 2; shapeKey includes text, fontFamily, fontSize, textAlign, stroke, w (when !autoSize)
  draw: fillText each line with stroke color, aligned within w; svg: <text> with <tspan>s, xml-escaped, font-family attribute
  hit: inside the box ± tol; resize: { x, y, w, h: measured height for the new width, autoSize: false }
  ```
- Shape labels: when `label !== ''`, draw them centered in the box (wrapped to `w - 2·8` px of padding) in both `draw` and `svg`.
- The board calls `loadFonts()` on mount. When it resolves: `cache.clear()` and invalidate (wired in Task 12; export a `onFontsLoaded(cb)` helper here).

- [ ] **Step 1: Tests** (stub measurer: width = `text.length * fontSize * 0.5`):
  - `wrapText wraps at maxWidth and keeps explicit newlines`.
  - `breaks a word longer than maxWidth`.
  - `measureText height = lines × fontSize × 1.25`.
  - `text svg escapes <&> and uses tspans`.
  - `shape label renders in svg centered`.
  - `loadFonts is idempotent and resolves even when FontFace is missing` (happy-dom).
  - `vietnamese text measures without throwing` (`"Bảng vẽ ắ ề ộ ữ đ"`).
- [ ] **Step 2–4:** RED → implement → GREEN.
- [ ] **Step 5:** Run `pnpm --filter @toantranmei/sketch-block build`, then `ls dist` must show 3 `.woff2` files and `npm pack --dry-run` must include them. Add `src/fonts/OFL.txt` → `dist/fonts/OFL.txt` (copy via a Vite plugin or a postbuild step in `scripts/check-entry.mjs`'s sibling script `copy-assets.mjs`).
- [ ] **Step 6:** Commit `feat(sketch-block): text kind, shape labels, Patrick Hand font`.

### Task 4: Freedraw kind (pen + highlighter)

**Files:**
- Create: `src/elements/freedraw.ts`, `src/geometry/simplify.ts`
- Modify: `packages/sketch-block/package.json` (add the `perfect-freehand 1.2.3` dependency)
- Test: `test/freedraw.test.ts`

**Interfaces:**
- Produces:
  ```ts
  function simplify(points: LocalPoint[], tolerance: number): LocalPoint[]   // RDP, keeps first/last
  function strokeOutline(el: FreedrawElement): number[][]   // perfect-freehand getStroke(points with pressures, { size, thinning: 0.6, smoothing: 0.5, streamline: 0.5, simulatePressure: pressures.length === 0 })
  // size = highlighter ? strokeWidth * 3 * 3 + 6 : strokeWidth * 3 + 2   (1→5, 2→8, 4→14; highlighter 1→15, 2→24, 4→42)
  function outlineToPath(outline: number[][]): string      // SVG path data (quadratic smoothing, closed)
  // kind: draw = fill Path2D(outlineToPath) with stroke color; highlighter → globalAlpha 0.4 (times el.opacity) and
  //   globalCompositeOperation 'multiply' in light theme; svg = <path d fill opacity> (+ style mix-blend-mode multiply for highlighter)
  // visualPad = size / 2 + 2; shapeKey = type, highlighter, stroke, strokeWidth, w, h, hash(points, pressures)
  // hit = distance from local point to the polyline ≤ tol + size / 2; resize = scale points (and the box) to the new w/h
  function polylineDistance(points: LocalPoint[], p: Point): number   // in geometry/math.ts
  ```
- [ ] **Step 1: Tests:**
  - `simplify keeps endpoints and stays within tolerance`.
  - `simplify reduces a dense straight line to 2 points`.
  - `outline is closed and non-empty for a single point` (a dot).
  - `highlighter size is 3× plus 6`.
  - `hit on stroke true, far false`.
  - `resize scales points proportionally`.
  - `svg path present with fill = stroke color`.
  - `shapeKey changes when points change`.
- [ ] **Step 2–4:** RED → implement → GREEN. **Step 5:** Commit `feat(sketch-block): freedraw element kind`.

### Task 5: Linear kind (line + arrow)

**Files:**
- Create: `src/elements/linear.ts`
- Test: `test/linear.test.ts`

**Interfaces:**
- Produces:
  ```ts
  function routePoints(el: LinearElement): LocalPoint[]
     // 'straight': points as is; 'curved': points as is (drawn with rough curve);
     // 'elbow': orthogonal route from first to last point: if |dx| ≥ |dy| → [p0, [mx, p0.y], [mx, pn.y], pn] with mx = (p0.x + pn.x)/2,
     //   else [p0, [p0.x, my], [pn.x, my], pn]; intermediate user points ignored
  function arrowheadPoints(head: Arrowhead, tip: LocalPoint, from: LocalPoint, strokeWidth: number): { kind: 'polyline' | 'polygon' | 'circle' | 'line'; points: LocalPoint[]; r?: number }
     // length = 10 + strokeWidth * 3, half-angle 25° (arrow: open polyline; triangle: filled polygon; dot: circle r = 3 + strokeWidth; bar: perpendicular line of length)
  function boxFromPoints(abs: LocalPoint[]): { x: number; y: number; w: number; h: number; points: LocalPoint[] }   // normalizes absolute scene points → box + local points (w,h ≥ 0)
  // kind: draw = rough linearPath (straight/elbow) or curve (curved) through routePoints + arrowheads (rough polygon/line, same seed);
  //   visualPad = strokeWidth + roughness*4 + (has arrowhead ? 10 + strokeWidth*3 : 0); shapeKey = type, routing, heads, style props, w, h, hash(points)
  //   hit = polylineDistance(routePoints) ≤ tol + strokeWidth/2; resize = scale points; svg via generator.toPaths like shapes (+ arrowheads)
  ```
- [ ] **Step 1: Tests:**
  - `elbow route is orthogonal and starts/ends at endpoints`.
  - `arrowhead arrow points at the tip with 25° half-angle`.
  - `boxFromPoints normalizes negative directions`.
  - `hit near segment true, far false, respects elbow route`.
  - `resize scales points`.
  - `line has no heads by default; arrow has end arrow`.
  - `svg contains head paths`.
- [ ] **Step 2–4:** RED → implement → GREEN. **Step 5:** Commit `feat(sketch-block): line and arrow element kinds`.

### Task 6: Controller hardening + pen / highlighter tools

**Files:**
- Create: `src/tools/pen.ts`
- Modify: `src/tools/controller.ts` (`ToolName` union, tool keys, gesture guard), `src/tools/select.ts` (cancel reverts the move), `src/tools/shape.ts` (`Escape` discards the draft)
- Test: `test/tools-m1.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type ToolName = 'hand' | 'select' | 'rectangle' | 'ellipse' | 'diamond' | 'pen' | 'highlighter' | 'line' | 'arrow' | 'text' | 'eraser' | 'laser' | 'lasso' | 'eyedropper'
  // keys: v/1 select, h hand, r/2 rectangle, d/3 diamond, o/4 ellipse, a/5 arrow, l/6 line, p/7 pen, t/8 text, e/0 eraser,
  //   k laser, m highlighter, i eyedropper (lasso: no letter key; toolbar only; Shift+drag with select = lasso is NOT required)
  ToolController.isGestureActive(): boolean
  ToolController.cancelGesture(): void   // Escape while active: discards drafts, reverts in-progress move/resize/rotate to origins (one store.updateMany, then history.endGesture + undo stack unchanged)
  PointerInput gains `pressure` (already) and `coalesced?: Point[]` (screen points of coalesced events, pen tools consume all)
  ```
- Pen tool:
  - the draft is a FreedrawElement accumulating absolute scene points with pressures (mouse pressure 0.5 → store `pressures: []` so `simulatePressure` is used);
  - on pointerUp: `simplify(points, 0.5)`, `boxFromPoints`, then `store.create` in one transaction (one undo step);
  - a click without movement creates a dot (single point);
  - the highlighter tool is the same with `highlighter: true`;
  - both stay active after drawing (like Excalidraw), so `toolLocked` is irrelevant for them.
- While `isGestureActive()`, keyDown returns false for Delete/Backspace, mod+z, mod+y, arrows and tool keys; Escape calls `cancelGesture()` and returns true.
- [ ] **Step 1: Tests:**
  - `pen stroke creates one freedraw element and one undo step`.
  - `simplifies a 5000-point stroke to fewer points within 0.5 units` (Review Focus 2).
  - `pen click creates a dot`.
  - `highlighter sets highlighter true`.
  - `Escape during move reverts positions` (Review Focus 5).
  - `Delete and mod+z ignored while pointer down`.
  - `Escape during shape draft creates nothing`.
  - `coalesced points are all consumed`.
- [ ] **Step 2–4:** RED → implement → GREEN. **Step 5:** Commit `feat(sketch-block): pen and highlighter tools; gesture-safe keys`.

### Task 7: Line / arrow tools and point editing

**Files:**
- Create: `src/tools/linear.ts`
- Modify: `src/tools/select.ts` (point handles for a single selected linear element), `src/render/interactive.ts` (point handles, the in-progress multi-point preview line to the pointer)
- Test: `test/tools-linear.test.ts`

**Interfaces:**
- Line/arrow tool:
  - Drag from A to B creates a 2-point element.
  - Click A, then click B, C… builds a multi-point draft with a live segment to the pointer. Enter, Escape or a click on the last point finishes. Fewer than 2 distinct points creates nothing.
  - Shift snaps segment angles to 15°.
  - The tool returns to select unless `toolLocked`.
  - Current style supplies `routing`, `startArrowhead` and `endArrowhead` (Task 10 adds these to the style; until then use the type defaults).
- Point editing:
  - With exactly one unlocked linear element selected, its `points` render as 8 px/zoom circle handles.
  - Dragging a point updates `points` + box via `boxFromPoints` (one gesture = one undo step, throttled like move).
  - Points take priority over resize handles. Resize handles still show for linear elements with more than 2 points.
- `Overlay` gains `pointHandles: Point[] | null` and `previewSegment: [Point, Point] | null` (scene coords).
- [ ] **Step 1: Tests:**
  - `drag creates 2-point arrow with end arrowhead`.
  - `click-click-Enter creates 3-point line`.
  - `Escape with one point creates nothing`.
  - `shift snaps to 15°`.
  - `dragging a point updates points and box in one undo step`.
  - `points normalized so w,h ≥ 0 after dragging past the origin`.
- [ ] **Step 2–4:** RED → implement → GREEN. **Step 5:** Commit `feat(sketch-block): line and arrow tools with point editing`.

### Task 8: Text tool, label editing, TextEditor overlay

**Files:**
- Create: `src/tools/text.ts`, `src/ui/TextEditor.vue`
- Modify: `src/ui/SketchBoard.vue` (mount the TextEditor, dblclick routing), `src/tools/controller.ts` (`editing` ref)
- Test: `test/text-tool.test.ts`

**Interfaces:**
- Produces:
  ```ts
  ToolController.editing: Ref<{ id: string; kind: 'text' | 'label' } | null>
  ToolController.startEditing(id: string, kind: 'text' | 'label'): void
  ToolController.commitEditing(value: string): void   // text: empty → remove element; else update { text, w, h via measureText (autoSize) }.
                                                      // label: update { label }. One undo step including creation.
  ToolController.cancelEditing(): void                // new empty text element removed; existing unchanged
  ```
- Text tool:
  - A click on empty canvas creates a TextElement at the pointer with current text style and `text ''`, then starts editing. A click on a shape starts editing its label.
  - Double-click with the select tool: on a text element → edit it; on a shape → edit its label; on empty canvas → create text (like Excalidraw).
- `TextEditor.vue`:
  - A `<textarea>` absolutely positioned via `viewport.toScreen` at the element box. CSS `transform: rotate(angle)` around its center. `font` = fontString scaled by zoom; color = displayColor(stroke); `text-align` from style.
  - Grows with content; for labels it is centered in the shape box.
  - Commits on blur and on Escape. Ctrl/Cmd+Enter also commits; plain Enter inserts a newline.
  - Ignores Enter/Escape while `isComposing` or during `compositionstart…compositionend` (Review Focus 4). Keydown stops propagation so the board/controller never sees it.
- While editing, the board's key handler ignores events from the textarea (already true in M0) and the controller treats editing as an active gesture for undo/delete.
- [ ] **Step 1: Tests** (@vue/test-utils + stub measurer):
  - `text tool click creates and focuses editor`.
  - `commit sets text and autosize box`.
  - `empty commit removes element`.
  - `Enter during composition does not commit` (dispatch compositionstart, then keydown Enter with isComposing).
  - `Escape commits`.
  - `dblclick on shape edits label`.
  - `editor positioned at zoom 2 and rotated element` (style left/top/transform values).
  - `create+commit is one undo step`.
- [ ] **Step 2–4:** RED → implement → GREEN. **Step 5:** Commit `feat(sketch-block): text tool and label editing`.

### Task 9: Eraser, laser, lasso

**Files:**
- Create: `src/tools/eraser.ts`, `src/tools/laser.ts`, `src/tools/lasso.ts`, `src/geometry/polygon.ts`
- Modify: `src/render/interactive.ts` (erase-marked elements drawn at 0.3 opacity over the static layer, laser trail, lasso path), `src/render/static.ts` (`skipIds` for erase-marked elements)
- Test: `test/tools-erase.test.ts`

**Interfaces:**
- Eraser:
  - While down, sweep segments between consecutive pointer positions. Elements whose kind `hit` (local) is within `8/zoom` of any sample along the segment (sample step 4/zoom) get marked.
  - On up, marked elements are removed in one transaction (one undo step). Escape clears the marks. Locked elements are not erased.
- Laser:
  - Trail points `{x, y, t}` in scene coords, appended while down. Rendered as a red (#e03131) line, fading linearly over 1000 ms after each point's time.
  - The board keeps scheduling interactive frames while the trail is non-empty. Nothing is written to Y.
  - Export `laserTrail(): readonly { x: number; y: number; t: number }[]` for M3 awareness.
- Lasso:
  - Polygon of scene points while dragging. On up, select unlocked elements whose 4 rotated box corners all lie inside the polygon (`pointInPolygon`, even-odd). Shift adds to the selection.
  - After the lasso, the tool switches to select.
- `Overlay` gains `erasing: Set<string>`, `laser: {x,y,t}[]`, `lasso: Point[] | null`.
- [ ] **Step 1: Tests:**
  - `eraser removes swept elements in one undo step`.
  - `eraser skips locked`.
  - `Escape clears marks`.
  - `laser writes nothing to Y and trail expires after 1000ms` (fake timers + now injection).
  - `lasso selects fully enclosed only`.
  - `pointInPolygon even-odd`.
- [ ] **Step 2–4:** RED → implement → GREEN. **Step 5:** Commit `feat(sketch-block): eraser, laser and lasso`.

### Task 10: Style panel, current style, eyedropper

**Files:**
- Create: `src/ui/StylePanel.vue`, `src/ui/palette.ts`, `src/tools/eyedropper.ts`
- Modify: `src/ui/SketchBoard.vue`, `src/tools/controller.ts` (current style lives here), `src/messages.ts`
- Test: `test/style.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type CurrentStyle = Pick<AllProps, 'stroke'|'fill'|'fillStyle'|'strokeWidth'|'strokeStyle'|'roughness'|'roundness'|'opacity'
    |'fontFamily'|'fontSize'|'textAlign'|'routing'|'startArrowhead'|'endArrowhead'>
  ToolController.currentStyle: Ref<CurrentStyle>     // initial = DEFAULT_STYLE + type defaults (endArrowhead 'arrow')
  ToolController.applyStyle(patch: Partial<CurrentStyle>): void   // updates currentStyle; if selection non-empty, updateMany on selected unlocked elements
                                                                  // with only the props relevant to each element's type (one undo step)
  ToolController.copyStyle(): void; ToolController.pasteStyle(): void   // mod+alt+c / mod+alt+v
  const STROKE_COLORS, BG_COLORS   // exact palettes from Global Constraints (palette.ts)
  ```
- `ctx.style()` in the controller now returns `currentStyle.value`. Drafts of every tool use it; the M0 `style` ctx option is removed.
- StylePanel:
  - Left side, visible when a drawing tool is active or the selection is non-empty, hidden in zen/view mode.
  - Sections are shown per relevance:
    - stroke color: always;
    - background + fill style: shapes;
    - stroke width: not text;
    - stroke style + sloppiness: shapes/linear;
    - edges: rectangle/diamond;
    - arrowheads + routing: linear;
    - font family + size + align: text/shapes;
    - opacity: always;
    - layers (send to back/front): when there is a selection.
  - Shows the selection's common value or a mixed state.
  - Each color row has the 6 swatches plus `<input type="color">`.
- Eyedropper:
  - Key `i`. Click on an element → `applyStyle({ stroke: el.stroke })`; Alt+click → `{ fill: el.fill }`.
  - Then returns to the previous tool.
  - Hovering shows a crosshair cursor.
- [ ] **Step 1: Tests:**
  - `applyStyle updates selection in one undo step and currentStyle`.
  - `applyStyle only writes relevant props` (text gets no fillStyle).
  - `new rectangle uses currentStyle`.
  - `copy/paste style`.
  - `eyedropper picks stroke and alt picks fill then returns to previous tool`.
  - `StylePanel shows arrowheads only for linear selection`.
  - `palette values exact`.
- [ ] **Step 2–4:** RED → implement → GREEN. **Step 5:** Commit `feat(sketch-block): style panel and eyedropper`.

### Task 11: Clipboard (copy, cut, paste, duplicate)

**Files:**
- Create: `src/io/clipboard.ts`
- Modify: `src/ui/SketchBoard.vue` (`copy`/`cut`/`paste` DOM events on the root), `src/tools/controller.ts` (`duplicate` mod+d)
- Test: `test/clipboard.test.ts`

**Interfaces:**
- Produces:
  ```ts
  const CLIPBOARD_TYPE = 'mei-sketch/clipboard'
  function serializeClipboard(elements: readonly SketchElement[]): string   // JSON { type, version: 1, elements } (no index/version/seed? keep seed; drop index, version)
  function parseClipboard(text: string): { elements: ElementInit[] } | { text: string } | null
     // > 2_000_000 chars → null; JSON with type CLIPBOARD_TYPE → elements (each normalizeElement'd; unknown types dropped; > 5000 → null);
     // anything else non-empty → { text } (trimmed to 10_000 chars); never throws
  ToolController.pasteElements(inits: ElementInit[], at: Point | null): void
     // new ids, keeps relative layout; positioned so their bounds' top-left lands at `at` (pointer) or offset +16,+16 from originals when null;
     // createMany (one undo step); selects pasted
  ToolController.pasteText(text: string, at: Point | null): void   // creates a text element (autoSize, current text style), one undo step
  ToolController.duplicate(): void                                  // mod+d: pasteElements(selection, null)
  ```
- Board:
  - `copy` and `cut` events, when the selection is non-empty and focus is in the board (not the textarea): `e.clipboardData.setData('text/plain', serializeClipboard(sel))`, `preventDefault`; cut also deletes.
  - `paste`: `parseClipboard(e.clipboardData.getData('text/plain'))` at the last pointer position.
  - Images are ignored in M1.
- [ ] **Step 1: Tests:**
  - `round-trip serialize/parse`.
  - `paste offsets and selects, one undo step`.
  - `paste at pointer`.
  - `foreign JSON becomes text`.
  - `malformed JSON becomes text and never throws`.
  - `over 2MB ignored`.
  - `over 5000 elements ignored`.
  - `unknown element type dropped`.
  - `cut removes`.
  - `duplicate mod+d`.
  - `copy ignored when textarea focused`.
- [ ] **Step 2–4:** RED → implement → GREEN. **Step 5:** Commit `feat(sketch-block): clipboard and duplicate`.

### Task 12: Board session, zen/view mode, M0 board tech debt, toolbar

**Files:**
- Modify:
  - `src/engine.ts`: `createBoardSession`
  - `src/ui/SketchBoard.vue`: optional `session` prop, `loadFonts`, `lostpointercapture`, `contextmenu`, `deltaMode`, zen/view
  - `src/ui/Toolbar.vue`: all tools, grouped
  - `src/block/SketchView.vue`: one session per connection; focus back to the editor on leave
  - `src/messages.ts`
- Test: update `test/board.test.ts` and `test/block.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface BoardSession { store: BoardStore; history: History; destroy(): void }
  function createBoardSession(connection: BoardConnection): BoardSession   // exported from engine.ts
  // SketchBoard prop `session?: BoardSession` — when given, the board uses it and does NOT destroy it; otherwise creates its own (M0 behavior)
  SketchMessages.tools: Record<ToolName | 'lock', string>; + zen, viewMode, exitZen, style-panel labels (all style sections and option names)
  ```
- SketchView:
  - Creates the session once, after the engine and connection load. Inline and fullscreen share it, so the undo stack survives the switch. It is destroyed with the connection.
  - On leave (not unmount), focuses the editor (`props.editor.commands.setNodeSelection(getPos())` then `editor.view.focus()`).
- Board:
  - `lostpointercapture` handled like `pointercancel` (ends the gesture safely). `contextmenu` gets `preventDefault` on the canvas.
  - Wheel deltas are multiplied by 16 when `deltaMode === 1` and by the canvas height when `deltaMode === 2`.
  - After `loadFonts()` resolves: `cache.clear()` and invalidate both layers.
- Zen mode (Alt+Z) hides the toolbar, style panel and zoom controls and shows a small "Exit zen" button.
- View mode (Alt+R): controller readonly, the toolbar shows only hand, and the style panel is hidden.
- Both are local UI state (not persisted). Esc exits zen mode.
- Toolbar order: lock | hand, select, lasso | rectangle, diamond, ellipse, arrow, line | pen, highlighter, text | eraser, laser, eyedropper.
  - Icons (@lucide/vue): `Lasso`, `MoveUpRight` (arrow), `Minus` (line), `Pencil`, `Highlighter`, `Type`, `Eraser`, `Wand2` (laser; `Sparkles` if `Wand2` is missing), `Pipette`.
  - Badges show the letter shortcut, consistent with tooltips (fixes the M0 minor).
  - The toolbar gets `aria-label`.
- [ ] **Step 1: Tests:**
  - `undo stack survives inline→fullscreen`.
  - `board does not destroy a provided session`.
  - `lostpointercapture ends gesture` (a later pointerdown works).
  - `contextmenu prevented`.
  - `deltaMode 1 scales pan by 16`.
  - `fonts loaded clears cache`.
  - `Alt+Z hides toolbar and Esc restores`.
  - `Alt+R blocks drawing`.
  - `focus returns to editor on leave`.
  - `toolbar renders 15 tools in order with letter badges`.
- [ ] **Step 2–4:** RED → implement → GREEN. Also run the build: the entry must still pass check-entry.
- [ ] **Step 5:** Commit `feat(sketch-block): board session, zen and view mode, toolbar for M1 tools`.

### Task 13: SVG/preview for new kinds, e2e, bench, docs, changeset

**Files:**
- Modify:
  - `src/io/svg.ts`: dispatch through kinds for all types; embed an `@font-face` for 'Mei Hand' only when text exists? **No.** Use font-family names only; the preview `<img>` falls back to cursive.
  - `scripts/e2e-sketch.mjs`, `scripts/bench-sketch.mjs`, `apps/playground/app/pages/sketch-bench.vue`
  - `packages/sketch-block/README.md`
- Create: `.changeset/sketch-block-m1.md`
- Test: update `test/svg.test.ts`

- [ ] **Step 1:** SVG tests: `exportSvg renders freedraw, arrow with heads, text and labels`; `highlighter has opacity`; `viewBox includes arrowheads`.
- [ ] **Step 2:** Extend the e2e:
  - draw a pen stroke (`p`), an arrow (`a`), and text (`t`, type "Xin chào", Escape);
  - exit; the preview contains `<path` and the text `Xin chào` (decode the data URL);
  - reload; 3 elements present;
  - Ctrl+C / Ctrl+V duplicates → 6 elements.
- [ ] **Step 3:** Bench: add N=2000 long pen strokes (200 points each), plus a drag of 500 selected elements (report the average frame time during the drag).
- [ ] **Step 4:** README: tools table with shortcuts, style panel, clipboard, fonts (Patrick Hand OFL, Vietnamese), zen/view mode; mark M1 done in the roadmap. Changeset: `'@toantranmei/sketch-block': minor` — "Drawing tools: pen, highlighter, line, arrow, text, eraser, laser, lasso, style panel, clipboard".
- [ ] **Step 5:** Full verification:
  - `pnpm build && pnpm typecheck && pnpm test && pnpm e2e:sketch` all PASS;
  - `npm pack --dry-run` includes `dist/fonts/OFL.txt` and the woff2 files;
  - the entry is under 15 KB gzip;
  - run `pnpm bench:sketch` and record the results in the report.
- [ ] **Step 6:** Commit `feat(sketch-block): M1 export, e2e, bench, docs`.
