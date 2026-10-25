# Sketch Block M0 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@toantranmei/sketch-block@0.1.0`: an optional Mei Editor block holding an infinite-canvas whiteboard with hand-drawn rect/ellipse/diamond, select/move/resize/rotate, pan/zoom, undo/redo, stored per board in a Y.Doc (IndexedDB by default), shown in the document as a lazy SVG preview with Interact + fullscreen.

**Architecture:** New workspace package `packages/sketch-block`. A tiny entry (Tiptap node + preview node view) dynamically imports a heavy `engine` chunk (roughjs, rbush, renderer, tools, board UI) only on Interact/fullscreen. Board data lives in a `Y.Doc` per `boardId` (`elements` Y.Map of Y.Maps), mirrored into an immutable in-memory `Scene` with an rbush index; rendering is Canvas2D with a static layer (per-element bitmap cache + viewport culling) and an interactive layer (selection/handles/marquee).

**Tech Stack:** Vue 3.5, Tiptap 3.32 (via `@toantranmei/editor`), Yjs 13.6, y-indexeddb 9.0.12, roughjs 4.6.6, rbush 4.0.1 (+ @types/rbush 4.0.0), fractional-indexing 4.0.0, nanoid 6.0.2, Vite 8 (lib mode), Vitest 5.0.5 + happy-dom 21.0.4 + fake-indexeddb 6.2.6, Playwright (root).

**Spec:** `docs/superpowers/specs/2026-10-25-sketch-block-design.md`

## Global Constraints

- Package name `@toantranmei/sketch-block`; block name `sketch`; ProseMirror node name `sketch`.
- Node attrs exactly `{ boardId, preview, height, version }`. Never put scene JSON in node attrs.
- Board Y.Doc layout: `doc.getMap('elements')` = `Y.Map<id, Y.Map<prop>>`, `doc.getMap('meta')`. Z-order is the fractional `index` string prop (no Y.Array).
- `Y.UndoManager` tracks only the local origin (`LOCAL_ORIGIN`), never remote changes.
- `peerDependencies`: `@toantranmei/editor ^0.2.0`, `vue ^3.5.0`, `yjs ^13.6.0`. `dependencies`: roughjs, rbush, fractional-indexing, nanoid, y-indexeddb. All deps + peers external in the Vite build (copy `packages/editor/vite.config.ts` pattern). (Deviation from spec, deliberate: y-indexeddb is a regular dependency because it is the default provider; y-websocket stays an optional peer in M3.)
- The main entry (`dist/index.js`) must not statically import roughjs, rbush or the engine; target < 15 KB gzip for the entry. Apps that don't install the package see no change in the editor bundle.
- Styles use only `var(--me-…)` tokens from the editor.
- UI strings in vi (default) and en; locale read from `editor.storage.meiConfig.locale`.
- Preview: SVG data URL ≤ 150 KB; above that, a PNG data URL scaled to max 1200 px wide.
- Zoom clamped to `[0.1, 30]`.
- `engines.node >= 20`; ESM only; `sideEffects: ["**/*.css"]`.
- Commits: no `Co-Authored-By`/Claude attribution lines (user rule).

## Review Focus

1. **Board missing on this device** (doc JSON has `boardId` + preview, IndexedDB empty): block must keep showing the stored preview with a "not on this device" notice and must NOT overwrite `preview`/`version` with a blank board. → Task 12 test `does not overwrite preview when board is empty and was never edited`.
2. **Keys leaking to ProseMirror while interacting**: Ctrl+Z, Delete, Backspace, arrows, letters must go to the board, not the document (otherwise Delete removes the whole block, Ctrl+Z undoes document edits). → Task 12 test `node view stopEvent swallows keyboard and pointer events while interacting`.
3. **Click without drag with a shape tool** (zero-size shape): must not create an invisible element. → Task 8 test `click without drag creates nothing`.
4. **Read-only editor** (`editable=false`): Interact still allows pan/zoom/select, but no create/move/delete, and no preview save. → Task 8 test `read-only controller ignores create, move and delete` + Task 12 test `read-only does not save preview`.
5. **Container resize / devicePixelRatio change** while interacting (entering fullscreen, browser zoom): canvases must resize backing store to `cssSize × dpr` and invalidate the bitmap cache. → Task 7 test `cache key changes with dpr` + Task 10 ResizeObserver step.

---

## File Structure

