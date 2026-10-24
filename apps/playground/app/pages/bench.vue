<script setup lang="ts">
/**
 * Benchmark page: /bench?n=5000&emit=1
 * Generates a mixed document of `n` blocks and exposes timings on window.__bench.
 */
import type { Editor, JSONContent } from '@toantranmei/editor'
import { defaultBlocks, toc } from '@toantranmei/editor'

const route = useRoute()
const n = Number(route.query.n ?? 1000)
const emitUpdates = route.query.emit !== '0'
const withIds = route.query.ids === '1'
const ID_TYPES = new Set(['paragraph', 'heading', 'bulletList', 'orderedList', 'taskList', 'blockquote', 'codeBlock', 'horizontalRule', 'image', 'embed', 'callout', 'details', 'table', 'columns'])
let seq = 0
/** Docs saved by the editor already carry block ids; `ids=1` simulates that. */
function addIds(node: JSONContent): JSONContent {
  const out = { ...node }
  if (node.type && ID_TYPES.has(node.type)) out.attrs = { ...node.attrs, id: `b${seq++}` }
  if (node.content) out.content = node.content.map(addIds)
  return out
}

const LOREM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.'
function block(i: number): JSONContent {
  const text = (t: string, marks?: JSONContent['marks']) => ({ type: 'text', text: t, marks })
  const para = (t: string) => ({ type: 'paragraph', content: [text(`${i}. `), text(t.slice(0, 40), [{ type: 'bold' }]), text(t.slice(40))].filter(n => n.text) })
  switch (i % 20) {
    case 0: return { type: 'heading', attrs: { level: 2 }, content: [text(`Section ${i}`)] }
    case 5: return { type: 'bulletList', content: [1, 2, 3].map(k => ({ type: 'listItem', content: [para(`item ${k} ${LOREM}`)] })) }
    case 9: return { type: 'taskList', content: [1, 2].map(k => ({ type: 'taskItem', attrs: { checked: k === 1 }, content: [para(`task ${k}`)] })) }
    case 12: return { type: 'codeBlock', attrs: { language: 'javascript' }, content: [text(`function f${i}(a, b) {\n  return a + b // ${i}\n}`)] }
    case 15: return { type: 'callout', attrs: { icon: '💡', color: 'blue' }, content: [para(LOREM)] }
    case 18: return { type: 'table', content: [0, 1].map(r => ({ type: 'tableRow', content: [0, 1, 2].map(c => ({ type: r ? 'tableCell' : 'tableHeader', content: [para(`r${r}c${c}`)] })) })) }
    default: return para(LOREM)
  }
}

const t0 = performance.now()
const raw: JSONContent = { type: 'doc', content: Array.from({ length: n }, (_, i) => block(i)) }
const doc = withIds ? addIds(raw) : raw
const genMs = performance.now() - t0
const content = shallowRef<JSONContent | null>(doc)
let updates = 0

declare global { interface Window { __bench: Record<string, any> } }
window.__bench = { n, genMs, mountStart: performance.now(), updates: () => updates }

function onReady(editor: Editor) {
  window.__bench.readyAt = performance.now()
  window.__bench.editor = editor
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.__bench.paintedAt = performance.now()
  }))
}
function onUpdate(value: JSONContent) {
  updates++
  content.value = value
}
</script>

<template>
  <main class="mx-auto max-w-[720px] px-14 py-10">
    <MeiEditor
      :model-value="content"
      :blocks="[...defaultBlocks, toc]"
      @ready="onReady"
      @update:model-value="emitUpdates ? onUpdate($event) : undefined"
    />
  </main>
</template>
