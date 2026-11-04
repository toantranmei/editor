<script setup lang="ts">
/** A button property's cell: runs its actions on the row (one undo step), asking first at "Show confirmation". */
import { computed, ref, shallowRef } from 'vue'
import { useDb } from '../context'
import type { Prop, Row } from '../types'
import DbPopover from './DbPopover.vue'

const props = defineProps<{ prop: Prop, row: Row | null }>()
const db = useDb()
const m = computed(() => db.m.value)
const el = ref<HTMLButtonElement | null>(null)
const label = computed(() => props.prop.config?.label?.trim() || props.prop.name)
const running = ref(false)
const disabled = computed(() => !db.canEditContent.value || !props.prop.config?.actions?.length || running.value)
const asking = shallowRef<{ message: string, answer: (ok: boolean) => void } | null>(null)

function confirm(message: string) {
  return new Promise<boolean>((resolve) => {
    asking.value = { message: message || m.value.confirmDefault, answer: (ok) => {
      asking.value = null
      resolve(ok)
    } }
  })
}
async function run() {
  if (disabled.value) return
  running.value = true
  try {
    await db.runButton(props.prop, props.row, { confirm })
  }
  finally {
    running.value = false
  }
}
</script>

<template>
  <button
    ref="el"
    type="button"
    class="me-db-button-cell"
    :disabled="disabled"
    :data-button="prop.id"
    @mousedown.stop
    @dblclick.stop
    @click.stop="run"
  >
    {{ label }}
  </button>
  <DbPopover v-if="asking" :anchor="el" :scope="db.scope.value" :label="label" @close="asking.answer(false)">
    <div class="me-db-confirm" role="alertdialog" data-button-confirm>
      <p>{{ asking.message }}</p>
      <div class="me-db-actions">
        <button type="button" class="me-btn" data-cancel @click="asking.answer(false)">{{ m.cancel }}</button>
        <button type="button" class="me-btn me-btn--primary" data-confirm @click="asking.answer(true)">{{ m.confirm }}</button>
      </div>
    </div>
  </DbPopover>
</template>
