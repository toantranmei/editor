<script setup lang="ts">
/** Person (`people()`) and relation (`searchRows()`) editor: search, toggle ids. */
import { Check, FileText, X } from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useDb } from '../context'

const props = defineProps<{ kind: 'person' | 'relation', value: string[], databaseId?: string, initialQuery?: string }>()
const emit = defineEmits<{ change: [ids: string[]] }>()

const db = useDb()
const m = computed(() => db.m.value)
const query = ref(props.initialQuery ?? '')
const results = shallowRef<Array<{ id: string, label: string, avatar?: string }>>([])
const active = ref(0)
const input = ref<HTMLInputElement | null>(null)
let seq = 0
let timer: ReturnType<typeof setTimeout> | undefined

async function run(q: string) {
  const mine = ++seq
  try {
    if (props.kind === 'person') {
      const list = await db.source.people(q)
      if (mine !== seq) return
      db.remember(list)
      results.value = list.map(p => ({ id: p.id, label: p.name, avatar: p.avatar }))
    }
    else {
      const list = await db.source.searchRows(props.databaseId || db.databaseId, q)
      if (mine !== seq) return
      db.remember([], list)
      results.value = list.map(r => ({ id: r.id, label: r.title || m.value.untitled }))
    }
    active.value = 0
  }
  catch (error) {
    db.report(error)
  }
}
watch(query, (q) => {
  clearTimeout(timer)
  timer = setTimeout(() => run(q), 120)
})
onMounted(() => {
  run(query.value)
  nextTick(() => input.value?.focus())
})
onBeforeUnmount(() => {
  clearTimeout(timer)
  seq++
})

const label = (id: string) => (props.kind === 'person' ? db.names.people.get(id) : db.names.rows.get(id)) ?? id
const toggle = (id: string) => emit('change', props.value.includes(id) ? props.value.filter(x => x !== id) : [...props.value, id])
function onKey(e: KeyboardEvent) {
  const n = results.value.length
  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && n) {
    e.preventDefault()
    active.value = (active.value + (e.key === 'ArrowDown' ? 1 : n - 1)) % n
  }
  else if (e.key === 'Enter') {
    e.preventDefault()
    const r = results.value[active.value]
    if (r) toggle(r.id)
  }
}
</script>

<template>
  <div class="me-db-picker" @keydown="onKey">
    <div class="me-db-picker-input">
      <span v-for="id in value" :key="id" class="me-db-tag">
        {{ label(id) }}
        <button type="button" class="me-db-tag-remove" :aria-label="m.remove" @click="toggle(id)"><X /></button>
      </span>
      <input
        ref="input"
        v-model="query"
        class="me-db-picker-search"
        :placeholder="kind === 'person' ? m.searchPeople : m.searchRows"
        :aria-label="kind === 'person' ? m.searchPeople : m.searchRows"
      >
    </div>
    <div class="me-menu me-db-picker-list" role="listbox" aria-multiselectable="true">
      <div
        v-for="(r, i) in results"
        :key="r.id"
        class="me-menu-item me-db-picker-item"
        :class="{ 'is-active': i === active }"
        role="option"
        :aria-selected="value.includes(r.id)"
        @mouseenter="active = i"
        @click="toggle(r.id)"
      >
        <img v-if="r.avatar" class="me-db-avatar" :src="r.avatar" alt="">
        <FileText v-else-if="kind === 'relation'" class="me-db-relation-icon" />
        <span class="me-menu-title">{{ r.label }}</span>
        <Check v-if="value.includes(r.id)" class="me-db-picker-check" />
      </div>
      <div v-if="!results.length" class="me-menu-empty">{{ m.noResults }}</div>
    </div>
  </div>
</template>
