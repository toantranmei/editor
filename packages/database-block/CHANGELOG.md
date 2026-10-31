# @toantranmei/database-block

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