```
packages/editor/src/index.ts                       (modify: export blockNodeView, useScope, useClickOutside, useEditable)
.changeset/editor-sketch-exports.md                (create)
packages/sketch-block/
  package.json, vite.config.ts, vitest.config.ts, tsconfig.json, tsconfig.build.json, README.md, LICENSE (copy of packages/editor/LICENSE)
  scripts/check-entry.mjs                          entry must not import heavy deps
  src/index.ts                                     public entry (light)
  src/engine.ts                                    lazy chunk entry: exports SketchBoard + mountBoard
  src/messages.ts                                  vi/en UI strings + useMessages(locale)
  src/model/types.ts                               element types + defaults
  src/model/store.ts                               BoardStore: Y.Doc read/write API
  src/model/scene.ts                               Scene: immutable snapshot + rbush
  src/model/history.ts                             History: UndoManager wrapper
  src/geometry/math.ts                             Point/Box helpers, rotate
  src/geometry/bounds.ts                           element bounds (rotated)
  src/geometry/hit.ts                              hit-testing
  src/geometry/transform.ts                        resize/rotate math, handles
  src/viewport.ts                                  Viewport: pan/zoom transforms
  src/render/shapes.ts                             roughjs drawable cache
  src/render/bitmap-cache.ts                       per-element bitmap LRU
  src/render/static.ts                             static layer renderer
  src/render/interactive.ts                        selection/handles/marquee renderer
  src/render/scheduler.ts                          rAF-throttled render loop
  src/tools/controller.ts                          ToolController state machine
  src/tools/{hand,select,shape}.ts                 tools
  src/ui/SketchBoard.vue, Toolbar.vue, ZoomControls.vue, icons.ts
  src/providers/types.ts                           SketchProvider, BoardConnection
  src/providers/indexeddb.ts, memory.ts, index.ts  `@toantranmei/sketch-block/providers`
  src/io/svg.ts                                    exportSvg / preview generation
  src/block/node.ts                                Tiptap node `sketch`
  src/block/SketchView.vue                         preview / interact / fullscreen
  src/block/definition.ts                          `sketch` defineBlock
  src/styles/sketch.css
  test/*.test.ts
apps/playground/{nuxt.config.ts,package.json,app/pages/index.vue,app/pages/sketch-bench.vue}
scripts/bench-sketch.mjs, package.json (root), .github/workflows/ci.yml
```

---

### Task 1: Editor exports for block packages

**Files:**
- Modify: `packages/editor/src/index.ts`
- Create: `.changeset/editor-sketch-exports.md`

**Interfaces:**
- Produces: from `@toantranmei/editor`: `blockNodeView(component)`, `useScope(() => editor)`, `useClickOutside(ref, activeRef, handler)`, `useEditable(editor)` (existing signatures in `src/nodeviews/renderer.ts`, `src/composables/*`).

- [ ] **Step 1:** Add to `src/index.ts`:
  `export { blockNodeView } from './nodeviews/renderer'` and `export { useClickOutside } from './composables/useClickOutside'`, `useEditable`, `useScope` from their files.
- [ ] **Step 2:** Changeset: `'@toantranmei/editor': minor` — "Export `blockNodeView`, `useScope`, `useClickOutside`, `useEditable` for block packages."
- [ ] **Step 3:** Run `pnpm --filter @toantranmei/editor build` → PASS (incl. `RUNTIME_DEPS ok`), and `grep -c "blockNodeView" packages/editor/dist/types/index.d.ts` → ≥ 1.
- [ ] **Step 4:** Commit `feat(editor): export node view helpers for block packages`.

### Task 2: Package scaffold, build and CI

**Files:**
- Create: `packages/sketch-block/{LICENSE,package.json,vite.config.ts,vitest.config.ts,tsconfig.json,tsconfig.build.json,README.md,scripts/check-entry.mjs,src/index.ts,src/engine.ts,test/smoke.test.ts}`
- Modify: root `package.json`, `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `exports`: `"."` → `dist/index.js`, `"./providers"` → `dist/providers.js`, `"./style.css"` → `dist/style.css`; types under `dist/types/`. Vite lib entries `index`, `providers`; `engine` is reached only via `import('./engine')`, so Rolldown emits it as a separate chunk.

- [ ] **Step 1:** `package.json` fields copied in style from `packages/editor/package.json` (license, repository with `directory: packages/sketch-block`, `files`, `publishConfig.access: public`, `type: module`, `sideEffects`). Scripts: `build: vite build && vue-tsc -p tsconfig.build.json && node scripts/check-entry.mjs`, `dev: vite build --watch`, `typecheck: vue-tsc --noEmit -p tsconfig.json`, `test: vitest run`, `prepublishOnly: pnpm run build`. Version `0.0.0` (changeset bumps to 0.1.0 in Task 13). Dev deps: `@toantranmei/editor: workspace:*`, vue, yjs, vite, @vitejs/plugin-vue, vue-tsc, typescript ~5.9.3, vitest, happy-dom, fake-indexeddb, @vue/test-utils, @types/rbush.
- [ ] **Step 2:** `vitest.config.ts`: environment `happy-dom`, `setupFiles: ['fake-indexeddb/auto']`, include `test/**/*.test.ts`, plugin vue.
- [ ] **Step 3:** `scripts/check-entry.mjs`: reads `dist/index.js` and fails (exit 1, message `entry imports heavy module: <name>`) if it contains a static `from "roughjs` / `"rbush"` / `./engine` import (dynamic `import("./engine…")` is allowed). Also prints the gzip size of `dist/index.js` (`zlib.gzipSync`) and fails above 15 KB.
- [ ] **Step 4:** `test/smoke.test.ts`: `import { SKETCH_NODE } from '../src'` → `expect(SKETCH_NODE).toBe('sketch')`. Run `pnpm --filter @toantranmei/sketch-block test` → FAIL (not exported).
- [ ] **Step 5:** `src/index.ts`: `export const SKETCH_NODE = 'sketch'`. `src/engine.ts`: `export {}` placeholder. Run test → PASS; run `pnpm install` then `pnpm --filter @toantranmei/sketch-block build` → PASS.
- [ ] **Step 6:** Root `package.json`: `"build": "pnpm -r --filter './packages/*' build"`, add `"test": "pnpm -r --if-present test"`, `"dev:sketch": "pnpm --filter @toantranmei/sketch-block dev"`. `ci.yml`: add `- run: pnpm test` after typecheck. Run `pnpm build && pnpm typecheck && pnpm test` → PASS.
- [ ] **Step 7:** Commit `chore(sketch-block): scaffold package`.

