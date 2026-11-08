---
"@toantranmei/editor": patch
---

A table can be selected as a whole block again (`allowTableNodeSelection`): prosemirror-tables turned the drag handle's selection of the table into a selection of its cells, so dragging a table copied it (only the cells' text was removed from the original) instead of moving it.

The block handle no longer disappears while you move the pointer toward it from a lower line of a tall block (a table, an image, code): like Notion, it stays while the pointer is in the block's band left of the content, and hides when the pointer leaves it.
