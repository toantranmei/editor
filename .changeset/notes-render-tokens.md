---
"@toantranmei/editor": minor
---

`renderTokensStyle({ light, dark })`: server-rendered pages can follow the OS colour scheme — the default dark tokens
and `dark` overrides apply under `@media (prefers-color-scheme: dark)` (forced `.me-light` opts out). Each part takes
a token tree or a flat map (`'color.text'` / `'--me-color-text'`). `renderTokensStyle(overrides)` is unchanged.
New type `RenderTokensOptions`. README documents which heavy blocks load on first use.