### Task 3: Element model and BoardStore

**Files:**
- Create: `src/model/types.ts`, `src/model/store.ts`
- Test: `test/store.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type ShapeType = 'rectangle' | 'ellipse' | 'diamond'
  type FillStyle = 'hachure' | 'cross-hatch' | 'solid' | 'none'
  interface ElementBase { id: string; type: ShapeType; x: number; y: number; w: number; h: number; angle: number; index: string;
    stroke: string; fill: string; fillStyle: FillStyle; strokeWidth: 1 | 2 | 4; strokeStyle: 'solid' | 'dashed' | 'dotted';
    roughness: 0 | 1 | 2; roundness: 'sharp' | 'round'; opacity: number; seed: number; version: number; locked: boolean }
  type SketchElement = ElementBase   // widened by later milestones (discriminated by `type`)
  type ElementPatch = Partial<Omit<SketchElement, 'id' | 'type' | 'version'>>
  const DEFAULT_STYLE: Pick<SketchElement, 'stroke'|'fill'|'fillStyle'|'strokeWidth'|'strokeStyle'|'roughness'|'roundness'|'opacity'>
    // stroke '#1e1e1e', fill 'transparent', fillStyle 'hachure', strokeWidth 2, strokeStyle 'solid', roughness 1, roundness 'round', opacity 1
  const LOCAL_ORIGIN: unique symbol
  class BoardStore {
    constructor(doc: Y.Doc)
    readonly doc: Y.Doc
    create(init: Omit<SketchElement, 'id'|'index'|'seed'|'version'> & Partial<Pick<SketchElement,'id'>>): SketchElement // appended on top
    update(id: string, patch: ElementPatch): void          // version += 1
    updateMany(patches: Record<string, ElementPatch>): void // one transaction
    remove(ids: string[]): void
    get(id: string): SketchElement | undefined
    all(): SketchElement[]                                  // sorted by index
    reorder(id: string, to: 'front' | 'back'): void
    onChange(cb: (changedIds: Set<string>) => void): () => void
  }
  ```
  All writes run in `doc.transact(fn, LOCAL_ORIGIN)`. ids from `nanoid(10)`, seed `Math.floor(Math.random() * 2 ** 31)`, `index` via `generateKeyBetween(lastIndex, null)`.

- [ ] **Step 1: Tests** in `test/store.test.ts`:
  - `create assigns id, seed, version 1 and an index above existing elements` — create two, expect `all().map(e => e.id)` order = creation order, `b.index > a.index`.
  - `update merges patch and bumps version` — `update(a.id, { x: 10 })` → `get(a.id).x === 10`, `version === 2`, other props unchanged.
  - `updateMany writes in one transaction` — spy `doc.on('afterTransaction')` count === 1.
  - `remove deletes elements` and `reorder front/back changes index order`.
  - `onChange reports only changed ids, including remote updates` — second `Y.Doc` synced with `Y.applyUpdate`; remote update triggers callback with that id.
  - `writes use LOCAL_ORIGIN` — `doc.on('afterTransaction', t => origins.push(t.origin))`.
