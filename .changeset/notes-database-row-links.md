---
"@toantranmei/database-block": minor
---

Static render: row titles can link to the row's page. `databaseRenderers({ rowHref })` /
`databaseBlockRenderWith({ rowHref })` with `rowHref(databaseId, rowId) => string | null` render the title cell as
`<a class="me-db-row-link" href>`; `renderStaticDatabase` takes an optional `rowHref(rowId)`.
