# @toantranmei/database-block

## 0.3.0

### Minor Changes

- 14dcd6f: Cards, icons and sub-items:
  
  - Board / gallery card preview: Page cover and Page content (optional `source.rowPreview(rowIds)`, batched for the cards shown) besides None and a files property; card layout List / Compact (`config.card.layout`).
  - Row page icons (`Row.icon`, emoji or image URL) before the title in table, list, board, gallery and the static render; view option Show page icon (`config.show_page_icon`).
  - View tabs: an icon (`config.icon`) set from the tab menu, and Display as Icon and name / Icon only (`config.tab_display`).
  - Sub-items in list (nested ▸, any depth) and board ("N sub-items" on a parent card); Show sub-items as Nested / Flattened list (`config.sub_items_display`) in table, list and board. Relation cells pointing at rows of the same database show their titles once those rows were read.
- 4a730e9: Feed and dashboard views, drafts that persist:
  
  - Feed view (`type: 'feed'`): rows as posts (author / created time, `config.card.props`, page content preview from the new optional `source.rowPreview(rowIds)`, `config.feed_preview`), pages of `config.load_limit` (default 10) with Load more, infinite scroll on a full page or with no limit.
  - Dashboard view (`type: 'dashboard'`): `config.widgets`, chart and number widgets in a grid, each with its own filter on top of the view's; add, remove, reorder, half / full width, edit in a popover. `source.chart(viewId, query?)` takes an optional widget query (`ChartQuery`).
  - Viewers' unsaved filter / sorts survive reloads: `options.draftStore` (default `localStorage`, per `options.userId`, database and view; `false` for session only), `localDraftStore` exported.
- b4e84ab: Notion parity round for the database block:
  
  - Filters: Is empty / Is not empty for every type, Files filterable, status filters by group, a filter bar with a chip per sort and filter, and the viewer's unsaved filter / sorts (`RowQuery.filter` / `sorts`) with Reset and Save for everyone.
  - Rows: row menu (⋮⋮ click, right-click, bulk ⋯) with open in side / center / full page, edit a property of every selected row, duplicate (⌘D), copy link (`options.rowUrl`), save as template, add sub-item, delete; undo / redo (⌘Z, ⌘⇧Z) of data writes (`source.restoreRows` when present).
  - Properties: the editor saves as you edit; options drag to reorder, sort A → Z / Z → A, swatch colors; status options under their groups with set as default and move to group; number shown as bar / ring, currency list; full / short dates, 12 / 24 hour; URL host only; relation database picker (`source.searchDatabases`) and limit; rollup targets of another database (`source.propsOf`); person / files limit; descriptions; a formula editor with a catalog of properties and functions.
  - Views: header menu Group and Calculate; group sort / hide / reorder, no-value group last; conditional colors; calendar week view and wrapped titles; timeline quarter / year scales; table vertical lines, load limit with Load more, sub-items; form view; property visibility with search, drag and shown / hidden; lock database (`meta.locked`); copy link to view (`options.viewUrl`); row templates (title property `config.templates`); show / hide the database title.
  - Button property (`type: 'button'`, `config: { label?, actions }`): edit properties of the row (today / now / me), add a page (optionally opened), open a URL, show a confirmation; one undo step per click; the signed-in person comes from the optional `source.currentUserId`.
  - Automations (View settings → Automations, title property `config.automations`): when a page is added or a property is edited (optionally only to a matching value), edit properties of that page or add a page; run by the block right after this client's own write, in the same undo step, never re-triggered by their own writes.
  - Look: switches, grey pill tabs, faint toolbar until hovered, status dots, popovers kept on screen.

## 0.2.0

### Minor Changes

- 70c4afc: Static render: row titles can link to the row's page. `databaseRenderers({ rowHref })` /
  `databaseBlockRenderWith({ rowHref })` with `rowHref(databaseId, rowId) => string | null` render the title cell as
  `<a class="me-db-row-link" href>`; `renderStaticDatabase` takes an optional `rowHref(rowId)`.
- 28d9509: Presence: the caret stays while focus is elsewhere on the page (cleared on read-only, unmount, or a tab hidden for
  over a minute, restored when visible); typing re-shows the label (`cursor.activity`); labels darken their colour
  for 4.5:1 white text (`labelBackground`). Uploads: new attr `uploadStartedAt`; only the uploading tab shows progress
  and Delete / Retry, others "Uploading…", and after 2 minutes without an owner "Upload interrupted" with Delete
  (`uploadState`, `UPLOAD_STALE_MS`, message `uploadInterrupted`); a duplicated placeholder gets its own state; Word's
  `file:` images are uploaded from the clipboard in place; drops over gaps use the block geometry (`blockAtPoint`,
  `blockGapAtPoint`). `renderTokensStyle` also drops values with comments or backslashes. Database: the row link sits on
  the title property (or a leading cell without one); loading keeps the view's last height or `database.loadingHeight`.

### Patch Changes

- d48d595: Duplicate-placeholder cleanup recognises any `y-sync$…` meta (y-tiptap loaded twice) and never runs on sync
  transactions; presence raises `activity` at most once a second; FileDrop's fallback drop position uses BlockDrop's
  configured containers; "interrupted" uploads count from when this tab first saw them (clock skew, `uploadStaleAt`);
  the database chunk-loading placeholder carries a screen-reader "Loading…" in the editor's locale.
