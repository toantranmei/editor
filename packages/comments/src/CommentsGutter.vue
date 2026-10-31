<script setup lang="ts">
/**
 * Badges in the editor's right margin: the number of open threads per block (`data-id`).
 * Click to open the block's first thread. Mounted inside the editor root, next to its blocks.
 */
import { MessageSquareText } from '@lucide/vue'
import type { Editor } from '@tiptap/core'
import type { LocaleName } from '@toantranmei/editor'
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import { indexDocument, threadBlockId } from './anchor'
import { commentsMessages, type CommentsMessages } from './messages'
import { useCommentsState } from './store'
import type { CommentsSource, Thread } from './types'

const props = withDefaults(defineProps<{
  editor: Editor | null | undefined
  source: CommentsSource
  locale?: LocaleName
  messages?: Partial<Record<LocaleName, Partial<CommentsMessages>>>
}>(), { locale: 'vi', messages: undefined })
const emit = defineEmits<{ open: [threadIds: string[]] }>()

const m = computed(() => commentsMessages(props.locale, props.messages))
const state = useCommentsState(props.source)

interface Badge { blockId: string, top: number, threads: Thread[] }
const badges = shallowRef<Badge[]>([])
const target = shallowRef<HTMLElement | null>(null)

let frame = 0
function schedule() {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(measure)
}

function measure() {
  const editor = props.editor
  if (!editor || editor.isDestroyed || !editor.view?.dom?.isConnected) {
    badges.value = []
    return
  }
  const root = (editor.view.dom.closest('.me-root') as HTMLElement | null) ?? editor.view.dom.parentElement
  target.value = root
  if (!root) return
  const byBlock = new Map<string, Thread[]>()
  for (const t of props.source.threads.value) {
    const id = !t.resolved_at && threadBlockId(t)
    if (id) byBlock.set(id, [...(byBlock.get(id) ?? []), t])
  }
  if (!byBlock.size) {
    badges.value = []
    return
  }
  const { blocks } = indexDocument(editor.state.doc)
  const rootTop = root.getBoundingClientRect().top
  const next: Badge[] = []
  for (const [blockId, threads] of byBlock) {
    const block = blocks.get(blockId)
    const dom = block && editor.view.nodeDOM(block.pos)
    if (!(dom instanceof HTMLElement)) continue
    next.push({ blockId, top: dom.getBoundingClientRect().top - rootTop, threads })
  }
  badges.value = next.sort((a, b) => a.top - b.top)
}

let observer: ResizeObserver | null = null
let off: (() => void) | null = null
watch(() => props.editor, (editor) => {
  off?.()
  observer?.disconnect()
  off = null
  if (!editor) return
  editor.on('update', schedule)
  editor.on('create', schedule)
  off = () => {
    editor.off('update', schedule)
    editor.off('create', schedule)
  }
  if (typeof ResizeObserver !== 'undefined' && editor.view?.dom) {
    observer = new ResizeObserver(schedule)
    observer.observe(editor.view.dom)
  }
  schedule()
}, { immediate: true })
watch(() => props.source.threads.value.map(t => `${t.id}:${t.resolved_at ? 1 : 0}`).join('|'), schedule)
if (typeof window !== 'undefined') window.addEventListener('resize', schedule)
onBeforeUnmount(() => {
  off?.()
  observer?.disconnect()
  cancelAnimationFrame(frame)
  if (typeof window !== 'undefined') window.removeEventListener('resize', schedule)
})

function open(badge: Badge) {
  state.activeId.value = badge.threads[0]!.id
  emit('open', badge.threads.map(t => t.id))
}
const isActive = (badge: Badge) => badge.threads.some(t => t.id === state.activeId.value)
const label = (badge: Badge) => m.value.threads.replace('{count}', String(badge.threads.length))
</script>

<template>
  <Teleport v-if="target" :to="target">
    <div class="me-comments-gutter">
      <button
        v-for="b in badges"
        :key="b.blockId"
        type="button"
        class="me-comments-badge"
        :class="{ 'is-active': isActive(b) }"
        :style="{ top: `${b.top}px` }"
        :title="label(b)"
        :aria-label="label(b)"
        :data-block-id="b.blockId"
        @mousedown.prevent
        @click="open(b)"
      >
        <MessageSquareText /> {{ b.threads.length }}
      </button>
    </div>
  </Teleport>
</template>
