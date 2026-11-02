---
'@toantranmei/editor': patch
---

Token overrides (`renderTokensStyle` in every form, and the runtime overrides) drop names and values with `{};<>`, comments, backslashes or an unclosed quote.

A dropped token logs a `console.warn` in development. Values containing `;` (e.g. `data:` URIs such as `url(data:image/png;base64,…)`) are dropped too; use a regular URL.