- [ ] **Step 2:** Run `pnpm --filter @toantranmei/sketch-block test store` → FAIL.
- [ ] **Step 3:** Implement `types.ts` and `store.ts` (`elements.observeDeep` collects ids from `event.path[0]` or `event.keysChanged`).
- [ ] **Step 4:** Run → PASS. Commit `feat(sketch-block): element model and Yjs board store`.

### Task 4: Geometry (bounds, hit-testing, transforms) and Viewport

**Files:**
- Create: `src/geometry/{math,bounds,hit,transform}.ts`, `src/viewport.ts`
- Test: `test/geometry.test.ts`, `test/viewport.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface Point { x: number; y: number }; interface Box { minX: number; minY: number; maxX: number; maxY: number }
  rotatePoint(p: Point, center: Point, angle: number): Point
  elementBounds(el: SketchElement): Box                 // axis-aligned box of the rotated element, padded by strokeWidth/2
  boxesIntersect(a: Box, b: Box): boolean; boxContains(outer: Box, inner: Box): boolean
  hitElement(el: SketchElement, p: Point, tolerance: number): boolean
     // filled (fillStyle !== 'none' && fill !== 'transparent'): inside shape; else within `tolerance` of outline
  type Handle = 'n'|'s'|'e'|'w'|'ne'|'nw'|'se'|'sw'|'rotate'
  handlePositions(box: {x,y,w,h,angle}, zoom: number): Record<Handle, Point> // rotate handle 24/zoom px above top
  resizeBox(start: {x,y,w,h,angle}, handle: Exclude<Handle,'rotate'>, pointer: Point, opts: { keepRatio: boolean; fromCenter: boolean }): {x,y,w,h}
     // negative drags flip: result always has w,h ≥ 0 with x,y adjusted; works in the element's rotated frame
  rotateAngle(center: Point, pointer: Point, snap: boolean): number // snap to 15° when true, normalized to [0, 2π)
  class Viewport { x: number; y: number; zoom: number   // scene coords of the screen's top-left, zoom ∈ [0.1, 30]
    toScene(p: Point): Point; toScreen(p: Point): Point
    panBy(dxScreen: number, dyScreen: number): void
    zoomAt(screenPoint: Point, nextZoom: number): void  // keeps the scene point under screenPoint fixed; clamps
    visibleBox(widthCss: number, heightCss: number): Box
    fit(box: Box, widthCss: number, heightCss: number, padding = 40): void }
  ```
- [ ] **Step 1: Tests** (exact values):
  - `elementBounds of rect rotated 90° swaps w/h` — `{x:0,y:0,w:100,h:50,angle:Math.PI/2,strokeWidth:2}` → `{minX:24,minY:-26,maxX:76,maxY:76}` (±0.001).
  - `hit inside filled rect`, `miss inside unfilled rect center`, `hit unfilled rect near edge within tolerance 5`, `ellipse hit uses implicit equation`, `diamond hit uses |dx|/hw + |dy|/hh ≤ 1`, `hit respects rotation`.
  - `resizeBox se handle grows w/h`, `dragging past the opposite edge flips and keeps w,h ≥ 0`, `keepRatio keeps w/h ratio`, `fromCenter keeps center fixed`.
  - `rotateAngle snaps to 15°` — pointer at 40° → `Math.PI/4`.
  - Viewport: `zoomAt keeps the point under the cursor fixed` (toScene before == after), `zoom clamps to [0.1, 30]`, `fit centers box`.
- [ ] **Step 2:** Run `test geometry viewport` → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(sketch-block): geometry and viewport`.

### Task 5: Scene with spatial index

**Files:**
- Create: `src/model/scene.ts`
- Test: `test/scene.test.ts`

**Interfaces:**
- Consumes: `BoardStore.onChange/all/get`, `elementBounds`, `hitElement`.
- Produces:
  ```ts
  class Scene {
    constructor(store: BoardStore)
    readonly elements: readonly SketchElement[]          // sorted by index; new array identity on any change
    get(id: string): SketchElement | undefined
    queryBox(box: Box): SketchElement[]                   // rbush search, returned in z-order
    hitTest(p: Point, tolerance: number): SketchElement | undefined // topmost
    contentBounds(): Box | null
    onChange(cb: (changedIds: Set<string>) => void): () => void
    destroy(): void
  }
  ```
  Incremental: on store change, only changed ids are removed/re-inserted in rbush and replaced in the map; re-sort only if an `index` changed or elements were added/removed. Unchanged elements keep object identity (the bitmap cache depends on it).
- [ ] **Step 1: Tests:** `queryBox returns only intersecting elements in z-order`; `hitTest returns topmost`; `unchanged elements keep identity after another element updates`; `remote change updates index`; `1000 elements: queryBox of a small box touches far fewer than all` (spy on bounds calls ≤ 50).
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat(sketch-block): scene with rbush index`.

### Task 6: History (local undo/redo)

