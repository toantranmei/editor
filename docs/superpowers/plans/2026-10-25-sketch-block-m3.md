# Sketch Block M3 (Backend & Collaboration) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@toantranmei/sketch-block@0.4.0` with:
- an HTTP provider (persisted Yjs updates, offline cache);
- a websocket provider (realtime) with presence: cursors, selections, follow, laser broadcast;
- clone-on-paste of boards in the editor;
- board bundle export/import and `collectBoardIds`;
- canvas search;
- element links;
- a local sync server for the playground.

**Architecture:**
- Providers live in `@toantranmei/sketch-block/providers` (separate entry, may import yjs).
- `websocket()` dynamically imports `y-websocket` (optional peer) inside `connect`, so apps that don't use it never need it.
- Presence uses the y-protocols `Awareness` on `BoardConnection.awareness` when present. The board publishes local state at most every 50 ms and renders remote state on the interactive layer.
- Board-level operations (clone, export, import) work through the generic `SketchProvider.connect`. A provider may offer a faster optional `clone`.

**Tech Stack:** M2 stack plus `y-websocket 3.1.0` (optional peer, MIT), `@y/websocket-server 0.1.5` (playground dev dependency only, MIT), and `y-protocols` (already an optional peer).

**Spec:** `docs/superpowers/specs/2026-10-25-sketch-block-design.md`. Relevant sections: "Lưu trữ dữ liệu", "Khi có backend" (Cấp A, Cấp B), "Vòng đời board", and "Các mốc" → M3 (adds D7 search, D8 links).

## Global Constraints
- All M1/M2 constraints still hold:
  - entry < 15 KB gzip with no static yjs/engine import;
  - one gesture = one undo step;
  - only local edits are undoable;
  - locked elements are never written;
  - hex colors, `--me-*` tokens, vi/en strings;
  - no attribution lines; stage files explicitly.
- Undo stays local: remote updates and provider loads use their own origins, never `LOCAL_ORIGIN`.
- `http()` options:
  - `{ load(id): Promise<ArrayBuffer | Uint8Array | null>, save(id, update: Uint8Array): Promise<void>, savePreview?, uploadImage?, debounceMs = 1000, offline = true }`
  - Local updates are merged with `Y.mergeUpdates` and sent debounced.
  - A failed save keeps the pending merge and retries with backoff of 1 s, 2 s, 4 s … max 30 s.
  - `destroy()` attempts a final flush.
  - With `offline`, the provider also persists to IndexedDB (`mei-sketch:<id>`) and, after the server load, pushes the IDB-only diff (computed by state vector) to the server.
- `websocket()` options:
  - `{ url: string, params?: () => Record<string,string>, offline = true, connectTimeoutMs = 4000, WebSocketPolyfill? }`
  - Room = boardId.
  - `connect` resolves after the first `sync` or the timeout. After a timeout it resolves with the IndexedDB contents when `offline`, otherwise with an empty doc, and keeps reconnecting in the background.
- `BoardConnection` gains `status?: { get(): 'connecting' | 'online' | 'offline' | 'saving' | 'saved' | 'error'; on(cb): () => void }`. SketchView shows a small status dot with a tooltip in the block bar.
- Presence:
  - Local awareness state: `{ user: { name, color }, cursor: {x,y} | null, selection: string[], viewport: {x,y,zoom}, laser: {x,y,t}[] }`, published at most every 50 ms.
  - Identity comes from `sketch.configure({ user })`, which accepts `{ name, color } | (() => …)`. The default is `Khách N`/`Guest N` (locale) with a color from `['#e03131','#2f9e44','#1971c2','#f08c00','#9c36b5','#0c8599']` chosen by hashing `doc.clientID`.
