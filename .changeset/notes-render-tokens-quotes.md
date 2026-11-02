---
'@toantranmei/editor': patch
---

Token overrides (`renderTokensStyle` in every form, and the runtime overrides) drop names and values with `{};<>`, comments, backslashes or an unclosed quote.
