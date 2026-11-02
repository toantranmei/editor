---
'@toantranmei/editor': patch
---

`renderTokensStyle` drops token names and values with an unbalanced quote (it could swallow the closing brace).
