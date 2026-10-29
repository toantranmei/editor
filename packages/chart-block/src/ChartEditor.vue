<script setup lang="ts">
/**
 * Inline editor of a chart block: a data grid (editable cells and column names, add / delete rows and columns,
 * paste CSV / spreadsheet cells) and the config panel (type, x, y values, series, stacked).
 * Emits whole new values; the node view writes them with `updateAttributes`.
 */
import { Plus, Trash2, X } from '@lucide/vue'
import { computed, ref } from 'vue'
import { parseCsv, parseDelimited, detectDelimiter, toCell } from './csv'
import { CHART_FNS, CHART_KINDS, clone } from './defaults'
import type { ChartMessages } from './messages'
import type { ChartConfig, ChartFn, ChartKind, ChartTable } from './types'

const props = defineProps<{ table: ChartTable, config: ChartConfig, messages: ChartMessages }>()
const emit = defineEmits<{ 'update:table': [table: ChartTable], 'update:config': [config: ChartConfig] }>()

const m = computed(() => props.messages)
const stackable = computed(() => ['bar', 'line', 'area'].includes(props.config.chart))

// ── Grid ──────────────────────────────────────────────────────────────────────
function setTable(mutate: (t: ChartTable) => void) {
  const t = clone(props.table)
  mutate(t)
  emit('update:table', t)
}
function setCell(row: number, col: number, value: string) {
  setTable((t) => {
    t.rows[row]![col] = toCell(value)
  })
}
function renameColumn(col: number, name: string) {
  const old = props.table.columns[col]
  const next = name.trim() || `${m.value.column} ${col + 1}`
  if (next === old) return
  setTable((t) => {
    t.columns[col] = next
  })
  // Keep the config pointing at the renamed column.
  const c = clone(props.config)
  if (c.x.prop === old) c.x.prop = next
  if (c.series === old) c.series = next
  for (const y of c.y) if (y.prop === old) y.prop = next
  emit('update:config', c)
}
const addRow = () => setTable(t => t.rows.push(t.columns.map(() => '')))
const deleteRow = (row: number) => setTable(t => t.rows.splice(row, 1))
function addColumn() {
  setTable((t) => {
    let n = t.columns.length + 1
    while (t.columns.includes(`${m.value.column} ${n}`)) n++
    t.columns.push(`${m.value.column} ${n}`)
    for (const r of t.rows) r.push('')
  })
}
function deleteColumn(col: number) {
  const name = props.table.columns[col]
  setTable((t) => {
    t.columns.splice(col, 1)
    for (const r of t.rows) r.splice(col, 1)
  })
  const c = clone(props.config)
  if (c.x.prop === name) c.x.prop = props.table.columns.find(n => n !== name) ?? ''
  if (c.series === name) delete c.series
  c.y = c.y.filter(y => y.prop !== name)
  emit('update:config', c)
}

/** Pasting several cells (tabs / newlines) into a cell fills the grid from there, growing it as needed. */
function onCellPaste(event: ClipboardEvent, row: number, col: number) {
  const text = event.clipboardData?.getData('text/plain') ?? ''
  if (!/[\t\n\r]/.test(text)) return
  event.preventDefault()
  const cells = parseDelimited(text, detectDelimiter(text))
  setTable((t) => {
    cells.forEach((line, i) => {
      const r = row + i
      while (t.rows.length <= r) t.rows.push(t.columns.map(() => ''))
      line.forEach((value, j) => {
        const c = col + j
        while (t.columns.length <= c) {
          t.columns.push(`${m.value.column} ${t.columns.length + 1}`)
          for (const other of t.rows) other.push('')
        }
        t.rows[r]![c] = toCell(value)
      })
    })
  })
}

const pasting = ref(false)
const csv = ref('')
function applyCsv() {
  const table = parseCsv(csv.value)
  if (!table.columns.length) return
  emit('update:table', table)
  // Point the config at the new columns: first column on x, numeric columns as values.
  const numeric = table.columns.filter((_, i) => table.rows.some(r => typeof r[i] === 'number'))
  const c = clone(props.config)
  c.x = { prop: table.columns[0]! }
  c.y = numeric.filter(n => n !== table.columns[0]).map(prop => ({ prop, fn: 'sum' as ChartFn }))
  if (!c.y.length) c.y = [{ fn: 'count' }]
  delete c.series
  emit('update:config', c)
  csv.value = ''
  pasting.value = false
}

// ── Config ────────────────────────────────────────────────────────────────────
function setConfig(mutate: (c: ChartConfig) => void) {
  const c = clone(props.config)
  mutate(c)
  emit('update:config', c)
}
const valueEvent = (e: Event) => (e.target as HTMLInputElement | HTMLSelectElement).value
const setKind = (kind: string) => setConfig(c => (c.chart = kind as ChartKind))
const setX = (prop: string) => setConfig(c => (c.x = { ...c.x, prop }))
const setSeries = (prop: string) => setConfig((c) => {
  if (prop) c.series = prop
  else delete c.series
})
function setFn(i: number, fn: string) {
  setConfig((c) => {
    const y = c.y[i]!
    y.fn = fn as ChartFn
    if (fn === 'count') delete y.prop
    else y.prop ??= props.table.columns.find(n => n !== c.x.prop) ?? props.table.columns[0]
  })
}
const setYProp = (i: number, prop: string) => setConfig(c => (c.y[i]!.prop = prop))
const addValue = () => setConfig(c => c.y.push({ prop: props.table.columns.find(n => n !== c.x.prop) ?? props.table.columns[0], fn: 'sum' }))
const removeValue = (i: number) => setConfig(c => c.y.splice(i, 1))
const label = (row: number, col: number) => m.value.cell.replace('{row}', String(row + 1)).replace('{column}', props.table.columns[col] ?? String(col + 1))
</script>

