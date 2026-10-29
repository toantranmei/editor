# @toantranmei/chart-block

Charts for [`@toantranmei/editor`](https://www.npmjs.com/package/@toantranmei/editor), drawn with
[ECharts](https://echarts.apache.org):

- **Chart block** (`/chart`): a chart from a small data table stored in the document
  (`{ data: { columns, rows }, config }`). Hover → **Edit data** opens an inline grid (edit cells and column names,
  add / delete rows and columns, paste cells from a spreadsheet or a whole CSV) and the settings (chart type, x
  column, values with sum / average / min / max / count, group-by column, stacked)
- **`<DatabaseChart :data :config>`**: the component the database chart view
  ([`@toantranmei/database-block`](https://www.npmjs.com/package/@toantranmei/database-block)) uses, for data
  already aggregated (`{ x, series }`)
- Bar, line, area, pie, donut and scatter; stacked bar / line / area
- ECharts is imported per module (`echarts/core` + the four chart types, grid / tooltip / legend, canvas renderer)
  and **loaded lazily**: pages without a chart never download it
- Line and area charts over 5000 points are downsampled with LTTB (largest-triangle-three-buckets)
- Colors and fonts come from the editor's design tokens (`component.chart.*`) and follow light / dark mode
- Vietnamese, English and Simplified Chinese UI, following the editor's locale

## Install

```bash
npm i @toantranmei/chart-block
```

`echarts` (6.1) is a dependency, installed with the package. Peers: `@toantranmei/editor` `^0.3.0`, `vue` `^3.5`,
Tiptap `3.32.0` (`@tiptap/core`, `@tiptap/pm`, `@tiptap/vue-3`) and `@lucide/vue`, all already installed with the
editor. The build keeps dependencies and peers external, so your bundler dedupes them and puts ECharts in its own
chunk.

## Chart block

```vue
<script setup lang="ts">
import { MeiEditor, defaultBlocks } from '@toantranmei/editor'
import { chartBlock } from '@toantranmei/chart-block'
import '@toantranmei/editor/style.css'
import '@toantranmei/chart-block/style.css'

const blocks = [...defaultBlocks, chartBlock]
</script>

<template>
  <MeiEditor v-model="doc" :blocks="blocks" />
</template>
```

Options (`chartBlock.configure({ … })`):

| Option | Default | Description |
| --- | --- | --- |
| `initial` | sample table, bar chart | `{ data, config }` of a newly inserted chart |
| `messages` | – | Override strings per locale: `{ en: { edit: 'Edit' } }` |

Node `chart`, attributes:

```ts
{
  data: { columns: string[], rows: (string | number)[][] },
  config: {
    chart: 'bar' | 'line' | 'area' | 'pie' | 'donut' | 'scatter',
    x: { prop: string, bucket?: 'day' | 'week' | 'month' | 'year' }, // column name; bucket groups dates
    y: Array<{ prop?: string, fn: 'count' | 'sum' | 'avg' | 'min' | 'max' }>,
    series?: string,  // column whose values split the data into series
    stacked?: boolean,
  },
}
```

Command: `editor.commands.insertChart({ data?, config? })`. HTML output is a plain `<table>` (with the JSON in
`data-chart-data` / `data-chart-config`, so it parses back).

## `<DatabaseChart>`

```vue
<DatabaseChart :data="{ x: ['Jan', 'Feb'], series: [{ name: 'Done', data: [3, 5] }] }" :config="viewConfig" />
```

| Prop | Type | Description |
| --- | --- | --- |
| `data` | `{ x: (string \| number)[], series: { name, data: number[] }[] }` | e.g. `source.chart(viewId)` |
| `config` | `ChartConfig` | the chart view config (only `chart` and `stacked` affect drawing) |
| `height` | CSS length | default: the `chart.height` token |
| `emptyText` | `string` | shown when there is no data (ECharts isn't loaded then) |
| `locale` | `'vi' \| 'en' \| 'zh'` | default empty / loading text |

Events: `ready(chart)` (the ECharts instance), `error(error)` (ECharts failed to load). It must render inside an
element with the editor's `.me-scope` class (any editor node view is) so the tokens resolve.

## Helpers

All pure and exported: `buildChartOption(data, config, theme)` (the ECharts option), `lttb(points, threshold)`,
`parseCsv(text)` (RFC 4180, or tab-separated spreadsheet paste; numbers become numbers),
`tableToChartData(table, config)`, `readChartTheme(el)`, `loadECharts()`.

## License

MIT