**Files:**
- Create: `src/model/history.ts`
- Test: `test/history.test.ts`

**Interfaces:**
- Produces: `class History { constructor(store: BoardStore); undo(): void; redo(): void; readonly canUndo: Ref<boolean>; readonly canRedo: Ref<boolean>; stopCapturing(): void; destroy(): void }` — `Y.UndoManager(store.doc.getMap('elements'), { trackedOrigins: new Set([LOCAL_ORIGIN]), captureTimeout: 300 })`.
- [ ] **Step 1: Tests:** `undo reverts local create`; `undo does not revert remote changes` (remote doc creates element, local undo leaves it); `stopCapturing splits a drag from the next edit into separate undo steps`; `canUndo/canRedo refs update`.
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5:** Commit `feat(sketch-block): local undo history`.

### Task 7: Renderer (shape cache, bitmap cache, static + interactive layers, scheduler)

**Files:**
- Create: `src/render/{shapes,bitmap-cache,static,interactive,scheduler}.ts`
- Test: `test/render.test.ts`

**Interfaces:**
- Consumes: `Scene`, `Viewport`, `elementBounds`, `handlePositions`.
- Produces:
  ```ts
  shapeFor(el: SketchElement): Drawable          // roughjs generator; WeakMap keyed by element object (identity = version)
  options: roughness from el.roughness, seed el.seed, strokeLineDash for dashed [8,8]/dotted [1.5,6], fill only if fillStyle!=='none' && fill!=='transparent',
           rounded rect via path when roundness==='round' (radius = min(w,h)*0.25 capped at 32)
  zoomBucket(zoom: number): number              // nearest power of √2, so the cache doesn't rebuild every wheel tick
  cacheKey(el: SketchElement, zoom: number, dpr: number, theme: 'light'|'dark'): string // `${el.id}:${el.version}:${zoomBucket(zoom)}:${dpr}:${theme}`
  class BitmapCache { constructor(maxPixels = 64e6); get(key: string): HTMLCanvasElement | undefined; set(key, canvas): void; deleteElement(id: string): void; clear(): void; readonly pixels: number }
     // LRU by insertion/access; evicts until total width*height ≤ maxPixels; per-bitmap side capped at 4096 px (scale drawing down if larger)
  interface RenderState { viewport: Viewport; widthCss: number; heightCss: number; dpr: number; theme: 'light'|'dark'; grid: boolean }
  renderStatic(ctx: CanvasRenderingContext2D, scene: Scene, state: RenderState, cache: BitmapCache, skipIds?: Set<string>): { drawn: number }
     // query scene.queryBox(viewport.visibleBox(...)); for each: draw cached bitmap (render-on-miss with rough.canvas onto an offscreen canvas,
     // padded by strokeWidth+roughness*4, rotated around center); zoom < 0.3 → LOD: draw plain ctx.rect/ellipse/diamond path, no bitmap
  interface Overlay { selectedIds: Set<string>; marquee: Box | null; hoverId: string | null; draft: SketchElement | null }
  renderInteractive(ctx, scene, state, overlay): void   // draft element drawn live with roughjs (no cache), selection boxes, handles (8px squares / zoom-independent), marquee
  class RenderScheduler { constructor(drawStatic: () => void, drawInteractive: () => void); invalidateStatic(): void; invalidateInteractive(): void; destroy(): void }
     // at most one requestAnimationFrame pending; each frame runs only the invalidated layers
  ```
  `skipIds` lets the static layer omit elements being dragged (drawn on the interactive layer as draft copies) so dragging doesn't rebuild static.
- [ ] **Step 1: Tests** (happy-dom has no real canvas: stub `HTMLCanvasElement.prototype.getContext` with a recording fake; test logic, not pixels):
  - `cacheKey changes with version, zoom bucket, dpr, theme` (Review Focus 5) and `zoomBucket(1.05) === zoomBucket(1)`.
  - `BitmapCache evicts least recently used above maxPixels`, `deleteElement drops all keys of that id`.
  - `renderStatic draws only visible elements` (1000 elements spread out, small viewport → `drawn` ≤ visible count) and `skips ids in skipIds`.
  - `renderStatic uses LOD below zoom 0.3` (no `drawImage` calls recorded).
  - `RenderScheduler coalesces many invalidations into one frame` (fake rAF).
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5:** Commit `feat(sketch-block): canvas renderer with culling and bitmap cache`.

### Task 8: Tools and ToolController

**Files:**
- Create: `src/tools/{controller,hand,select,shape}.ts`
- Test: `test/tools.test.ts`

