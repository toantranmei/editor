---
"@toantranmei/database-block": patch
"@toantranmei/editor": patch
---

Database title row like Notion: a 24px title as wide as its text with no rule under it (focused or not), "+" (add view) right after it on hover, and — with a single view — no tab bar: the toolbar sits at the end of the title row and the table starts right under it. The row handle and checkbox now sit in the page margin when there is room, so the first column lines up with the title and the page text. New token `database.headerRowHeight`; `database.titleSize` is now 24px.

The title row gets Notion's "⋯" menu (copy link to view, duplicate view, view database, edit title, edit icon, edit layout, hide title), and "+" (add view, in the title row or the tab bar) opens Notion's "Add a new view" grid: 4 columns of layouts, icon over name. New tokens `database.addViewWidth` and `database.addViewTileHeight`.
