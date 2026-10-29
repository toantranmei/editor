---
"@toantranmei/database-block": minor
"@toantranmei/chart-block": minor
"@toantranmei/editor": minor
---

Notion-style databases and charts.

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
- Optional source additions: `validateFormula`, `rowsInRange`, and a `{ search }` query argument.

**@toantranmei/chart-block** (new)

- `<DatabaseChart :data :config>` (bar, line, area, pie, donut, scatter; stacked; LTTB above 5000 points) with
  ECharts imported per module and loaded lazily; colors from the editor tokens, light / dark.
- Standalone `chart` block (`{ data: { columns, rows }, config }`) with an inline data grid, CSV paste and settings.

**@toantranmei/editor**

- New design tokens `component.database.*` and `component.chart.*`.
- `scripts/check-styles.mjs` takes a source directory, so block packages run the token check on their own sources.
