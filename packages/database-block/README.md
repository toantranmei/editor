# @toantranmei/database-block

Notion-style databases for [`@toantranmei/editor`](https://www.npmjs.com/package/@toantranmei/editor). The package is
**UI only**: your app passes a `DatabaseSource` (data, queries, writes) and the block renders it.

- **Database – inline** / **Database – full page** in the slash menu (your `createDatabase`)
- Editable title, view tabs (add with a type picker, rename, duplicate, delete), toolbar with filter builder
  (And / Or, nested groups, operators per property type), sorts, group by, property visibility, search, "New"
- **Table**: headless [TanStack Table](https://tanstack.com/table) + [TanStack Virtual](https://tanstack.com/virtual),
  rows **and** columns virtualized, sticky header and first column, resize and reorder columns, footer calculations,
  row drag handle, row selection + delete, "Open" a row, grouped sections. Spreadsheet keyboard: arrows (⌘ jumps),
  Shift extends, Tab / Shift-Tab, Enter edits, typing starts editing, Esc, Delete clears, copy / paste ranges as TSV
  (paste past the end creates rows, unknown select names become options)
- Cell editors per type: text, number (formats), select / multi-select / status (create options, colors), date
  (calendar, end date, time), checkbox, URL / email / phone, person (`people()`), files (`upload()` or a link),
  relation (`searchRows()`); formula / rollup / created / edited / ID are read-only (`row.computed`)
- **Board** (drag cards between groups = `setCell`, add a group), **calendar** (drag to move a date), **timeline**
  (drag / resize bars, day / week / month), **gallery** (cover from a files property), **list**, **chart**
  (drawn by [`@toantranmei/chart-block`](https://www.npmjs.com/package/@toantranmei/chart-block)), **pivot** (with totals)
- Property menu: rename, edit (number format, options, date format, formula with live check, relation, rollup, ID
  prefix), change type (warns when values may be lost), hide, sort, filter, delete; "+" adds a property
- Only the rows in view are requested (`rows(viewId, { offset, limit })`, chunk-aligned, + overscan); a new
  `version` re-reads just those windows. 100k rows scroll at 60 fps (see Performance)
- Works in collaborative documents; Vietnamese, English and Simplified Chinese; styled only with the editor's
  design tokens (`component.database.*`), light and dark

## Install

```bash
npm i @toantranmei/database-block
```

Dependencies (installed with it): `@tanstack/vue-table`, `@tanstack/vue-virtual`, `@toantranmei/chart-block`
(ECharts loads only when a chart view is shown). Peers: `@toantranmei/editor` `^0.3.0`, `vue` `^3.5`, Tiptap
`3.32.0` (`@tiptap/core`, `@tiptap/pm`, `@tiptap/vue-3`) and `@lucide/vue`, all already installed with the editor.
The build keeps dependencies and peers external, so your app has one copy of each.

## Usage

```vue
<script setup lang="ts">
import { MeiEditor, defaultBlocks } from '@toantranmei/editor'
import { databaseBlock } from '@toantranmei/database-block'
import '@toantranmei/editor/style.css'
import '@toantranmei/database-block/style.css'
import '@toantranmei/chart-block/style.css' // chart views

const router = useRouter()
const blocks = [
  ...defaultBlocks,
  databaseBlock.configure({
    // One source per database (may be async; the block caches it per id).
    source: databaseId => notesDb.open(databaseId),
    // Creates a database (server adds the `title` property and a table view), resolves to its id.
    createDatabase: kind => api.createDatabase({ parentId: pageId, fullPage: kind === 'full_page' }),
    // Opens a database as a page: "Database – full page" links, the ⤢ button.
    open: databaseId => router.push(`/db/${databaseId}`),
  }),
]
</script>

<template>
  <MeiEditor v-model="doc" :blocks="blocks" />
</template>
```

A full-page database route renders the same UI without an editor:

```vue
<DatabaseView :source="source" :database-id="id" v-model:view-id="viewId" locale="en" full />
```

## Options

| Option | Description |
| --- | --- |
| `source` | `(databaseId) => DatabaseSource \| Promise<DatabaseSource>`. Cached per id; a rejected promise shows "not found" |
| `createDatabase` | `(kind: 'inline' \| 'full_page') => Promise<string>`. Without it the slash items are hidden |
| `open?` | `(databaseId, event?) => void` |
| `onError?` | Errors from `createDatabase` / the source. Default `console.error` |
| `messages?` | Override strings per locale: `{ en: { newRow: 'Add' } }` |
| `pageSize?` | Rows per window request (default 50) |
| `rangeLimit?` | Rows read by calendar / timeline when the source has no `rowsInRange` (default 2000) |

The node `databaseView` stores `databaseId`, `viewId` (the open tab, written back when the user switches tabs) and
`inline` (`false`: a link row to a full-page database) plus the editor's block `id`. Commands:
`insertDatabaseView({ databaseId, viewId?, inline? })`, `createDatabase(kind)`.

## `DatabaseSource`

The interface of the notes contract (section 1.7): reactive `meta`, `props`, `views`, `version`, `canEditContent`,
`canEditStructure`; reads `rows`, `groups`, `rowsInGroup`, `aggregate`, `chart`, `pivot`; writes `setCell`,
`createRow`, `deleteRows`, `moveRow`, `upsertProp`, `deleteProp`, `upsertView`, `deleteView`, `setMeta`; `openRow`,
`searchRows`, `people`, `upload?`. Cell values are the contract's JSON (`select` → option id, `date` →
`{ start, end? }`, clearing → `null`). This block adds, all optional:

- `rows` / `groups` / `rowsInGroup` / `aggregate` take a third argument `{ search?: string }` (the toolbar search box;
  not saved in the view).
- `validateFormula?(expression) → { ok: true, type? } | { ok: false, error, position?, code? }` (sync or async):
  checked while typing a formula; the result type is saved as `config.result_type` so filters / charts know it.
- `rowsInRange?(viewId, propId, start, end, query?) → Row[]` for calendar and timeline.
- Filter values not fixed by the contract: `between` → `[start, end]` (ISO days), dates → `'YYYY-MM-DD'`.

`@toantranmei/database-block/memory` exports `createMemorySource(init)` (an in-memory source that runs filters,
sorts, groups, aggregates, chart, pivot and a small formula language in JS) and `sampleDatabase(n)`, for demos and
tests.

## Performance

Playground `/database`, 100k rows, 24 properties, production build, headless Chromium (Apple Silicon): wheel,
constant-speed and scrollbar-jump scrolling and horizontal scrolling all run at ~60 fps with no long tasks; ~26 rows
× 9 cells are in the DOM at any time.

## License

MIT