**Interfaces:**
- Consumes: `BoardStore`, `Scene`, `History`, `Viewport`, geometry functions.
- Produces:
  ```ts
  type ToolName = 'hand' | 'select' | 'rectangle' | 'ellipse' | 'diamond'
  interface PointerInput { screen: Point; button: number; shift: boolean; alt: boolean; mod: boolean; pressure: number }
  class ToolController {
    constructor(ctx: { store: BoardStore; scene: Scene; history: History; viewport: Viewport; readonly: () => boolean; style: () => typeof DEFAULT_STYLE; invalidate: () => void })
    tool: Ref<ToolName>; toolLocked: Ref<boolean>; selectedIds: Ref<Set<string>>; overlay(): Overlay; cursor: Ref<string>
    setTool(t: ToolName): void
    pointerDown(e: PointerInput): void; pointerMove(e: PointerInput): void; pointerUp(e: PointerInput): void
    keyDown(e: { key: string; mod: boolean; shift: boolean }): boolean   // true = handled (caller preventDefaults)
    deleteSelection(): void; selectAll(): void
  }
  ```
  Behavior:
  - Shape tools: drag creates a draft (not in Y) shown via `overlay().draft`; on up commit with `store.create` if `w ≥ 2/zoom && h ≥ 2/zoom`, select it, return to `select` unless `toolLocked`. Shift = equal w/h, Alt = from center.
  - Select: click hit → select (shift toggles); empty → marquee (select elements fully inside); drag selection → move (live `store.updateMany` throttled to one write per animation frame, `history.stopCapturing()` on pointerUp); handles → resize (single element) / rotate; locked elements cannot be moved. Hit tolerance `6 / zoom`.
  - Hand tool, middle button or Space held: pan.
  - Keys: `v/1` select, `h` hand, `r/2` rect, `d/3` diamond, `o/4` ellipse, `q` toggle lock, `Delete/Backspace` delete, `mod+z` undo, `mod+shift+z`/`mod+y` redo, `mod+a` select all, `Escape` clear selection, arrows nudge 1 px (shift 10 px).
  - Read-only: create/move/resize/rotate/delete/nudge are ignored; select/pan/zoom allowed.
- [ ] **Step 1: Tests:**
  - `drag with rectangle tool creates a rectangle in scene coordinates` (viewport zoom 2, offset) and `returns to select tool unless locked`.
  - `click without drag creates nothing` (Review Focus 3).
  - `shift drag creates a square`.
  - `click selects topmost, shift-click toggles, marquee selects fully-contained`.
  - `dragging selection moves all selected and is one undo step`.
  - `se handle resizes; rotate handle sets angle`.
  - `Delete removes selection; mod+z restores it`.
  - `read-only controller ignores create, move and delete` (Review Focus 4).
  - `keyDown returns false for unhandled keys`.
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5:** Commit `feat(sketch-block): selection, shape and hand tools`.

### Task 9: Providers (types, memory, indexeddb)

**Files:**
- Create: `src/providers/{types,memory,indexeddb,index}.ts`
- Test: `test/providers.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface BoardConnection { doc: Y.Doc; awareness?: Awareness; /** false when nothing was stored for this id */ existed: boolean; destroy(): void }
  interface SketchProvider { connect(boardId: string): Promise<BoardConnection>; savePreview?(boardId: string, preview: Blob): Promise<string>; uploadImage?(file: File): Promise<string> }
  memory(): SketchProvider        // Map<boardId, Uint8Array>, for tests/demos
  indexeddb(opts?: { prefix?: string }): SketchProvider  // db name `${prefix ?? 'mei-sketch'}:${boardId}`; waits for `whenSynced`; existed = elements map non-empty after sync
  ```
  `index.ts` re-exports types + `indexeddb`, `memory` (Vite entry `providers`). Types are also re-exported from the main entry.
- [ ] **Step 1: Tests:** `indexeddb persists a board across connections` (connect, create via BoardStore, destroy, reconnect → element present, `existed === true`); `new board reports existed false`; `prefix isolates databases`; `memory provider round-trips`.
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5:** Commit `feat(sketch-block): board providers (indexeddb, memory)`.

### Task 10: SVG export and preview

**Files:**
- Create: `src/io/svg.ts`
- Test: `test/svg.test.ts`

**Interfaces:**
- Consumes: `shapeFor` options (share an `roughOptions(el)` helper exported from `render/shapes.ts`), `Scene.contentBounds`.
- Produces:
  ```ts
  exportSvg(elements: readonly SketchElement[], opts?: { padding?: number; background?: string | null }): string  // standalone <svg> with viewBox = content bounds + padding (default 16); roughjs generator → toPaths; rotation via transform
  makePreview(elements: readonly SketchElement[]): Promise<{ dataUrl: string; blob: Blob } | null>
     // null for an empty board; SVG data URL if ≤ 150_000 chars, else PNG via canvas at max 1200px wide
  ```
