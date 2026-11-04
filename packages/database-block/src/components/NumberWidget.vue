<script setup lang="ts">
/** A dashboard number card: `source.aggregate(viewId, prop, fn, { filter })` over the widget's rows, formatted like the property. */
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import { formatAggregate } from '../aggregates'
import { useDb } from '../context'
import type { DashboardWidget, FilterGroup } from '../types'

const props = defineProps<{ viewId: string, widget: DashboardWidget, filter: FilterGroup | null }>()
const db = useDb()
const m = computed(() => db.m.value)
const fn = computed(() => props.widget.fn ?? 'count')
/** `count` counts rows: any property works, the title is always there. */
const prop = computed(() => db.props.value.find(p => p.id === props.widget.prop) ?? (fn.value === 'count' ? db.props.value.find(p => p.type === 'title') : undefined))
const value = shallowRef<number | string | null>(null)
const loading = shallowRef(true)
let seq = 0
async function load() {
  const mine = ++seq
  const p = prop.value
  if (!p) {
    value.value = null
    loading.value = false
    return
  }
  try {
    const search = db.search.value.trim()
    const res = await db.source.aggregate(props.viewId, p.id, fn.value, { filter: props.filter, ...(search ? { search } : {}) })
    if (mine === seq) value.value = res
  }
  catch (error) {
    db.report(error)
  }
  finally {
    if (mine === seq) loading.value = false
  }
}
watch([() => props.viewId, () => JSON.stringify([prop.value?.id, fn.value, props.filter]), () => db.search.value, () => db.source.version.value], load, { immediate: true })
onBeforeUnmount(() => seq++)
const text = computed(() => (prop.value ? formatAggregate(prop.value, fn.value, value.value, db.locale.value) : '–'))
const caption = computed(() => {
  const label = m.value.aggregates[fn.value] ?? fn.value
  return fn.value === 'count' || !prop.value ? label : `${label} · ${prop.value.name}`
})
</script>

<template>
  <div class="me-db-number" data-widget-number>
    <span v-if="loading" class="me-db-skeleton" />
    <span v-else class="me-db-number-value" data-value>{{ text }}</span>
    <span class="me-db-number-caption">{{ caption }}</span>
  </div>
</template>
