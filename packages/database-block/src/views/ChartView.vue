<script setup lang="ts">
/** Chart view: `source.chart(viewId)` drawn by `<DbChart>` (chart-block's `<DatabaseChart>`, loaded only when shown). */
import { computed } from 'vue'
import DbChart from '../components/DbChart.vue'
import { useDb } from '../context'

defineProps<{ full?: boolean }>()
const db = useDb()
const view = computed(() => db.view.value)
// Re-query when anything in the config changes (the source reads the saved view).
const spec = computed(() => ({ ...view.value?.config }))
</script>

<template>
  <div class="me-db-chart" :class="{ 'is-full': full }">
    <DbChart v-if="view" :view-id="view.id" :spec="spec" :disabled="view.type !== 'chart'" />
  </div>
</template>