- [ ] **Step 1: Tests:** `empty board gives null preview`; `svg viewBox matches content bounds plus padding` (one rect 0,0,100,50, strokeWidth 2 → bounds padded by 1 → `viewBox="-17 -17 134 84"`); `same seed gives identical svg` (determinism); `rotated element emits rotate transform`.
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5:** Commit `feat(sketch-block): svg export and preview`.

### Task 11: Board UI (SketchBoard, Toolbar, ZoomControls) and engine entry

**Files:**
- Create: `src/ui/{SketchBoard.vue,Toolbar.vue,ZoomControls.vue,icons.ts}`, `src/messages.ts`, `src/styles/sketch.css`
- Modify: `src/engine.ts`
- Test: `test/board.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces:
  ```ts
  // SketchBoard.vue props
  { connection: BoardConnection; readonly?: boolean; locale?: 'vi' | 'en'; theme?: 'light' | 'dark' }
  emits: { change: [] /* any local edit, for preview debounce */ ; exit: [] /* Escape with empty selection */ }
  expose: { getElements(): readonly SketchElement[]; fit(): void }
  // engine.ts
  export { default as SketchBoard } from './ui/SketchBoard.vue'
  export { makePreview } from './io/svg'
  // messages.ts
  type SketchMessages = { title: string; description: string; interact: string; expand: string; close: string; empty: string; notOnDevice: string;
    tools: Record<ToolName | 'lock', string>; undo: string; redo: string; zoomIn: string; zoomOut: string; resetZoom: string; fit: string }
  const messages: Record<'vi'|'en', SketchMessages>
  ```
  SketchBoard internals: two stacked `<canvas>` (static, interactive) + root `tabindex=0`; ResizeObserver and `matchMedia('(resolution: …dppx)')` set backing size `cssSize × dpr`, `ctx.setTransform(dpr*zoom, …)` and clear the bitmap cache on dpr change (Review Focus 5); pointer events with `setPointerCapture`; wheel: ctrl/meta or pinch → `zoomAt` (factor `exp(-deltaY * 0.01)`), else pan; keydown → `controller.keyDown`, `preventDefault` when handled; `onBeforeUnmount` destroys scene/history/scheduler. Toolbar (top center): hand, select, rectangle, diamond, ellipse, lock toggle, using `@lucide/vue` icons (`Hand, MousePointer2, Square, Diamond, Circle, Lock`), active state, shortcut digit badge. ZoomControls (bottom right): undo, redo, zoom −, % (click = 100%), +, fit. CSS uses `--me-*` tokens only (copy button look from `.me-tool-btn`).
- [ ] **Step 1: Tests** (`@vue/test-utils` with canvas stub): `mounts with a memory connection and renders toolbar with 6 buttons`; `pressing r then dragging creates an element and emits change`; `Escape with no selection emits exit`; `readonly hides creation tools`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat(sketch-block): board UI`.

### Task 12: Tiptap node, SketchView and `sketch` block definition

**Files:**
- Create: `src/block/{node.ts,SketchView.vue,definition.ts}`
- Modify: `src/index.ts`
- Test: `test/block.test.ts`

**Interfaces:**
- Consumes: `blockNodeView`, `useScope`, `useClickOutside`, `useEditable`, `defineBlock` from `@toantranmei/editor`; `SketchProvider`, `indexeddb`; `import('../engine')`.
- Produces:
  ```ts
  interface SketchOptions { provider: SketchProvider | null /* null → indexeddb() created lazily */; defaultHeight: number /* 480 */ }
  const SketchNode: Node<SketchOptions>   // name 'sketch', group 'block', atom, draggable; attrs boardId (default null), preview (null), height (null), version (0)
     // parseHTML 'div[data-type="sketch"]'; renderHTML div[data-type=sketch] + <img src=preview> when present
     // command insertSketch(): inserts node with boardId = `bd_${nanoid(10)}`
     // addNodeView: blockNodeView(SketchView) with stopEvent → true for all events while the view is interacting (Review Focus 2)
  const sketch: BlockDefinition<SketchOptions>  // defineBlock({ name: 'sketch', nodes: ['sketch'], extensions: o => [SketchNode.configure(o)],
     // items: [{ id: 'sketch', icon: PenTool, group: 'media', keywords: ['sketch','whiteboard','draw','canvas','ve','bang trang'], insert: c => c.insertSketch() }],
     // messages: { vi: { blocks: { sketch: { title: 'Bảng vẽ', description: 'Vẽ sơ đồ, phác thảo tự do' } } }, en: { blocks: { sketch: { title: 'Sketch', description: 'Whiteboard for diagrams and drawings' } } } } })
  index.ts exports: sketch, SketchNode, type SketchOptions, SKETCH_NODE, types from providers, messages
  ```
  SketchView states: (a) `preview` → `<img>` or empty placeholder; cover with **Interact** button (dblclick also) exactly like `HtmlView.vue` cover; (b) `interacting` → `await import('../engine')` (show spinner), `provider.connect(boardId)`, mount `SketchBoard` inline at node height; click outside (`useClickOutside`) or board `exit` → leave; (c) fullscreen → Teleport modal with `v-bind="scope"` reusing the same connection, Esc closes. Height resize handle like `HtmlView.vue` (`me-embed-resize`), clamp 240–1600. On leaving interact or 2 s after last `change` (debounced): if editable and the board was edited this session → `makePreview` → `savePreview` (if provider has it, URL) else data URL → `updateAttributes({ preview, version: version + 1 })`. If `connect` returns `existed === false` and the node has a preview → show notice `notOnDevice`, keep preview (Review Focus 1). Connection destroyed on unmount.