<template>
  <div class="me-chart-editor">
    <section class="me-chart-panel" :aria-label="m.settings">
      <label class="me-chart-field">
        <span class="me-chart-label">{{ m.chartType }}</span>
        <select class="me-input me-chart-select" :value="config.chart" @change="setKind(valueEvent($event))">
          <option v-for="kind in CHART_KINDS" :key="kind" :value="kind">{{ m.types[kind] }}</option>
        </select>
      </label>
      <label class="me-chart-field">
        <span class="me-chart-label">{{ m.xAxis }}</span>
        <select class="me-input me-chart-select" :value="config.x.prop" @change="setX(valueEvent($event))">
          <option v-for="col in table.columns" :key="col" :value="col">{{ col }}</option>
        </select>
      </label>
      <div class="me-chart-field">
        <span class="me-chart-label">{{ m.yAxis }}</span>
        <div v-for="(y, i) in config.y" :key="i" class="me-chart-value">
          <select class="me-input me-chart-select" :value="y.fn" :aria-label="m.yAxis" @change="setFn(i, valueEvent($event))">
            <option v-for="fn in CHART_FNS" :key="fn" :value="fn">{{ m.fn[fn] }}</option>
          </select>
          <select v-if="y.fn !== 'count'" class="me-input me-chart-select" :value="y.prop" :aria-label="m.column" @change="setYProp(i, valueEvent($event))">
            <option v-for="col in table.columns" :key="col" :value="col">{{ col }}</option>
          </select>
          <button type="button" class="me-tool-btn" :title="m.removeValue" :aria-label="m.removeValue" @click="removeValue(i)">
            <X />
          </button>
        </div>
        <button type="button" class="me-btn me-chart-add" @click="addValue">
          <Plus /> {{ m.addValue }}
        </button>
      </div>
      <label class="me-chart-field">
        <span class="me-chart-label">{{ m.series }}</span>
        <select class="me-input me-chart-select" :value="config.series ?? ''" @change="setSeries(valueEvent($event))">
          <option value="">{{ m.none }}</option>
          <option v-for="col in table.columns" :key="col" :value="col">{{ col }}</option>
        </select>
      </label>
      <label v-if="stackable" class="me-chart-check">
        <input type="checkbox" :checked="!!config.stacked" @change="setConfig(c => (c.stacked = ($event.target as HTMLInputElement).checked))">
        {{ m.stacked }}
      </label>
    </section>

    <section class="me-chart-data" :aria-label="m.data">
      <div class="me-chart-grid-wrap">
        <table class="me-chart-grid">
          <thead>
            <tr>
              <th v-for="(col, c) in table.columns" :key="c" class="me-chart-grid-head">
                <div class="me-chart-grid-head-inner">
                  <input class="me-chart-cell me-chart-cell--head" :value="col" :aria-label="m.column" @change="renameColumn(c, valueEvent($event))">
                  <button type="button" class="me-tool-btn me-chart-grid-delete" :title="m.deleteColumn" :aria-label="m.deleteColumn" @click="deleteColumn(c)">
                    <X />
                  </button>
                </div>
              </th>
              <th class="me-chart-grid-actions">
                <button type="button" class="me-tool-btn" :title="m.addColumn" :aria-label="m.addColumn" @click="addColumn">
                  <Plus />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, r) in table.rows" :key="r">
              <td v-for="(_, c) in table.columns" :key="c">
                <input
                  class="me-chart-cell"
                  :class="{ 'is-number': typeof row[c] === 'number' }"
                  :value="row[c] ?? ''"
                  :aria-label="label(r, c)"
                  @change="setCell(r, c, valueEvent($event))"
                  @paste="onCellPaste($event, r, c)"
                >
              </td>
              <td class="me-chart-grid-actions">
                <button type="button" class="me-tool-btn me-chart-grid-delete" :title="m.deleteRow" :aria-label="m.deleteRow" @click="deleteRow(r)">
                  <Trash2 />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="me-chart-data-actions">
        <button type="button" class="me-btn" @click="addRow">
          <Plus /> {{ m.addRow }}
        </button>
        <button type="button" class="me-btn" :aria-expanded="pasting" @click="pasting = !pasting">
          {{ m.pasteCsv }}
        </button>
      </div>
      <div v-if="pasting" class="me-chart-paste">
        <textarea v-model="csv" class="me-input me-chart-textarea" :placeholder="m.pastePlaceholder" :aria-label="m.pasteCsv" />
        <div class="me-chart-data-actions">
          <button type="button" class="me-btn me-btn--primary" :disabled="!csv.trim()" @click="applyCsv">
            {{ m.apply }}
          </button>
          <button type="button" class="me-btn" @click="pasting = false">
            {{ m.cancel }}
          </button>
        </div>
      </div>
    </section>
  </div>
</template>