- Updated dependencies [0fe3868]
- Updated dependencies [c90937c]
- Updated dependencies [28d9509]
- Updated dependencies [d48d595]
- Updated dependencies [6681cb8]
- Updated dependencies [4edb914]
- Updated dependencies [e76a340]
- Updated dependencies [70c4afc]
  - @toantranmei/editor@0.4.0
  - @toantranmei/chart-block@0.1.1

## 0.1.0

### Minor Changes

- 311ead3: Notion parity for databases.
  
  - **Open pages in** side peek / center peek / full page per view (`config.open_in`). Rows open through
    `options.openRow(databaseId, rowId, mode, event?)` when set, else `source.openRow(rowId, mode)` (new optional
    second argument; sources that ignore it keep working). `<DatabaseView>` emits `openRow(rowId, mode, event?)`.
    Cmd / Ctrl-click asks for `full_page`. Hover "OPEN" button on the title cell shows the mode.
  - **Title** reads `source.meta.title` and saves while typing (debounced) and on blur; remote renames show up.
    New `showTitle` prop: by default shown inline and **hidden with `full`** (the host page header shows the title);
    emits `update:title`.
  - **Toolbar**: compact icon buttons (filter / sort with active badges, group, properties, search, view options) and a
    "New" split button (add to top / bottom, open mode); narrow databases keep icons only, tabs scroll on one line.
  - **View options** for every layout: layout switcher (keeps filters, sorts, widths…), table wrap all / freeze first
    column, board card cover / size / fit image / color columns, gallery cover / size / fit image, calendar weekends,
    timeline dates / scale / title column, chart and pivot setup, "Open pages in".
  - **Table**: header menu adds wrap text, freeze up to this column (`config.freeze`), insert left / right, duplicate
    property; wrapped columns grow rows (measured only while wrapping); Shift-click checkbox ranges; floating
    selection bar (delete / clear); "New" can add to the top (`createRow({ after: null })`).
  - **Board** image covers and sizes; **gallery** "New" card and image placeholder; **list** "New" row; list and gallery
    heights follow their content.
- 59f6faa: Notion-style databases and charts.
  
  **@toantranmei/database-block** (new)
  
  - `databaseBlock.configure({ source, createDatabase, open? })`: `databaseView` node (atom, `databaseId`, `viewId`,
    `inline`, block id) rendering a database from the app's `DatabaseSource` (notes contract 1.7). Slash items
    "Database – inline" / "Database – full page" (vi / en / zh).
  - Title, view tabs (add / rename / duplicate / delete), toolbar (filter builder with And / Or groups and the
    contract operators per type, sorts, group by, property visibility, search, New).
  - Table on TanStack Table + TanStack Virtual: rows and columns virtualized, only visible windows requested
    (`rows(viewId, { offset, limit })`, refetched on `version`), sticky header / first column, resize and reorder
    columns, per-type cell editors, spreadsheet keyboard, TSV copy / paste (creates rows), footer calculations, row
    reorder (`moveRow`), select + delete, open row. 100k rows scroll at ~60 fps.
  - Board, calendar, timeline, gallery, list, chart (via chart-block) and pivot views; property menu (rename, edit,
    change type with a lossy warning, hide, sort, filter, delete) and "add property" with formula check.
  - `<DatabaseView>` for full-page databases; `@toantranmei/database-block/memory` in-memory source for demos / tests.
  - Static HTML: a `render` hook (read-only table from `data.databases[databaseId]`) and a DOM-free
    `@toantranmei/database-block/render` entry (`databaseBlockRender`).
  - Optional source additions: `validateFormula`, `rowsInRange`, and a `{ search }` query argument.
  
  **@toantranmei/chart-block** (new)
  
  - `<DatabaseChart :data :config>` (bar, line, area, pie, donut, scatter; stacked; LTTB above 5000 points) with
    ECharts imported per module and loaded lazily; colors from the editor tokens, light / dark.
  - Standalone `chart` block (`{ data: { columns, rows }, config }`) with an inline data grid, CSV paste and settings.
  
  **@toantranmei/editor**
  
  - New design tokens `component.database.*` and `component.chart.*`.
  - `scripts/check-styles.mjs` takes a source directory, so block packages run the token check on their own sources.

### Patch Changes

- 343e181: Fixes found by the ai-factory /notes kitchen-sink page.
  
  - **editor:** redo in collaboration mode; code blocks without a language stay `null`; Tab / Shift-Tab indent and
    outdent the right lines in code blocks; unsafe image sources are never loaded or opened; the file block accepts
    same-origin upload paths; Mermaid diagrams render independently and keep the last good diagram while the code is
    invalid; menus at the caret ignore a resting pointer; mention links and avatars go through `safeUrl`; image link
    actions tell same-origin from other hosts.
  - **editor, Markdown paste:** pasted Markdown text becomes blocks (linear parsers, no paste rules, bounded inline
    nesting, 100 KB cap).
  - **editor, collaboration:** first render once per binding and view, no editing before sync, a sticky read-only
    fallback; `@tiptap/y-tiptap` pinned to 3.0.11.
  - **database-block:** no chart / pivot query without axes; a pivot without rows or columns still shows its grand total.
- Updated dependencies [59f6faa]
  - @toantranmei/chart-block@0.1.0
