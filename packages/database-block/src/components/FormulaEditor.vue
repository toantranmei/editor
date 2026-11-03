<script setup lang="ts">
/**
 * Formula editor (Notion's "Edit formula"): the expression, its check (valid / error with position / result type,
 * from `validateFormula`), and a catalog to insert from — the properties (`prop("Name")`) and the functions the
 * notes-core formula language supports, each with its signature and an example. Filter by typing in the search.
 */
import { computed, ref } from 'vue'
import { useDb } from '../context'
import type { FormulaCheck } from '../types'
import PropIcon from './PropIcon.vue'

const props = defineProps<{ modelValue?: string, check: FormulaCheck | null, checking: boolean, selfId?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const db = useDb()
const m = computed(() => db.m.value)
const area = ref<HTMLTextAreaElement | null>(null)
const query = ref('')
const hover = ref<{ sig: string, example: string } | null>(null)

/** The formula language of notes-core (crates/notes-core/src/formula): what this catalog may offer. */
const FUNCTIONS: Record<string, Array<{ name: string, sig: string, example: string }>> = {
  general: [
    { name: 'if', sig: 'if(condition, then, else)', example: 'if(prop("Done"), "✅", "⏳")' },
    { name: 'ifs', sig: 'ifs(cond1, value1, cond2, value2, …, else)', example: 'ifs(prop("Score") > 8, "A", prop("Score") > 5, "B", "C")' },
    { name: 'empty', sig: 'empty(value)', example: 'empty(prop("Due"))' },
    { name: 'length', sig: 'length(text)', example: 'length(prop("Name"))' },
    { name: 'format', sig: 'format(value)', example: 'format(prop("Estimate")) + " pts"' },
    { name: 'toNumber', sig: 'toNumber(text)', example: 'toNumber("42")' },
  ],
  text: [
    { name: 'concat', sig: 'concat(text, …)', example: 'concat(prop("Name"), " – ", prop("Owner"))' },
    { name: 'contains', sig: 'contains(text, search)', example: 'contains(prop("Name"), "bug")' },
    { name: 'replace', sig: 'replace(text, search, with)', example: 'replace(prop("Name"), "-", " ")' },
    { name: 'replaceAll', sig: 'replaceAll(text, search, with)', example: 'replaceAll(prop("Name"), " ", "_")' },
    { name: 'slice', sig: 'slice(text, start, end)', example: 'slice(prop("Name"), 0, 3)' },
    { name: 'upper', sig: 'upper(text)', example: 'upper(prop("Code"))' },
    { name: 'lower', sig: 'lower(text)', example: 'lower(prop("Email"))' },
    { name: 'trim', sig: 'trim(text)', example: 'trim(prop("Name"))' },
  ],
  number: [
    { name: 'round', sig: 'round(number, digits?)', example: 'round(prop("Cost") / 3, 2)' },
    { name: 'floor', sig: 'floor(number)', example: 'floor(prop("Hours"))' },
    { name: 'ceil', sig: 'ceil(number)', example: 'ceil(prop("Hours"))' },
    { name: 'abs', sig: 'abs(number)', example: 'abs(prop("Delta"))' },
    { name: 'sqrt', sig: 'sqrt(number)', example: 'sqrt(16)' },
    { name: 'min', sig: 'min(a, b, …)', example: 'min(prop("A"), prop("B"))' },
    { name: 'max', sig: 'max(a, b, …)', example: 'max(prop("A"), 0)' },
    { name: 'sum', sig: 'sum(a, b, …)', example: 'sum(prop("A"), prop("B"))' },
  ],
  date: [
    { name: 'now', sig: 'now()', example: 'now()' },
    { name: 'today', sig: 'today()', example: 'dateBetween(prop("Due"), today(), "days")' },
    { name: 'dateAdd', sig: 'dateAdd(date, amount, "days" | "weeks" | "months" | "years" | "hours" | "minutes")', example: 'dateAdd(prop("Start"), 7, "days")' },
    { name: 'dateBetween', sig: 'dateBetween(a, b, unit)', example: 'dateBetween(prop("End"), prop("Start"), "days")' },
    { name: 'formatDate', sig: 'formatDate(date, pattern)', example: 'formatDate(prop("Due"), "DD/MM/YYYY")' },
    { name: 'year', sig: 'year(date)', example: 'year(prop("Due"))' },
    { name: 'month', sig: 'month(date)', example: 'month(prop("Due"))' },
    { name: 'day', sig: 'day(date)', example: 'day(prop("Due"))' },
  ],
  logic: [
    { name: 'and', sig: 'a and b', example: 'prop("Done") and prop("Paid")' },
    { name: 'or', sig: 'a or b', example: 'prop("Urgent") or prop("Blocked")' },
    { name: 'not', sig: 'not a', example: 'not prop("Done")' },
    { name: 'true', sig: 'true', example: 'true' },
    { name: 'false', sig: 'false', example: 'false' },
  ],
}
const q = computed(() => query.value.trim().toLowerCase())
const propItems = computed(() => db.props.value.filter(p => p.id !== props.selfId && (!q.value || p.name.toLowerCase().includes(q.value))))
const fnGroups = computed(() => Object.entries(FUNCTIONS)
  .map(([group, list]) => ({ group, list: list.filter(f => !q.value || f.name.toLowerCase().includes(q.value)) }))
  .filter(g => g.list.length))

/** Inserts at the cursor (a function: its name and parentheses, the cursor inside). */
function insert(text: string, back = 0) {
  const el = area.value
  const v = props.modelValue ?? ''
  const start = el?.selectionStart ?? v.length
  const end = el?.selectionEnd ?? v.length
  emit('update:modelValue', v.slice(0, start) + text + v.slice(end))
  requestAnimationFrame?.(() => {
    el?.focus()
    const at = start + text.length - back
    el?.setSelectionRange(at, at)
  })
}
const insertFn = (name: string) => (['and', 'or', 'not', 'true', 'false'].includes(name) ? insert(` ${name} `) : insert(`${name}()`, 1))
const typeLabel = computed(() => (props.check?.ok && props.check.type ? m.value.formulaTypes[props.check.type] ?? props.check.type : null))
</script>

<template>
  <div class="me-db-formula-editor" data-formula-editor>
    <textarea
      ref="area"
      :value="modelValue"
      class="me-input me-db-formula"
      spellcheck="false"
      :placeholder="m.formulaPlaceholder"
      :aria-label="m.formula"
      :aria-invalid="check?.ok === false || undefined"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />
    <div class="me-db-formula-status">
      <span v-if="checking" class="me-db-hint">{{ m.formulaChecking }}</span>
      <span v-else-if="check && !check.ok" class="me-db-error" role="alert">{{ check.error }}<template v-if="check.position !== undefined"> (@{{ check.position }})</template></span>
      <span v-else-if="check?.ok" class="me-db-hint is-ok">{{ m.formulaOk }}</span>
      <span v-if="typeLabel" class="me-db-menu-value" data-formula-type>{{ m.formulaType }}: {{ typeLabel }}</span>
    </div>
    <div class="me-db-formula-catalog">
      <div class="me-db-formula-list">
        <input v-model="query" class="me-input" :placeholder="m.searchFormula" :aria-label="m.searchFormula" data-formula-search>
        <div class="me-menu-label">{{ m.properties }}</div>
        <button v-for="p in propItems" :key="p.id" type="button" class="me-menu-item" :data-insert-prop="p.id" @click="insert(`prop(&quot;${p.name}&quot;)`)" @mouseenter="hover = { sig: `prop(&quot;${p.name}&quot;)`, example: '' }">
          <PropIcon :type="p.type" /><span class="me-menu-title">{{ p.name }}</span>
        </button>
        <template v-for="g in fnGroups" :key="g.group">
          <div class="me-menu-label">{{ m.formulaGroups[g.group] ?? g.group }}</div>
          <button v-for="f in g.list" :key="f.name" type="button" class="me-menu-item" :data-insert-fn="f.name" @click="insertFn(f.name)" @mouseenter="hover = f">
            <span class="me-menu-title me-db-mono">{{ f.name }}</span>
          </button>
        </template>
      </div>
      <div class="me-db-formula-doc" aria-live="polite">
        <template v-if="hover">
          <code class="me-db-mono">{{ hover.sig }}</code>
          <template v-if="hover.example">
            <span class="me-menu-label">{{ m.example }}</span>
            <code class="me-db-mono">{{ hover.example }}</code>
          </template>
        </template>
        <span v-else class="me-db-hint">{{ m.formulaHelp }}</span>
      </div>
    </div>
  </div>
</template>
