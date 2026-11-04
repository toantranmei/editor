<script setup lang="ts">
/**
 * Form view (Notion's form): a title and description, one question per visible writable property (the view's
 * property visibility and order), required questions (`config.form_required`), and Submit, which creates a row
 * with the answers. Editors see "Edit form" hints; anyone who can add rows can fill it in.
 */
import { CheckCircle2, Link2 } from '@lucide/vue'
import { computed, reactive, ref } from 'vue'
import { useDb } from '../context'
import type { Prop } from '../types'
import { isEmptyValue, isReadOnly, visibleProps } from '../util'
import { parseDateText, parseNumber } from '../values'

defineProps<{ full?: boolean }>()
const db = useDb()
const m = computed(() => db.m.value)
const c = computed(() => db.view.value?.config ?? {})
const questions = computed(() => visibleProps(db.view.value, db.props.value).filter(p => !isReadOnly(p.type) && p.type !== 'relation' && p.type !== 'files'))
const required = computed(() => new Set(c.value.form_required ?? []))
const answers = reactive<Record<string, unknown>>({})
const missing = ref<Set<string>>(new Set())
const sent = ref(false)
const editable = computed(() => db.canEditStructure.value)

// Share form: the host's public link (source.formLink); the switch mirrors `config.form_shared`.
const canShare = computed(() => editable.value && !!db.source.formLink && !!db.view.value)
const shared = computed(() => !!c.value.form_shared)
const shareUrl = ref('')
const copied = ref(false)
async function setShared(on: boolean) {
  const view = db.view.value
  if (!view || !db.source.formLink) return
  try {
    const link = await db.source.formLink(view.id, on)
    shareUrl.value = link.enabled ? link.url : ''
    db.updateView({ form_shared: link.enabled || undefined })
  }
  catch (error) {
    db.report(error)
  }
}
async function copyLink() {
  if (!shareUrl.value) await setShared(true)
  if (!shareUrl.value) return
  try {
    await navigator.clipboard.writeText(shareUrl.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  }
  catch {}
}

function toggleRequired(p: Prop) {
  const set = new Set(required.value)
  if (set.has(p.id)) set.delete(p.id)
  else set.add(p.id)
  db.updateView({ form_required: set.size ? [...set] : undefined })
}
function toggleMulti(p: Prop, id: string) {
  const list = Array.isArray(answers[p.id]) ? answers[p.id] as string[] : []
  answers[p.id] = list.includes(id) ? list.filter(x => x !== id) : [...list, id]
}
/** The typed answer as a contract value (numbers, dates, …). */
function valueOf(p: Prop): unknown {
  const v = answers[p.id]
  if (p.type === 'number') return typeof v === 'string' && v.trim() ? parseNumber(v, db.locale.value) : null
  if (p.type === 'date') return typeof v === 'string' && v ? (parseDateText(v, db.locale.value) ?? { start: v }) : null
  if (p.type === 'checkbox') return !!v
  return v
}
function submit() {
  if (!db.canEditContent.value) return
  const values: Record<string, unknown> = {}
  const miss = new Set<string>()
  for (const p of questions.value) {
    const v = valueOf(p)
    if (required.value.has(p.id) && (isEmptyValue(v) || v === false)) miss.add(p.id)
    if (!isEmptyValue(v)) values[p.id] = v
  }
  missing.value = miss
  if (miss.size) return
  db.createRow({ values })
  for (const k of Object.keys(answers)) delete answers[k]
  sent.value = true
}
</script>

<template>
  <form class="me-db-form" :class="{ 'is-full': full }" data-form @submit.prevent="submit">
    <div v-if="sent" class="me-db-form-sent" role="status">
      <CheckCircle2 />
      <p>{{ m.formSent }}</p>
      <button type="button" class="me-btn" data-form-again @click="sent = false">{{ m.formAgain }}</button>
    </div>
    <template v-else>
      <div v-if="canShare" class="me-db-form-share" data-form-share>
        <label class="me-db-toggle-row">
          <span><Link2 /> {{ m.shareForm }}</span>
          <input type="checkbox" class="me-db-switch" :checked="shared" data-form-shared @change="setShared(($event.target as HTMLInputElement).checked)">
        </label>
        <p class="me-db-hint">{{ m.shareFormHint }}</p>
        <div v-if="shared" class="me-db-row">
          <input v-if="shareUrl" class="me-input" readonly :value="shareUrl" :aria-label="m.shareForm" data-form-url>
          <button type="button" class="me-btn" data-form-copy @click="copyLink">{{ copied ? m.linkCopied : m.copyFormLink }}</button>
        </div>
      </div>
      <h3 class="me-db-form-title">{{ db.view.value?.name }}</h3>
      <textarea
        v-if="editable"
        class="me-input me-db-form-desc"
        :value="c.form_description ?? ''"
        :placeholder="m.formDescription"
        :aria-label="m.formDescription"
        data-form-desc
        @change="db.updateView({ form_description: ($event.target as HTMLTextAreaElement).value || undefined })"
      />
      <p v-else-if="c.form_description" class="me-db-form-desc-text">{{ c.form_description }}</p>
      <p v-if="!questions.length" class="me-db-hint">{{ m.formNoQuestions }}</p>
      <div v-for="p in questions" :key="p.id" class="me-db-form-q" :class="{ 'is-missing': missing.has(p.id) }" :data-question="p.id">
        <div class="me-db-form-q-head">
          <label class="me-db-form-q-title" :for="`q-${p.id}`">{{ p.name }}<span v-if="required.has(p.id)" class="me-db-error" aria-hidden="true"> *</span></label>
          <label v-if="editable" class="me-db-toggle-row me-db-form-required">
            <span>{{ m.required }}</span>
            <input type="checkbox" class="me-db-switch" :checked="required.has(p.id)" data-required @change="toggleRequired(p)">
          </label>
        </div>
        <div v-if="p.type === 'select' || p.type === 'status'" class="me-db-chips" role="radiogroup" :aria-label="p.name">
          <button v-for="o in p.config?.options ?? []" :key="o.id" type="button" class="me-db-tag me-db-chip" role="radio" :class="{ 'is-on': answers[p.id] === o.id }" :aria-checked="answers[p.id] === o.id" :data-color="o.color === 'default' ? undefined : o.color" @click="answers[p.id] = answers[p.id] === o.id ? undefined : o.id">{{ o.name }}</button>
        </div>
        <div v-else-if="p.type === 'multi_select'" class="me-db-chips" role="group" :aria-label="p.name">
          <button v-for="o in p.config?.options ?? []" :key="o.id" type="button" class="me-db-tag me-db-chip" :class="{ 'is-on': (answers[p.id] as string[] | undefined)?.includes(o.id) }" :aria-pressed="!!(answers[p.id] as string[] | undefined)?.includes(o.id)" :data-color="o.color === 'default' ? undefined : o.color" @click="toggleMulti(p, o.id)">{{ o.name }}</button>
        </div>
        <label v-else-if="p.type === 'checkbox'" class="me-db-toggle-row">
          <input :id="`q-${p.id}`" type="checkbox" :checked="!!answers[p.id]" @change="answers[p.id] = ($event.target as HTMLInputElement).checked">
          <span>{{ p.name }}</span>
        </label>
        <input v-else-if="p.type === 'date'" :id="`q-${p.id}`" type="date" class="me-input" :value="answers[p.id] ?? ''" @input="answers[p.id] = ($event.target as HTMLInputElement).value">
        <textarea v-else-if="p.type === 'text'" :id="`q-${p.id}`" class="me-input" :placeholder="m.formAnswer" :value="String(answers[p.id] ?? '')" @input="answers[p.id] = ($event.target as HTMLTextAreaElement).value" />
        <input
          v-else-if="p.type !== 'person'"
          :id="`q-${p.id}`"
          class="me-input"
          :type="p.type === 'email' ? 'email' : p.type === 'url' ? 'url' : p.type === 'phone' ? 'tel' : 'text'"
          :inputmode="p.type === 'number' ? 'decimal' : undefined"
          :placeholder="m.formAnswer"
          :value="String(answers[p.id] ?? '')"
          @input="answers[p.id] = ($event.target as HTMLInputElement).value"
        >
        <p v-else class="me-db-hint">{{ m.readOnly }}</p>
        <span v-if="missing.has(p.id)" class="me-db-error" role="alert">{{ m.formRequiredError }}</span>
      </div>
      <div class="me-db-actions">
        <button type="submit" class="me-btn me-btn--primary" data-form-submit :disabled="!db.canEditContent.value">{{ m.formSubmit }}</button>
      </div>
    </template>
  </form>
</template>
