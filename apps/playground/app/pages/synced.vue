<script setup lang="ts">
/**
 * /synced: two pages that can show the same synced block. "/synced block" on page A moves
 * the current block(s) into a new source; "Insert on page B" shows that source there too.
 * Editing inside it on either page updates both (one Y.Doc per source).
 */
import type { Editor, JSONContent, LocaleName } from '@toantranmei/editor'
import { defaultBlocks, mention } from '@toantranmei/editor'
import { syncedBlock } from '@toantranmei/synced-block'
import * as Y from 'yjs'

const sources = shallowReactive(new Map<string, Y.Doc>())
let n = 0
const readOnly = ref(false)
const base = [...defaultBlocks, mention]
const synced = syncedBlock.configure({
  doc: async (id) => {
    await new Promise(r => setTimeout(r, 100)) // pretend it's loading
    const doc = sources.get(id)
    return doc ? { doc, editable: !readOnly.value } : null
  },
  create: async () => {
    const id = `source-${++n}`
    sources.set(id, markRaw(new Y.Doc()))
    return id
  },
  originHref: id => `/synced#${id}`,
  blocks: base,
})
const blocks = [...base, synced]
const locale = ref<LocaleName>('vi')

const p = (text: string): JSONContent => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const pageA = ref<JSONContent | null>({ type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Trang A' }] }, p('Gõ /synced (hoặc /đồng bộ) trên dòng dưới để chuyển nó thành khối đồng bộ.'), p('Nội dung dùng chung cho nhiều trang.'), { type: 'paragraph' }] })
const pageB = ref<JSONContent | null>({ type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Trang B' }] }, p('Bấm "Chèn vào trang B" để hiện cùng khối ở đây.'), { type: 'paragraph' }] })
const editorB = shallowRef<Editor | null>(null)
const lastSource = computed(() => [...sources.keys()].pop() ?? null)
function insertOnB() {
  if (lastSource.value) editorB.value?.chain().focus('end').insertSyncedBlock(lastSource.value).run()
}
const keyRO = computed(() => `ro-${readOnly.value}`)
</script>

<template>
  <div class="min-h-screen">
    <header class="sticky top-0 z-20 flex h-11 items-center justify-between bg-white/90 px-4 text-sm backdrop-blur dark:bg-[#191919]/90">
      <span class="text-neutral-600">Synced blocks · {{ sources.size }} sources</span>
      <div class="flex items-center gap-2">
        <button type="button" class="toolbar-btn" :disabled="!lastSource" @click="insertOnB">
          Chèn vào trang B
        </button>
        <label class="toolbar-btn flex items-center gap-1"><input v-model="readOnly" type="checkbox"> Nguồn chỉ đọc</label>
        <select v-model="locale" class="toolbar-btn bg-transparent">
          <option value="vi">Tiếng Việt</option>
          <option value="en">English</option>
          <option value="zh">中文</option>
        </select>
        <NuxtLink to="/" class="toolbar-btn">Playground</NuxtLink>
      </div>
    </header>
    <main class="mx-auto grid max-w-[1400px] grid-cols-1 gap-8 px-4 pt-8 lg:grid-cols-2">
      <section class="min-w-0 rounded-lg border border-neutral-200 p-4 pl-12 dark:border-neutral-800">
        <MeiEditor :key="keyRO" v-model="pageA" :blocks="blocks" :locale="locale" :outline="false" />
      </section>
      <section class="min-w-0 rounded-lg border border-neutral-200 p-4 pl-12 dark:border-neutral-800">
        <MeiEditor :key="keyRO" v-model="pageB" :blocks="blocks" :locale="locale" :outline="false" @ready="editorB = $event" />
      </section>
    </main>
  </div>
</template>
