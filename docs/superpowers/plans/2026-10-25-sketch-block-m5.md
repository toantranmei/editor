# Sketch Block M5 (Advanced Content) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@toantranmei/sketch-block@0.6.0` with:
- web embeds (B7)
- emoji stamps (B10)
- code blocks with syntax highlighting (B11)
- tables (B8)
- cards / kanban (B9)
- Mermaid → hand-drawn diagram (B12)
- mind maps (C4)
- auto layout (C5)

**Architecture:**
- Each new content type is an `ElementKind`: a canvas draw, an SVG export path, hit/resize, and a shapeKey.
- Content that needs live DOM (embeds) renders as a positioned DOM overlay while the board is live, and as a static placeholder card (title, URL, favicon) in the canvas, preview and export.
- Code highlighting reuses `lowlight`, already a dependency of the editor, imported lazily in the engine only.
- Mermaid conversion parses the diagram with the `mermaid` parser and maps the nodes and edges into our elements. `mermaid` is an optional peer, already used by the editor and imported lazily.
- Mind map and auto layout share a pure layout module: a tidy tree, plus a layered layout for flowcharts.

**Spec:** `docs/superpowers/specs/2026-10-25-sketch-block-design.md`, "Các mốc" → M5.

## Global Constraints
- **Inherited.** Everything from M1–M4 still applies:
  - entry ≤ 15 KB gzip with no heavy static imports (lowlight and mermaid only via dynamic import in the engine)
  - one gesture = one undo step
  - locked elements are never written
  - hex colors, `--me-*` tokens, vi/en strings
  - no attribution lines; stage files explicitly
- **Embed** (`type: 'embed'`, `{ url, title }`):
  - Allowed URLs: https only, matching the editor's `toEmbedUrl` (packages/editor `src/extensions/embed.ts`): YouTube, Vimeo, Figma, Loom, CodePen, Google Maps, plus generic https as a link card without an iframe.
  - While the board is live, the iframe overlay uses `sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"` only for the allowlisted providers. Other https URLs show the card with no iframe.
  - The iframe only takes pointer events after a click ("Interact" pattern, as the HTML block does). Wheel goes to the board until then.
  - Canvas, preview and export draw a card with the title, the hostname and a play glyph for video providers.
  - Insertion: the toolbar "Embed" button opens a URL prompt, or paste a URL while nothing is being edited and the URL matches the allowlist.
- **Emoji stamp** (`type: 'stamp'`, `{ emoji }`):
  - One grapheme from the editor's emoji data, or a fixed set of 24 reaction stamps.
  - Drawn with `fillText` in the system emoji font, sized to the box.
  - Stamp tool (`key: none`, toolbar) with a small picker grid.
  - SVG export uses `<text>`.
- **Code block** (`type: 'code'`, `{ code, language, theme: 'light' | 'dark' | 'auto' }`):
  - Monospace, highlighted with lowlight once loaded; plain text before that.
  - Tokens map to a fixed 8-color palette that matches the editor's code block.
  - Edited through a textarea overlay (like TextEditor) with Tab inserting two spaces.
  - Box auto-sizes to the content unless resized.
  - Max 20_000 chars.
- **Table** (`type: 'table'`, `{ rows: string[][], colWidths: number[], rowHeights: number[] }`):
  - Max 50×20 cells, 500 chars per cell.
  - Double-click a cell to edit it. Tab / Shift+Tab move between cells.
  - Context buttons add or remove a row/column.
  - Rendering uses a hand-drawn grid (roughjs lines) with wrapped cell text.
- **Card** (`type: 'card'`, `{ title, description, assignee, due, tags: string[], color }`):
  - Field caps: title ≤ 200, description ≤ 2000, assignee ≤ 80, due as ISO date or null, ≤ 8 tags of ≤ 24 chars, `color` from the sticky palette.
  - Drawn as a rounded card with a colored left bar, a title, two description lines, and a footer showing the assignee initials, the due date and tags.
  - Double-click opens a small form overlay to edit the fields.
  - Kanban: dragging a card into a frame snaps it into a vertical stack, re-flowing the cards in that frame by y order with a gap of 12, in one undo step.