- [ ] **Step 1: Tests** (Tiptap `Editor` with `sketch` block + `MeiConfig`, happy-dom):
  - `insertSketch creates a node with a bd_ id and default attrs`; `getJSON round-trips attrs and contains no element data`.
  - `node view stopEvent swallows keyboard and pointer events while interacting` (Review Focus 2) — mount view, set interacting, call `nodeView.stopEvent(new KeyboardEvent('keydown',{key:'Backspace'}))` → true; when not interacting → false for keydown.
  - `does not overwrite preview when board is empty and was never edited` (Review Focus 1) — memory provider without the board, node preview `'data:x'`, enter + exit interact → attrs unchanged.
  - `saves preview and bumps version after an edit` — enter, create element via exposed board, exit → `preview` starts with `data:image/svg+xml`, `version === 1`.
  - `read-only does not save preview` (Review Focus 4).
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Run `pnpm --filter @toantranmei/sketch-block build` → `check-entry` passes (entry < 15 KB gzip, no static heavy imports).
- [ ] **Step 6:** Commit `feat(sketch-block): sketch block node and view`.

### Task 13: Playground, e2e, benchmark, release changeset

**Files:**
- Modify: `apps/playground/{package.json,nuxt.config.ts,app/pages/index.vue}`, root `package.json`
- Create: `apps/playground/app/pages/sketch-bench.vue`, `scripts/e2e-sketch.mjs`, `scripts/bench-sketch.mjs`, `.changeset/sketch-block-initial.md`, `packages/sketch-block/README.md` (fill)

- [ ] **Step 1:** Playground: dependency `"@toantranmei/sketch-block": "workspace:*"`; alias `'@toantranmei/sketch-block': <repo>/packages/sketch-block/src/index.ts` (and `/providers`) mirroring the editor alias; add `sketch` to the `blocks` array in `index.vue`. `pnpm dev` → type `/bảng vẽ`, block appears.
- [ ] **Step 2:** `scripts/e2e-sketch.mjs` (Playwright, same server pattern as `scripts/bench.mjs`): insert block via slash → click Interact → press `r`, drag 100×80 → press `o`, drag → `Escape` twice → assert `.me-sketch img[src^="data:image/svg+xml"]` visible; reload → preview still visible; Interact → both elements present (`board.getElements().length === 2` via `window.__sketchDebug` exposed only in dev). Add root script `"e2e:sketch": "node scripts/e2e-sketch.mjs"`. Run → PASS.
- [ ] **Step 3:** `sketch-bench.vue` generates N mixed shapes (random seeds, grid layout) into a memory board and mounts `SketchBoard` fullscreen; `scripts/bench-sketch.mjs` drives pan (60 wheel events) and zoom (0.1 → 4) and reports average fps from `requestAnimationFrame` timestamps plus time-to-first-frame, for N = 1000, 5000. Root script `"bench:sketch"`. Target: ≥ 55 fps pan at 5000; record results in the PR description (not a CI gate).
- [ ] **Step 4:** README: install, `sketch` usage with `<MeiEditor :blocks>`, Nuxt plugin snippet `app.use(MeiEditorPlugin, { component: false, blocks: [...defaultBlocks, sketch] })`, providers, storage notes (IndexedDB is per-device; preview lives in doc JSON). Changeset: `'@toantranmei/sketch-block': minor` — "Initial release: sketch whiteboard block (M0)".
- [ ] **Step 5:** Full verification: `pnpm build && pnpm typecheck && pnpm test && pnpm e2e:sketch` → PASS; `cd packages/sketch-block && npm pack --dry-run` lists only `dist/**`, `README.md`, `LICENSE`, `package.json`. Confirm `@toantranmei/editor` `dist/index.js` size unchanged vs `main` (± the 4 new exports).
- [ ] **Step 6:** Commit `feat(sketch-block): playground demo, e2e, benchmark, changeset`.
