---
'@toantranmei/editor': patch
---

Token overrides (`renderTokensStyle` in every form, and the runtime overrides) drop names and values with `{};<>`, comments, backslashes or an unclosed quote.

A dropped token logs a `console.warn` in development.

**Breaking:** values containing `;` are now dropped, including `data:` URIs such as `url(data:image/png;base64,…)`; use a regular URL instead.
