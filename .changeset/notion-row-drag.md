---
"@toantranmei/database-block": patch
"@toantranmei/editor": patch
---

Dragging table rows works like Notion and no longer stutters: it runs on pointer events (not HTML5 drag and drop) and hit tests once per frame, so a move re-renders nothing but one line. The row stays in place, selected; a see-through copy of the whole row (frozen columns included) follows the pointer; one blue line shows where it lands; the page or a full-page table scrolls when the pointer nears an edge; Escape cancels; a click on the handle without moving still opens the row menu. Editor tokens: `database.dragGhostOpacity` (0.4) and `database.dragGhostZ`. The block now needs `@toantranmei/editor` 0.4.1.
