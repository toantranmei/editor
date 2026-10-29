<script setup lang="ts">
/**
 * /notes: collaboration + sub-pages demo, all in memory.
 * - Each page is a pair of Y.Docs synced to each other (like two browsers through a provider);
 *   the two editors side by side edit the same page.
 * - `pageBlock` with a fake adapter: "/page" creates a child page and opens it, "/link to page"
 *   searches the pages. Titles are edited above the editors and links update live.
 */
import type { Editor, LocaleName } from '@toantranmei/editor'
import { defaultBlocks, mention } from '@toantranmei/editor'
import { pageBlock, type PageInfo, type PageSearchResult } from '@toantranmei/page-block'
import * as Y from 'yjs'

interface Page { id: string, parent: string | null, info: Ref<PageInfo | null | undefined>, docs: [Y.Doc, Y.Doc] }

/** Two Y.Docs that forward every update to each other. */
function syncedDocs(): [Y.Doc, Y.Doc] {
  const a = new Y.Doc()
  const b = new Y.Doc()
  a.on('update', (u: Uint8Array, origin: unknown) => origin !== 'remote' && Y.applyUpdate(b, u, 'remote'))
  b.on('update', (u: Uint8Array, origin: unknown) => origin !== 'remote' && Y.applyUpdate(a, u, 'remote'))
  return [a, b]
}

const pages = shallowReactive(new Map<string, Page>())
let counter = 0
function addPage(parent: string | null, title = '', icon: string | null = null): Page {
  const id = `page-${++counter}`
  const page: Page = { id, parent, info: ref({ title, icon }), docs: markRaw(syncedDocs()) as [Y.Doc, Y.Doc] }
  pages.set(id, page)
  return page
}
const root = addPage(null, 'Notes', '📒')
addPage(root.id, 'Kế hoạch Q4', '🚀')
addPage(root.id, '')

const route = useRoute()
const router = useRouter()
const currentId = computed(() => (typeof route.query.page === 'string' && pages.has(route.query.page) ? route.query.page : root.id))
const current = computed(() => pages.get(currentId.value)!)

// Unknown ids resolve to null ("Page not found / no access"); a short delay shows the loading state.
const resolved = new Map<string, Ref<PageInfo | null | undefined>>()
function resolve(id: string) {
  const page = pages.get(id)
  if (page) return page.info
  if (!resolved.has(id)) {
    const r = ref<PageInfo | null | undefined>(undefined)
    setTimeout(() => (r.value = null), 600)
    resolved.set(id, r)
  }
  return resolved.get(id)!
}

const blocks = [
  ...defaultBlocks,
  mention,
  pageBlock.configure({
    resolve,
    createPage: async () => {
      await new Promise(r => setTimeout(r, 150)) // pretend it's an API call
      return addPage(currentId.value).id
    },
    open: id => router.push({ query: { page: id } }),
    href: id => `/notes?page=${encodeURIComponent(id)}`,
    search: async (q: string): Promise<PageSearchResult[]> => [...pages.values()]
      .filter(p => p.id !== currentId.value && (p.info.value?.title ?? '').toLowerCase().includes(q.toLowerCase()))
      .map(p => ({ id: p.id, title: p.info.value?.title ?? '', icon: p.info.value?.icon })),
  }),
]

const locale = ref<LocaleName>('vi')
const changes = ref([0, 0])
const sizes = ref([0, 0])
const timers: (ReturnType<typeof setTimeout> | undefined)[] = [undefined, undefined]
// `change` is cheap; do the expensive work (here: measuring the JSON) debounced.
function onChange(side: 0 | 1, { editor }: { editor: Editor }) {
  changes.value[side]!++
  clearTimeout(timers[side])
  timers[side] = setTimeout(() => (sizes.value[side] = JSON.stringify(editor.getJSON()).length), 300)
}
watch(currentId, () => {
  changes.value = [0, 0]
  sizes.value = [0, 0]
})

const breadcrumbs = computed(() => {
  const out: Page[] = []
  for (let p: Page | undefined = current.value; p; p = p.parent ? pages.get(p.parent) : undefined) out.unshift(p)
  return out
})
const title = computed({
  get: () => current.value.info.value?.title ?? '',
  set: (v: string) => (current.value.info.value = { ...current.value.info.value, title: v }),
})

useHead({ title: () => `${title.value || 'Untitled'} · notes` })
</script>

<template>
  <div class="min-h-screen">
    <header class="sticky top-0 z-20 flex h-11 items-center justify-between bg-white/90 px-4 text-sm backdrop-blur dark:bg-[#191919]/90">
      <nav class="flex min-w-0 items-center gap-1 truncate text-neutral-600">
        <template v-for="(p, i) in breadcrumbs" :key="p.id">
          <span v-if="i" class="text-neutral-300">/</span>
          <NuxtLink :to="{ query: { page: p.id } }" class="hover:underline">
            {{ p.info.value?.icon }} {{ p.info.value?.title || 'Untitled' }}
          </NuxtLink>
        </template>
      </nav>
      <div class="flex items-center gap-2">
        <span class="text-neutral-400">{{ pages.size }} pages</span>
        <select v-model="locale" class="toolbar-btn bg-transparent">
          <option value="vi">Tiếng Việt</option>
          <option value="en">English</option>
          <option value="zh">中文</option>
        </select>
        <NuxtLink to="/" class="toolbar-btn">Playground</NuxtLink>
      </div>
    </header>

    <main class="mx-auto max-w-[1400px] px-4 pt-10">
      <input v-model="title" class="page-title mb-6 w-full bg-transparent outline-none" placeholder="Untitled">
      <div class="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section v-for="side in ([0, 1] as const)" :key="`${currentId}-${side}`" class="min-w-0 rounded-lg border border-neutral-200 p-4 pl-12 dark:border-neutral-800">
          <p class="mb-2 text-xs text-neutral-400">
            Editor {{ side === 0 ? 'A' : 'B' }} · Y.Doc {{ side + 1 }} · change × {{ changes[side] }} · JSON {{ sizes[side] }} B
          </p>
          <MeiEditor
            :blocks="blocks"
            :locale="locale"
            :collaboration="{ document: current.docs[side], field: 'default' }"
            :outline="false"
            @change="onChange(side, $event)"
          />
        </section>
      </div>
    </main>
  </div>
</template>
