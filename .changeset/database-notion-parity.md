---
"@toantranmei/database-block": minor
---

Notion parity round for the database block:

- Filters: Is empty / Is not empty for every type, Files filterable, status filters by group, a filter bar with a chip per sort and filter, and the viewer's unsaved filter / sorts (`RowQuery.filter` / `sorts`) with Reset and Save for everyone.
- Rows: row menu (⋮⋮ click, right-click, bulk ⋯) with open in side / center / full page, edit a property of every selected row, duplicate (⌘D), copy link (`options.rowUrl`), save as template, add sub-item, delete; undo / redo (⌘Z, ⌘⇧Z) of data writes (`source.restoreRows` when present).
- Properties: the editor saves as you edit; options drag to reorder, sort A → Z / Z → A, swatch colors; status options under their groups with set as default and move to group; number shown as bar / ring, currency list; full / short dates, 12 / 24 hour; URL host only; relation database picker (`source.searchDatabases`) and limit; rollup targets of another database (`source.propsOf`); person / files limit; descriptions; a formula editor with a catalog of properties and functions.
- Views: header menu Group and Calculate; group sort / hide / reorder, no-value group last; conditional colors; calendar week view and wrapped titles; timeline quarter / year scales; table vertical lines, load limit with Load more, sub-items; form view; property visibility with search, drag and shown / hidden; lock database (`meta.locked`); copy link to view (`options.viewUrl`); row templates (title property `config.templates`); show / hide the database title.
- Look: switches, grey pill tabs, faint toolbar until hovered, status dots, popovers kept on screen.