- Clone-on-paste: when a paste or duplicate creates a `sketch` node whose `boardId` already exists elsewhere in the document, assign `bd_<nanoid(10)>` and clone the board state (`provider.clone?.(from, to)` ?? generic connect, encode, connect, apply), keeping the preview. This is the `onPasteClone` option, default `true`.
- Bundle format: `{ type: 'mei-sketch/bundle', version: 1, doc: JSONContent, boards: Record<boardId, base64 Yjs state> }`. `importBoards` rejects files over 50 MB or with a wrong type or version, and never throws on malformed boards: it skips them and reports them.
- Links: element prop `link: string | null`. Allowed values are `https:`, `http:`, `mailto:`, and internal `#el:<id>`; anything else is stored as null. External links open with `window.open(url, '_blank', 'noopener,noreferrer')`. Internal links pan and zoom to the element and select it.
- Search: mod+F inside the board, diacritics-insensitive (NFD + strip marks + đ→d, same as the editor's `normalize`). It matches text, labels, sticky text and frame names. Enter/Shift+Enter step through matches, Escape closes. Matches are highlighted.

## Notes from the M2 final review (binding)
- Drag traffic: `store.applyPatch` skips unchanged keys (M2 fix). For networked providers, keep one write per animation frame. Do not add awareness-based drags in M3.
- `groupIds` and other arrays are last-writer-wins. Document in the README that concurrent group/ungroup of the same element keeps one side.
- Fold-ins from M2 triage: zero-size hit test gaps; Tab+IME sticky tests; a weak e2e preview check; the narrow-board toolbar/popover clipping (make the toolbar wrap scroll without clipping focus rings, and anchor the popover under its button).

## Review Focus
1. **Concurrent edits.**
   - A remote delete of an element being dragged, edited, cropped or bound must not throw or resurrect it; the local gesture ends gracefully.
   - A remote move during a local drag of a different element must not be overwritten.
   - Tests use two Y.Docs relayed through a simulated network (manual update forwarding).
   - → Task 4.
2. **Undo must never revert remote changes**, including after reconnect (offline edits pushed later). → Task 4 tests.
3. **Network failure.** HTTP save failures retry and keep data. A websocket timeout falls back to offline without blocking the UI. `destroy` during a pending save doesn't throw. → Tasks 1–2.
4. **Clone-on-paste.** Pasting a block twice gives two independent boards. An undo of the paste does not delete the cloned board's storage (orphans are acceptable; documented). Copying across editors works. → Task 7.
5. **Malicious input.**
   - Presence states from peers (names, colors, huge arrays) are validated and clamped before rendering: names ≤ 40 chars, cursor finite, ≤ 200 laser points, ≤ 2000 selection ids.
   - Imported bundles are validated.
   - Links are allowlisted.
   - → Tasks 3, 8, 10.

---

### Task 1: HTTP provider
**Files:** create `src/providers/http.ts`; modify `src/providers/types.ts` (status) and `src/providers/index.ts`. Test: `test/http-provider.test.ts`.
**Produces:** `http(opts): SketchProvider` as specified, plus `BoardConnection.status`.
- [ ] Tests (fake timers, in-memory fake server):
  - `loads server state`
  - `debounces and merges local updates into one save`
  - `save failure retries with backoff and keeps data`
  - `remote-load updates are not saved back`
  - `offline cache pushes IDB-only diff after load`
  - `destroy flushes pending save and never throws`
  - `status transitions saving→saved and error`
- [ ] Commit `feat(sketch-block): http provider`.

### Task 2: Websocket provider
**Files:** create `src/providers/websocket.ts`; modify `package.json` (`y-websocket` optional peer + dev dependency) and `src/providers/index.ts`. Test: `test/ws-provider.test.ts`.
- `connect` does `await import('y-websocket')` → `new WebsocketProvider(url, boardId, doc, { params, WebSocketPolyfill })`, awaiting `sync` with the timeout. With `offline`, it also uses `IndexeddbPersistence`.
- `existed` = elements > 0 after the first sync or the IDB load.
- `awareness` = `provider.awareness`.
- The status maps from the provider's `status`/`sync` events.
- `destroy` destroys the provider, persistence and doc.
- [ ] Tests (mock the `y-websocket` module with vi.mock: a fake provider emitting events):
  - `resolves on sync`
  - `timeout falls back to offline IDB content`
  - `status online/offline`
  - `awareness exposed`
  - `destroy cleans up`
  - `missing y-websocket rejects with a clear error`
- [ ] Commit `feat(sketch-block): websocket provider`.

### Task 3: Presence (cursors, selections, follow, laser broadcast)
**Files:** create `src/collab/presence.ts` (state shape, validation, throttled publisher, remote state reader) and `src/ui/Avatars.vue`; modify `src/ui/SketchBoard.vue`, `src/render/interactive.ts` (remote cursors, selections, lasers) and `src/block/definition.ts` + `node.ts` (`user` option → SketchView → board prop).
- Remote cursor: a small arrow with a name tag in the user color, screen-size.
- Remote selection: a 1.5 px outline in the user color around each selected element's rotated box.
- Remote laser: the same fade as local.
- Avatars (top-right, max 5 + "+N") show the initials circle and the name in the title. Clicking one follows that user: our viewport tracks their `viewport` until we pan or zoom ourselves or press Escape. A "following X" pill is shown.
- Publish on pointermove (cursor), selection change, viewport change and laser updates, throttled to 50 ms. Set `cursor: null` on pointerleave.
- `sanitizePresence(raw)` clamps every field as in Review Focus 5.
- With no awareness (local providers), presence is fully inert.
- [ ] Tests:
  - `publishes throttled state`
  - `renders remote cursor and selection` (recording ctx)
  - `sanitizes malicious presence`
  - `follow tracks viewport and stops on local pan`
  - `inert without awareness`
  - `default guest name and color stable per clientID`
- [ ] Commit `feat(sketch-block): presence, cursors and follow`.

### Task 4: Concurrent-edit robustness
**Files:** modify `src/tools/*` and `src/tools/controller.ts` where needed; add the test helper `test/helpers/relay.ts` (two docs plus manual or auto update forwarding).
- Behaviour when a target is removed remotely in the middle of a gesture:
  - In-progress move, resize, rotate or point drag: drop the element from the gesture. Later frames skip it, and revert skips it.
  - Text, label or sticky editing: the editor closes without writing.
  - Crop: cancelled.
  - Bound-arrow followers: ignore missing targets (already the case; verify).
  - Frame children: membership tolerates missing frames.
- A local write must never recreate a remotely deleted element: `applyPatch` already skips missing ids; verify across all writers.
- A remote move of an element that is not part of our gesture is never overwritten, because touched keys only ever include our elements.
- [ ] Tests (relay):
  - `remote delete during local drag`
  - `remote delete during text edit`
  - `remote delete during crop`
  - `remote move of other element during our drag survives`
  - `undo after remote edits only reverts ours`
  - `offline edits merged on reconnect then undo is local-only`
- [ ] Commit `fix(sketch-block): robust local gestures under concurrent edits`.

### Task 5: Derived-data repair observer (convergence)
**Files:** create `src/collab/repair.ts`; modify `src/ui/SketchBoard.vue` (or the BoardSession) to install it once per doc.
- Follower geometry of bound lines (x/y/w/h/points/angle) and `frameId` are derived data written by the client doing the move. Concurrent edits can merge into inconsistent states, for example an arrow attached to neither target, or a child outside its frame with a stale `frameId`.
- `installRepair(store, scene): () => void` observes transactions whose origin is NOT `LOCAL_ORIGIN`: remote updates, provider loads, and UndoManager undo/redo.
- For changed ids it recomputes `followBindings` and `membershipPatches`. When a result differs from the stored value, it writes with origin `REPAIR_ORIGIN` (untracked by History, never undone). Writes are debounced to the next microtask and batched.
- The result must be deterministic, so peers converge. Writes happen only when values differ, so there are no ping-pong loops.
- [ ] Tests (relay):
  - `concurrent moves of both arrow targets converge to arrow attached to both`
  - `undo of local move re-follows bound arrows`
  - `remote-deleted frame clears children frameId`
  - `no write when already consistent` (count transactions)
  - `repair writes are not undoable`
- [ ] Commit `feat(sketch-block): converge derived data after remote edits`.

### Task 6: Image bytes and privacy for collaboration
- `websocket()` and `http()` connections accept `maxInlineImageBytes` (default 256_000). When a board is connected through a networked provider (`connection.networked === true`) and no uploader is available, inserting an image whose data URL exceeds the limit shows the inline error `imageNeedsUpload` (vi/en) instead of inserting it.
- Add the optional `SketchProvider.resolveImageSrc?(src): string | null` (host allowlist and proxy). The image loader calls it before loading; null leaves the placeholder.
- Document both in the README.
- [ ] Tests:
  - `networked provider rejects oversized data URL without uploader`
  - `resolveImageSrc rewrite and block`
- [ ] Commit `feat(sketch-block): image limits and resolver for collaboration`.

### Task 7: Clone-on-paste of boards
**Files:** create `src/block/clone.ts`; modify `src/block/node.ts` (ProseMirror plugin: `appendTransaction` after paste/drop meta, or `transformPasted`, detecting duplicate `boardId`s) and `src/block/definition.ts` (`onPasteClone`).
**Produces:** `cloneBoard(provider, from, to): Promise<void>` (generic implementation) and optional `SketchProvider.clone?(from, to)`.
- The node gets its new id synchronously in the same transaction (`addToHistory: false` for the id rewrite meta). The clone itself runs async.
- While cloning, the block shows a "Copying board…" state; Interact is disabled until it finishes.
- If the clone fails, show an error and keep the new id (empty board, preview kept).
- [ ] Tests:
  - `pasting a sketch whose boardId exists assigns a new id and clones state`
  - `two pastes → two independent boards`
  - `paste into an empty doc (no duplicate) keeps id`
  - `clone failure shows error, no throw`
  - `onPasteClone false keeps id`
- [ ] Commit `feat(sketch-block): clone boards on paste`.

### Task 8: Bundle export/import, collectBoardIds
**Files:** create `src/providers/bundle.ts`; modify `src/providers/index.ts`; expose `collectBoardIds` from the main entry (pure, no yjs). Test: `test/bundle.test.ts`.
**Produces:**
```ts
collectBoardIds(doc: JSONContent): string[]   // depth-first, unique
exportBoards(doc: JSONContent, provider: SketchProvider): Promise<Blob>   // JSON per format; missing boards skipped (listed in result meta `missing`)
importBoards(input: Blob | string, provider: SketchProvider): Promise<{ doc: JSONContent; imported: string[]; skipped: string[] }>
```
- [ ] Tests:
  - `collectBoardIds nested`
  - `export→import round trip into a fresh memory provider`
  - `rejects wrong type/version and > 50 MB`
  - `malformed base64 board skipped`
  - `import does not overwrite existing board state but merges` (Yjs apply is a merge)
- [ ] Commit `feat(sketch-block): board bundles`.

### Task 9: Canvas search (D7)
**Files:** create `src/ui/SearchBox.vue` and `src/tools/search.ts`; modify `src/ui/SketchBoard.vue` and `src/render/interactive.ts` (match highlights).
- `searchElements(elements, query): string[]` (z-order, normalized).
- mod+F opens the search box (top-right under the controls) and focuses it. Enter/Shift+Enter cycle through matches: pan the viewport to center the match without changing zoom unless the match is off-screen at the current zoom, then select it. Escape closes. Matches get a translucent accent highlight.
- [ ] Tests:
  - `diacritics-insensitive match`
  - `cycles and pans`
  - `escape closes`
  - `no matches message`
- [ ] Commit `feat(sketch-block): canvas search`.

### Task 10: Element links (D8)
**Files:** modify `src/model/types.ts` (`link` prop on CommonProps, normalize null, isRenderable string|null), `src/io/clipboard.ts`, `src/ui/StylePanel.vue` (Link input for a single selection) and `src/render/interactive.ts` (link badge on hover/selected, screen-size); modify `src/tools/select.ts` (badge click and mod+click open the link).
**Produces:** `sanitizeLink(raw): string | null` and `openLink(link, ctx)`.
- [ ] Tests:
  - `allowlist`
  - `javascript: rejected`
  - `internal link pans and selects`
  - `external opens with noopener` (window.open spy)
  - `link survives copy/paste only for allowed values`
- [ ] Commit `feat(sketch-block): element links`.

### Task 11: Playground sync server, status UI, docs, e2e, changeset
- Playground:
  - devDependency `@y/websocket-server`;
  - root script `"sync": "y-websocket"` (or `node node_modules/@y/websocket-server/src/server.js`) with `HOST=localhost PORT=1234`;
  - the playground uses `websocket({ url: 'ws://localhost:1234' })` when the page URL has `?sync=1`, otherwise `indexeddb()`.
- SketchView status dot (Task 1/2 status), with vi/en messages.
- E2E (spawn the sync server and the dev server):
  - two browser contexts open `?sync=1` with the same document. Since the documents are per-browser localStorage, seed the same boardId via a query `?board=<id>` page that mounts SketchBoard directly, e.g. `/sketch-collab?board=e2e`.
  - Draw in A; B sees the element within 2 s. A's cursor is visible in B (check the presence state via the debug hook).
- README: providers (http and websocket with server notes: auth via params, persistence), presence/follow, clone-on-paste, bundles, search, links, and the roadmap with M3 marked done.
- Changeset minor.
- Full verification: build, typecheck, test, e2e, pack.
- [ ] Commit `feat(sketch-block): M3 playground sync, e2e, docs`.
