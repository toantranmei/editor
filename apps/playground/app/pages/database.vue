<script setup lang="ts">
/**
 * /database: the database block on an in-memory fake `DatabaseSource` (`@toantranmei/database-block/memory`)
 * with 100k generated rows. The fake runs filters / sorts / groups / aggregates / chart / pivot in JS; the table only
 * asks it for the rows in view (see the request counter). "/database" in the editor creates more databases;
 * "Database – full page" (or the ⤢ button) opens one full page with `?db=<id>`.
 */
import type { JSONContent, LocaleName, ThemeMode } from '@toantranmei/editor'
import { defaultBlocks } from '@toantranmei/editor'
import { databaseBlock, DatabaseView, type DatabaseSource, type Prop, type View } from '@toantranmei/database-block'
import { createMemorySource, type MemorySource, sampleDatabase } from '@toantranmei/database-block/memory'

const route = useRoute()
const router = useRouter()
const count = Number(route.query.rows) || 100_000

const sources = new Map<string, MemorySource>()
const titles = reactive<Record<string, string>>({})
function register(id: string, source: MemorySource) {
  sources.set(id, markRaw(source))
  titles[id] = source.meta.value?.title ?? ''
  watch(() => source.meta.value?.title, t => (titles[id] = t ?? ''))
  return source
}

const t0 = performance.now()
register('tasks', createMemorySource({ ...sampleDatabase(count, { databaseId: 'tasks' }), openRow: id => (opened.value = id) }))
const generatedMs = Math.round(performance.now() - t0)
register('people', createMemorySource({
  ...sampleDatabase(40, { databaseId: 'people', seed: 7 }),
  meta: { title: 'Small database', icon: '📇' },
  openRow: id => (opened.value = id),
}))

let n = 0
/** A new empty database, like the server creates it: a `title` property and one table view. */
async function createDatabase(kind: 'inline' | 'full_page') {
  await new Promise(r => setTimeout(r, 120))
  const id = `db-${++n}`
  const props: Prop[] = [{ id: 'title', name: 'Name', type: 'title', position: 'a0' }]
  const views: View[] = [{ id: 'table', name: 'Table', type: 'table', position: 'a0', config: {} }]
  register(id, createMemorySource({ databaseId: id, meta: { title: kind === 'full_page' ? 'Full-page database' : '', icon: null }, props, views, rows: [], people: sampleDatabase(0).people, openRow: r => (opened.value = r) }))
  return id
}

const blocks = [
  ...defaultBlocks,
  databaseBlock.configure({
    source: async (id): Promise<DatabaseSource> => {
      await new Promise(r => setTimeout(r, 80)) // pretend to open the worker / fetch the snapshot
      const s = sources.get(id)
      if (!s) throw new Error(`No database ${id}`)
      return s
    },
    createDatabase,
    open: id => router.push({ query: { ...route.query, db: id } }),
  }),
]

const doc = ref<JSONContent | null>({
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Database block' }] },
    { type: 'paragraph', content: [{ type: 'text', text: `An inline database with ${count.toLocaleString('en')} rows (generated in ${generatedMs} ms). Scroll it, edit cells (Enter / typing / double-click), copy-paste ranges, filter, sort, group, switch views.` }] },
    { type: 'databaseView', attrs: { databaseId: 'tasks', viewId: 'v-table' } },
    { type: 'paragraph', content: [{ type: 'text', text: 'The same database again, on its board view:' }] },
    { type: 'databaseView', attrs: { databaseId: 'tasks', viewId: 'v-board' } },
    { type: 'paragraph', content: [{ type: 'text', text: 'A small one, and a link to it as a full-page database:' }] },
    { type: 'databaseView', attrs: { databaseId: 'people', viewId: 'v-table' } },
    { type: 'databaseView', attrs: { databaseId: 'people', inline: false } },
    { type: 'paragraph', content: [{ type: 'text', text: 'Type /database for a new one.' }] },
  ],
})

const locale = ref<LocaleName>('vi')
const theme = ref<ThemeMode>('auto')
watch(theme, t => document.documentElement.classList.toggle('dark', t === 'dark'))
const opened = ref<string | null>(null)
const fullId = computed(() => (typeof route.query.db === 'string' && sources.has(route.query.db) ? route.query.db : null))

// Reads the fake answered (table windows etc.), to see that scrolling asks only for what's in view.
const tasks = sources.get('tasks')!
const reads = ref(0)
const lastWindow = ref('')
let raf = 0
function poll() {
  const rows = tasks.log.filter(l => l.method === 'rows' || l.method === 'rowsInGroup')
  reads.value = rows.length
  const last = rows.at(-1)?.args[rows.at(-1)!.method === 'rows' ? 1 : 2] as { offset: number, limit: number } | undefined
  lastWindow.value = last ? `${last.offset}–${last.offset + last.limit - 1}` : ''
  if (tasks.log.length > 5000) tasks.log.splice(0, tasks.log.length - 1000)
  raf = requestAnimationFrame(poll)
}
onMounted(() => (raf = requestAnimationFrame(poll)))
onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<template>
  <div class="min-h-screen">
    <header class="sticky top-0 z-20 flex h-11 items-center justify-between bg-white/90 px-4 text-sm backdrop-blur dark:bg-[#191919]/90">
      <span class="font-medium">Database <span class="text-neutral-400">· reads {{ reads }} · last window {{ lastWindow }}</span></span>
      <div class="flex items-center gap-2">
        <NuxtLink v-if="fullId" :to="{ query: { ...route.query, db: undefined } }" class="toolbar-btn">← Page</NuxtLink>
        <select v-model="locale" class="toolbar-btn bg-transparent">
          <option value="vi">Tiếng Việt</option>
          <option value="en">English</option>
          <option value="zh">中文</option>
        </select>
        <select v-model="theme" class="toolbar-btn bg-transparent">
          <option value="auto">Auto</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
        <NuxtLink to="/chart" class="toolbar-btn">Chart</NuxtLink>
        <NuxtLink to="/" class="toolbar-btn">Playground</NuxtLink>
      </div>
    </header>

    <main v-if="fullId" class="mx-auto max-w-[1200px] px-4 pt-8">
      <!-- Full-page database: the same UI without an editor. -->
      <div class="me-scope" :class="{ 'me-dark': theme === 'dark', 'me-light': theme === 'light' }">
        <DatabaseView :key="fullId" :source="sources.get(fullId)!" :database-id="fullId" :locale="locale" full />
      </div>
    </main>
    <main v-else class="mx-auto max-w-[1100px] px-4 pt-10 pl-12">
      <MeiEditor v-model="doc" :blocks="blocks" :locale="locale" :theme="theme" :outline="false" />
    </main>

    <div v-if="opened" class="fixed right-4 bottom-4 z-30 rounded-md bg-neutral-900 px-3 py-2 text-sm text-white shadow-lg" @click="opened = null">
      openRow("{{ opened }}") — a real app opens the row as a page
    </div>
  </div>
</template>