- **Mermaid → sketch:**
  - "Insert Mermaid" dialog: a textarea and a live preview of the converted elements.
  - Supports `flowchart`/`graph` (TD/LR/BT/RL): nodes with shapes `[]`, `()`, `{}`, `(())`, `[()]`, `>]`, mapped to rectangle, stadium, diamond, ellipse, cylinder and callout; edges with labels; arrowheads; subgraphs mapped to frames.
  - Supports `sequenceDiagram` in basic form: participants become rectangles across the top, messages become labeled arrows going down, lifelines become dashed lines.
  - Other diagram types: show "not supported, will insert as image" and insert the editor's mermaid SVG rendering as an image element.
  - Parsing uses `mermaid.parse` plus the `mermaidAPI` db getters. If the internal API is unavailable in the installed version, fall back to a small built-in flowchart parser that covers the subset above. Report which path was used.
- **Mind map:**
  - The node type is a shape with a `mind: { root: string | null }` marker; the root has `root: null`.
  - Tab adds a child and Enter adds a sibling, each auto-connected with a bound curved arrow. Delete removes the subtree after confirming the count in the toast-undo pattern (undo is enough; no confirm dialog).
  - Branch colors cycle through a palette of 6.
  - Every structural edit relayouts with the tidy-tree layout (horizontal, balanced left/right for the root) in the same undo step.
- **Auto layout:** "Tidy up" action for a selection that contains bound arrows.
  - Layered (Sugiyama-lite) layout: longest-path ranking, barycenter ordering in 2 passes, coordinate assignment with node gaps of 60 between ranks and 40 within a rank.
  - Direction is LR or TD, chosen by the current bounding-box aspect ratio.
  - It moves only unlocked elements, uses `withFollowers`, and is one undo step.

## Review Focus
1. **Embed iframes:**
   - Never render for non-allowlisted URLs.
   - Never steal wheel or keys before Interact.
   - Removed on unmount.
   - No iframes in previews or exports.
   - Tests: Task 1.
2. **Large and malicious content** (huge code, tables at the caps, mermaid input with 10k nodes) must not freeze the board. Caps are enforced on input, clipboard and read (`isRenderable` per type). Mermaid input above 50_000 chars or 2000 nodes is refused with a message. Tests: Tasks 3, 4, 6.
3. **Mermaid parser errors** show inline and never throw. Tests: Task 6.
4. **Mind map and auto layout** must converge under remote edits. Layout is deterministic for the same input, and the repair observer is untouched: layout writes are local and undoable. Tests: Tasks 7–8.
5. **Table cell editing with IME and Tab navigation:** IME composition must not move cells. Tests: Task 4.

---

### Task 1: Embed kind and live overlay
**Files:**
- Create: `src/elements/embed.ts`, `src/ui/EmbedLayer.vue`, `src/io/embed-url.ts`
- Modify: the model (type tuple, `isRenderable`, normalize), clipboard, toolbar, board paste.

