<script setup lang="ts">
/** Chart block: the chart, plus (when editable) an inline data grid and config panel. */
import { Pencil } from '@lucide/vue'
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { useEditable } from '@toantranmei/editor'
import { computed, ref } from 'vue'
import ChartEditor from './ChartEditor.vue'
import DatabaseChart from './DatabaseChart.vue'
import { tableToChartData } from './data'
import { normalizeConfig, normalizeTable } from './defaults'
import { chartMessages } from './messages'
import type { ChartBlockOptions, ChartConfig, ChartTable } from './types'

const props = defineProps(nodeViewProps)

const options = computed(() => props.extension.options as ChartBlockOptions)
const locale = computed(() => props.editor.storage.meiConfig?.locale as 'vi' | 'en' | 'zh' | undefined)
const m = computed(() => chartMessages(locale.value, options.value.messages))
const editable = useEditable(props.editor)
const table = computed(() => normalizeTable(props.node.attrs.data))
const config = computed(() => normalizeConfig(props.node.attrs.config))
const data = computed(() => tableToChartData(table.value, config.value))
const editing = ref(false)

const setTable = (data: ChartTable) => props.updateAttributes({ data })
const setConfig = (config: ChartConfig) => props.updateAttributes({ config })
</script>

<template>
  <NodeViewWrapper class="me-chart-block" :class="{ 'is-selected': selected, 'is-editing': editing && editable }" data-type="chart">
    <div class="me-chart-frame" contenteditable="false">
      <div v-if="editable" class="me-chart-bar">
        <button type="button" class="me-btn me-chart-toggle" :aria-pressed="editing" @click="editing = !editing">
          <Pencil v-if="!editing" class="me-chart-toggle-icon" aria-hidden="true" />
          {{ editing ? m.done : m.edit }}
        </button>
      </div>
      <DatabaseChart :data="data" :config="config" :locale="locale" />
      <ChartEditor
        v-if="editing && editable"
        :table="table"
        :config="config"
        :messages="m"
        @update:table="setTable"
        @update:config="setConfig"
      />
    </div>
  </NodeViewWrapper>
</template>
