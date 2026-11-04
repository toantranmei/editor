<script setup lang="ts">
/**
 * Feed view (Notion's Feed): rows as a vertical stream of posts — author and created time (when the database has
 * those properties), the title, the view's shown properties (`config.card.props`) and a preview of the page content
 * (`source.rowPreview`, `config.feed_preview`). Pages of `config.load_limit` posts (default 10): "Load more" inline,
 * infinite scroll on a full page or with no limit. Click opens the row.
 */
import { FileText, Plus } from '@lucide/vue'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import CellValue from '../components/CellValue.vue'
import { useDb } from '../context'
import type { Row, RowPreview } from '../types'
import { cellValue, isEmptyValue } from '../util'

const props = defineProps<{ full?: boolean }>()
const db = useDb()
const m = computed(() => db.m.value)
const c = computed(() => db.view.value?.config ?? {})
const title = computed(() => db.props.value.find(p => p.type === 'title'))
const author = computed(() => db.props.value.find(p => p.type === 'created_by'))
const created = computed(() => db.props.value.find(p => p.type === 'created_time'))
const shown = computed(() => (c.value.card?.props ?? [])
  .map(id => db.props.value.find(p => p.id === id))
  .filter(p => !!p && p.id !== author.value?.id && p.id !== created.value?.id && p.type !== 'title'))
const withPreview = computed(() => c.value.feed_preview !== false && !!db.source.rowPreview)

/** Posts per page; `load_limit: 0` (no limit) reads 50 at a time and keeps scrolling. */
const limit = computed(() => c.value.load_limit ?? 10)
const pageSize = computed(() => limit.value || 50)
const infinite = computed(() => props.full || limit.value === 0)

const rows = shallowRef<Row[]>([])
const total = ref(0)
const loading = ref(true)
const previews = shallowRef<Record<string, RowPreview>>({})
let busy = false
let seq = 0

const key = computed(() => {
  const v = db.view.value
  return v ? JSON.stringify([v.id, v.config.filter, v.config.sorts, db.query.value]) : ''
})

async function loadPreviews(ids: string[], mine: number) {
  if (!withPreview.value || !ids.length) return
  try {
    const res = await db.source.rowPreview!(ids)
    if (mine === seq) previews.value = { ...previews.value, ...res }
  }
  catch (error) {
    db.report(error)
  }
}

async function loadMore() {
  const v = db.view.value
  if (!v || busy) return
  busy = true
  const mine = seq
  try {
    const page = await db.source.rows(v.id, { offset: rows.value.length, limit: pageSize.value }, db.query.value)
    if (mine !== seq) return
    rows.value = [...rows.value, ...page.rows]
    total.value = page.total
    void loadPreviews(page.rows.map(r => r.id), mine)
  }
  catch (error) {
    db.report(error)
  }
  finally {
    busy = false
    if (mine === seq) loading.value = false
    // Still at the end after this page (short posts): let the observer fire again.
    if (io && sentinel.value) {
      io.unobserve(sentinel.value)
      io.observe(sentinel.value)
    }
  }
}

watch(key, () => {
  seq++
  busy = false
  rows.value = []
  previews.value = {}
  total.value = 0
  loading.value = true
  void loadMore()
}, { immediate: true })

// Data changed: read the posts shown so far again (and their previews).
watch(() => db.source.version.value, async () => {
  const v = db.view.value
  if (!v) return
  const mine = ++seq
  busy = false
  try {
    const page = await db.source.rows(v.id, { offset: 0, limit: Math.max(rows.value.length, pageSize.value) }, db.query.value)
    if (mine !== seq) return
    rows.value = page.rows
    total.value = page.total
    void loadPreviews(page.rows.map(r => r.id), mine)
  }
  catch (error) {
    db.report(error)
  }
})
watch(withPreview, on => on && void loadPreviews(rows.value.map(r => r.id), seq))

const more = computed(() => rows.value.length < total.value)
const remaining = computed(() => total.value - rows.value.length)

// Infinite scroll: a sentinel after the last post loads the next page when it comes into view.
const sentinel = ref<HTMLElement | null>(null)
let io: IntersectionObserver | null = null
watch([sentinel, infinite], ([el, on]) => {
  io?.disconnect()
  io = null
  if (!el || !on || typeof IntersectionObserver === 'undefined') return
  io = new IntersectionObserver((entries) => {
    if (entries.some(e => e.isIntersecting) && more.value) void loadMore()
  }, { rootMargin: '200px' })
  io.observe(el)
}, { immediate: true })
onBeforeUnmount(() => {
  seq++
  io?.disconnect()
})

const titleOf = (row: Row) => (title.value ? String(cellValue(row, title.value) ?? '') || m.value.untitled : m.value.untitled)
function newPost(e: MouseEvent) {
  const id = db.createRow({})
  db.openRow(id, e)
}
</script>

<template>
  <div class="me-db-feed" :class="{ 'is-full': full }" role="feed" :aria-busy="loading">
    <button v-if="db.canEditContent.value" type="button" class="me-db-new-row is-static me-db-feed-new" data-new-post @click="newPost($event)"><Plus />{{ m.feedNewPost }}</button>
    <div v-if="loading && !rows.length" class="me-db-empty is-loading">{{ m.loading }}</div>
    <div v-else-if="!rows.length" class="me-db-empty">{{ m.feedEmpty }}</div>
    <article
      v-for="(row, i) in rows"
      :key="row.id"
      class="me-db-post"
      :data-row-id="row.id"
      :data-cc="db.colors(row).row"
      :aria-posinset="i + 1"
      :aria-setsize="total"
      @click="db.openRow(row.id, $event)"
    >
      <div v-if="(author && !isEmptyValue(cellValue(row, author))) || (created && !isEmptyValue(cellValue(row, created)))" class="me-db-post-meta">
        <CellValue v-if="author && !isEmptyValue(cellValue(row, author))" :prop="author" :value="cellValue(row, author)" compact />
        <CellValue v-if="created && !isEmptyValue(cellValue(row, created))" :prop="created" :value="cellValue(row, created)" compact class="me-db-post-time" />
      </div>
      <button type="button" class="me-db-post-title" @click.stop="db.openRow(row.id, $event)">
        <FileText class="me-db-menu-icon" /><span>{{ titleOf(row) }}</span>
      </button>
      <div v-if="shown.some(p => !isEmptyValue(cellValue(row, p!)))" class="me-db-post-props">
        <template v-for="p in shown" :key="p!.id">
          <CellValue v-if="!isEmptyValue(cellValue(row, p!))" :prop="p!" :value="cellValue(row, p!)" compact />
        </template>
      </div>
      <template v-if="withPreview && previews[row.id]">
        <p v-if="previews[row.id]!.text" class="me-db-post-text" data-preview-text>{{ previews[row.id]!.text }}</p>
        <img v-if="previews[row.id]!.image" :src="previews[row.id]!.image" alt="" loading="lazy" decoding="async" class="me-db-post-image">
      </template>
    </article>
    <div ref="sentinel" class="me-db-feed-end" aria-hidden="true" />
    <button v-if="more && !infinite" type="button" class="me-db-text-button me-db-load-more" data-load-more @click="loadMore">
      {{ m.loadMore }} <span class="me-db-hint">({{ remaining }})</span>
    </button>
  </div>
</template>