**Produces:**
- `toSketchEmbed(url): { provider: string; src: string; title: string } | null` (allowlist; reuses the logic of the editor's `toEmbedUrl` by import if exported, otherwise mirrors it)
- the kind
- the overlay layer, which positions iframes over embed elements using `viewport.toScreen` and rotation

- [ ] Tests:
  - `allowlist`
  - `generic https becomes card without iframe`
  - `iframe only after interact`
  - `no iframe in svg/preview`
  - `overlay removed on unmount`
  - `paste of youtube url inserts embed`
- [ ] Commit `feat(sketch-block): web embeds`.

### Task 2: Emoji stamps
**Files:** create `src/elements/stamp.ts`, `src/tools/stamp.ts`, `src/ui/StampPicker.vue`; modify the model and toolbar.
- [ ] Tests:
  - `stamp draws emoji at box size`
  - `picker inserts`
  - `svg text`
  - `clipboard caps to one grapheme`
- [ ] Commit `feat(sketch-block): emoji stamps`.

### Task 3: Code blocks
**Files:** create `src/elements/code.ts`, `src/ui/CodeEditor.vue`, `src/text/highlight.ts` (lazy lowlight with a cached token run per (code, language)); modify the model, toolbar and clipboard.
- [ ] Tests:
  - `renders plain before highlight loads then highlighted`
  - `tab inserts spaces`
  - `20k cap`
  - `autosize`
  - `svg export colored tspans`
  - `lowlight not in entry` (check-entry)
- [ ] Commit `feat(sketch-block): code blocks`.

### Task 4: Tables
**Files:** create `src/elements/table.ts`, `src/ui/TableEditor.vue`; modify the model and controller (cell editing state).
- [ ] Tests:
  - `caps enforced`
  - `cell edit commit is one undo step`
  - `tab moves cells; IME composition does not`
  - `add/remove row/col`
  - `resize keeps col ratios`
  - `svg export grid and text`
- [ ] Commit `feat(sketch-block): tables`.

### Task 5: Cards and kanban flow
**Files:** create `src/elements/card.ts`, `src/ui/CardForm.vue`, `src/geometry/stack.ts`; modify the select tool's drop into a frame (reflow).
- [ ] Tests:
  - `card fields capped and sanitized`
  - `form edits one undo step`
  - `dropping card into frame reflows stack with gap 12`
  - `reflow skips locked`
  - `svg export`
- [ ] Commit `feat(sketch-block): cards and kanban flow`.

### Task 6: Mermaid → sketch
**Files:** create `src/io/mermaid-import.ts` (parser adapter plus fallback parser plus mapping) and `src/ui/MermaidDialog.vue`.
- [ ] Tests (fallback parser path in unit tests; mermaid real path behind a guard):
  - `flowchart LR shapes and labeled edges`
  - `subgraph becomes frame with children`
  - `sequence basic`
  - `unsupported type falls back to image`
  - `syntax error inline`
  - `refuses > 50k chars / > 2000 nodes`
  - `inserted arrows bound to nodes`
- [ ] Commit `feat(sketch-block): mermaid to sketch`.

### Task 7: Layout engine and auto layout
**Files:** create `src/layout/tidy-tree.ts` and `src/layout/layered.ts`; modify the controller (`tidyUp()`) and the StylePanel arrange section ("Tidy up" button when the selection has ≥ 2 nodes connected by bound arrows).
- [ ] Tests:
  - `layered ranks and orders deterministic`
  - `tidy tree balanced`
  - `tidyUp moves only unlocked, followers re-routed, one undo step`
  - `cycles handled (back edges ignored for ranking)`
- [ ] Commit `feat(sketch-block): auto layout`.

### Task 8: Mind maps
**Files:** create `src/tools/mindmap.ts`; modify the model (`mind` marker on shapes, validated), controller keys (Tab/Enter when one mind node is selected and not editing), and the toolbar (a "Mind map" button that inserts a root at the viewport center).
- [ ] Tests:
  - `tab adds child with bound arrow and relayout`
  - `enter adds sibling`
  - `delete subtree undo restores`
  - `branch colors cycle`
  - `remote edit then relayout deterministic`
- [ ] Commit `feat(sketch-block): mind maps`.

### Task 9: UI integration, e2e, README, changeset, final verification
- The toolbar has an overflow "More" menu holding embed, stamp, code, table, card, Mermaid and mind map, so the main toolbar doesn't grow. Messages in vi and en.
- e2e:
  - insert a code block and a table, edit a cell, check the elements
  - insert Mermaid `flowchart LR; A-->B` and check 2 nodes plus 1 bound arrow
  - create a mind map with Tab ×2 and check 3 nodes
  - embed a YouTube URL and check the card is drawn and no iframe exists before Interact
- README covers all M5 features and marks M5 done; roadmap 1.0 notes.
- Changeset: minor.
- Full verification: build, typecheck, test, e2e, collab e2e, pack, bench.
- [ ] Commit `feat(sketch-block): M5 e2e and docs`.
