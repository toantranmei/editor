---
"@toantranmei/database-block": minor
---

Cards, icons and sub-items:

- Board / gallery card preview: Page cover and Page content (optional `source.rowPreview(rowIds)`, batched for the cards shown) besides None and a files property; card layout List / Compact (`config.card.layout`).
- Row page icons (`Row.icon`, emoji or image URL) before the title in table, list, board, gallery and the static render; view option Show page icon (`config.show_page_icon`).
- View tabs: an icon (`config.icon`) set from the tab menu, and Display as Icon and name / Icon only (`config.tab_display`).
- Sub-items in list (nested ▸, any depth) and board ("N sub-items" on a parent card); Show sub-items as Nested / Flattened list (`config.sub_items_display`) in table, list and board. Relation cells pointing at rows of the same database show their titles once those rows were read.
