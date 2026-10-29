<script setup lang="ts">
/**
 * /render: the document on the left (editor) rendered to static HTML on the right with
 * `renderHTML` from `@toantranmei/editor/render` (the same function a Nuxt server route uses).
 */
import type { JSONContent, LocaleName } from '@toantranmei/editor'
import { defaultBlocks, file, html as htmlBlock, math, mention, mermaid, toc } from '@toantranmei/editor'
import { hydrateMermaid, renderHTML } from '@toantranmei/editor/render'
import { pageBlock } from '@toantranmei/page-block'
import katex from 'katex'
import { DEFAULT_CONTENT } from '~/default-content'

const pages: Record<string, { title: string, icon?: string }> = { 'p-q4': { title: 'Kế hoạch Q4', icon: '🚀' }, 'p-notes': { title: 'Ghi chú họp' } }
const pageLinks = pageBlock.configure({ resolve: id => ref(pages[id] ?? null), href: id => `/render#${id}` })
const blocks = [...defaultBlocks, toc, math, mermaid, mention, htmlBlock, file, pageLinks]

const doc = ref<JSONContent | null>({
  ...DEFAULT_CONTENT,
  content: [
    ...DEFAULT_CONTENT.content!.slice(0, -1),
    { type: 'pageLink', attrs: { pageId: 'p-q4' } },
    { type: 'pageLink', attrs: { pageId: 'p-missing' } },
    { type: 'paragraph', content: [{ type: 'text', text: 'Link ' }, { type: 'text', text: 'example.com', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] }, { type: 'text', text: ' and ' }, { type: 'mention', attrs: { id: 'u1', label: 'An', kind: 'user', href: '/u/u1' } }] },
    { type: 'image', attrs: { src: 'https://picsum.photos/seed/mei/800/400', alt: 'Ảnh', width: 60, caption: 'Ảnh có chú thích', showCaption: true } },
    { type: 'embed', attrs: { src: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', height: 315 } },
    { type: 'table', content: [
      { type: 'tableRow', content: [{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Tên' }] }] }, { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Điểm' }] }] }] },
      { type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'An' }] }] }, { type: 'tableCell', attrs: { color: 'green' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '9' }] }] }] },
    ] },
    { type: 'paragraph' },
  ],
})
const locale = ref<LocaleName>('vi')
const ms = ref(0)
const output = computed(() => {
  const start = performance.now()
  const out = renderHTML(doc.value, {
    blocks,
    locale: locale.value,
    katex,
    resolveLink: id => (pages[id] ? { href: `/render#${id}`, ...pages[id] } : null),
  })
  ms.value = performance.now() - start
  return out
})
const showSource = ref(false)
const preview = ref<HTMLElement | null>(null)
watch(output, () => nextTick(() => hydrateMermaid(preview.value)), { flush: 'post' })
onMounted(() => hydrateMermaid(preview.value))

useHead({ title: 'renderHTML · playground' })
</script>

<template>
  <div class="min-h-screen">
    <header class="sticky top-0 z-20 flex h-11 items-center justify-between bg-white/90 px-4 text-sm backdrop-blur dark:bg-[#191919]/90">
      <span class="text-neutral-600">renderHTML · {{ output.length.toLocaleString() }} chars · {{ ms.toFixed(1) }} ms</span>
      <div class="flex items-center gap-2">
        <button type="button" class="toolbar-btn" @click="showSource = !showSource">
          {{ showSource ? 'Preview' : 'HTML' }}
        </button>
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
        <p class="mb-2 text-xs text-neutral-400">
          Editor
        </p>
        <MeiEditor v-model="doc" :blocks="blocks" :locale="locale" :outline="false" />
      </section>
      <section class="min-w-0 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <p class="mb-2 text-xs text-neutral-400">
          Static HTML (renderHTML)
        </p>
        <pre v-if="showSource" class="overflow-auto whitespace-pre-wrap break-all text-xs">{{ output }}</pre>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div v-else ref="preview" v-html="output" />
      </section>
    </main>
  </div>
</template>
