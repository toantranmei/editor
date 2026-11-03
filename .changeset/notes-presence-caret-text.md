---
"@toantranmei/editor": patch
---

Remote carets hold no text node: the word joiners around the caret are removed and the name label is drawn with `content: attr(data-name)` (`.me-peer-label[data-name]`, its `textContent` is now empty). The local caret could land in a peer's caret at the same position and the keys typed there were lost.
