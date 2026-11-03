---
"@toantranmei/editor": minor
---

`renderTokensStyle({ light, dark })`: server-rendered pages can follow the OS colour scheme — the default dark tokens
and `dark` overrides apply under `@media (prefers-color-scheme: dark)` (forced `.me-light` opts out). Each part takes
a token tree or a flat map (`'color.text'` / `'--me-color-text'`). The new form is chosen only when the object has a
`light` key (use `{ light: {} }` for the defaults only); `renderTokensStyle(overrides)`, including dark-only
`renderTokensStyle({ dark: {…} })`, is unchanged (class-based dark, no OS media rule). New type
`RenderTokensOptions`. README documents which heavy blocks load on first use.
