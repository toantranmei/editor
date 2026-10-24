---
"@toantranmei/editor": patch
---

Fix the "Type '/'…" placeholder staying on empty blocks the cursor had left (Tiptap's incremental placeholder was off by one); it now shows only on the cursor's block. Center the block handle (+ ⋮⋮) on each block's first text line, header bar, divider or top edge, and make it Notion-sized (24px buttons, 18px icons).
