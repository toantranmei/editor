---
"@toantranmei/database-block": minor
---

Feed and dashboard views, drafts that persist:

- Feed view (`type: 'feed'`): rows as posts (author / created time, `config.card.props`, page content preview from the new optional `source.rowPreview(rowIds)`, `config.feed_preview`), pages of `config.load_limit` (default 10) with Load more, infinite scroll on a full page or with no limit.
- Dashboard view (`type: 'dashboard'`): `config.widgets`, chart and number widgets in a grid, each with its own filter on top of the view's; add, remove, reorder, half / full width, edit in a popover. `source.chart(viewId, query?)` takes an optional widget query (`ChartQuery`).
- Viewers' unsaved filter / sorts survive reloads: `options.draftStore` (default `localStorage`, per `options.userId`, database and view; `false` for session only), `localDraftStore` exported.
