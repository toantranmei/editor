---
"@toantranmei/editor": patch
---

Remote carets hold no text node (the name label is drawn with `content: attr(data-name)`): the local caret could land in a peer's caret at the same position and the keys typed there were lost.
