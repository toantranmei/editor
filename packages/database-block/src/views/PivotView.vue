<script setup lang="ts">
/** Pivot view: the grid from `source.pivot(viewId)`, with row / column / grand totals. */
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import { formatAggregate } from '../aggregates'
import { useDb } from '../context'
import type { PivotResult, Prop } from '../types'

defineProps<{ full?: boolean }>()
const db = useDb()
const m = computed(() => db.m.value)
const data = shallowRef<PivotResult | null>(null)
const c = computed(() => db.view.value?.config ?? {})
const value = computed(() => c.value.values?.[0] ?? { fn: 'count' })
const valueProp = computed<Prop>(() => db.props.value.find(p => p.id === value.value.prop) ?? { id: '', name: '', type: 'number', position: '' })
const rowProps = computed(() => (c.value.rows ?? []).map(id => db.props.value.find(p => p.id === id)?.name ?? ''))
const colLabel = (key: string[]) => key.filter(Boolean).join(' · ') || '–'
const cell = (v: number | null | undefined) => (v === null || v === undefined ? '' : formatAggregate(valueProp.value, value.value.fn, v, db.locale.value))
let seq = 0
async function load() {
  const view = db.view.value
  if (!view) return
  const mine = ++seq
  try {
    const res = await db.source.pivot(view.id)
    if (mine === seq) data.value = res
  }
  catch (error) {
    db.report(error)
  }
}
watch([() => db.view.value?.id, () => JSON.stringify(c.value), () => db.source.version.value], load, { immediate: true })
onBeforeUnmount(() => seq++)
</script>

<template>
  <div class="me-db-scroll me-db-pivot" :class="{ 'is-full': full }">
    <div v-if="!data" class="me-db-empty">{{ m.loading }}</div>
    <div v-else-if="!data.rows.length" class="me-db-empty">{{ m.noData }}</div>
    <table v-else class="me-db-pivot-table">
      <thead>
        <tr>
          <th v-for="(name, i) in (rowProps.length ? rowProps : [''])" :key="`h${i}`" class="me-db-pivot-head is-corner" scope="col">{{ name }}</th>
          <th v-for="(col, j) in data.cols" :key="`c${j}`" class="me-db-pivot-head" scope="col">{{ colLabel(col) }}</th>
          <th v-if="data.totals?.rows" class="me-db-pivot-head is-total" scope="col">{{ m.total }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, i) in data.rows" :key="`r${i}`">
          <th v-for="(part, k) in (row.length ? row : [''])" :key="`rk${k}`" class="me-db-pivot-head" scope="row">{{ part || '–' }}</th>
          <td v-for="(v, j) in data.cells[i]" :key="`v${j}`" class="me-db-pivot-cell">{{ cell(v) }}</td>
          <td v-if="data.totals?.rows" class="me-db-pivot-cell is-total">{{ cell(data.totals.rows[i]) }}</td>
        </tr>
      </tbody>
      <tfoot v-if="data.totals?.cols">
        <tr>
          <th class="me-db-pivot-head is-total" scope="row" :colspan="Math.max(1, rowProps.length)">{{ m.total }}</th>
          <td v-for="(v, j) in data.totals.cols" :key="`t${j}`" class="me-db-pivot-cell is-total">{{ cell(v) }}</td>
          <td v-if="data.totals.rows" class="me-db-pivot-cell is-total is-grand">{{ cell(data.totals.grand) }}</td>
        </tr>
      </tfoot>
    </table>
  </div>
</template>
