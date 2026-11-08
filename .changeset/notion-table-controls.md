---
"@toantranmei/editor": patch
---

Tables work like Notion's simple table: the hovered row and column get a small pill on the table's left / top border that grows into a ⋮⋮ button when pointed at — click opens the row / column menu (Escape now closes it), drag moves the row / column (the moving one shows selected, a blue line shows where it lands, Escape cancels). The "+" bars sit 8px from the table, outlined. The block handle (+ ⋮⋮) keeps 18px from the block (`handle.offset`), as Notion, so a click meant for the block doesn't hit it. Table handles stay clickable over the cell toolbar. Tokens: `tableControls.*` reworked (pill / grip sizes and colors, `addGap`, `addBorder`).
