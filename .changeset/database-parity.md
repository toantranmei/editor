---
"@toantranmei/database-block": minor
---

Notion parity for databases.

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
