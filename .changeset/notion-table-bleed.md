---
"@toantranmei/database-block": patch
---

Tables scroll like Notion's. A table that grows with its rows no longer shows a second, vertical scrollbar when it also scrolls sideways (its height includes the sideways scrollbar). The table's scroll area reaches out to the edges of the page's scroll area, so the sideways scrollbar spans the page and a full-page table's vertical scrollbar sits at the page edge, while the columns stay in line with the text; row lines start at the first column. The area is the nearest ancestor that scrolls or carries `data-me-bleed-root` (mark the main column of a page that scrolls the document); `bleed: false` in the block options turns it off.
