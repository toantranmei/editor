<script setup lang="ts">
/**
 * Side panel: open / resolved threads of the page, the draft for a new comment, replies,
 * edit / delete own comments, resolve / re-open. Clicking a thread scrolls the editor to it.
 */
import type { Editor } from '@tiptap/core'
import type { JSONContent, LocaleName } from '@toantranmei/editor'
import { computed, nextTick, shallowRef, watch } from 'vue'
import { indexDocument, threadRanges } from './anchor'
import CommentComposer from './CommentComposer.vue'
import { canComment as canCommentAt, levelOf } from './extension'
import { commentsMessages, type CommentsMessages } from './messages'
import { useCommentsState } from './store'
import ThreadCard from './ThreadCard.vue'
import type { CommentsLevel, CommentsSource, Thread } from './types'

const props = withDefaults(defineProps<{
  source: CommentsSource
  /** The page's editor: threads follow document order and clicking one scrolls to it. */
  editor?: Editor | null
  level?: CommentsLevel
  locale?: LocaleName
  messages?: Partial<Record<LocaleName, Partial<CommentsMessages>>>
}>(), { editor: null, level: 'edit', locale: 'vi', messages: undefined })

const m = computed(() => commentsMessages(props.locale, props.messages))
const state = useCommentsState(props.source)
const canComment = computed(() => canCommentAt(levelOf(props.level)) && !!props.source.me.value)
const draft = computed(() => state.draft.value)

// Document positions of each thread's text (re-read on every document change).
const version = shallowRef(0)
let off: (() => void) | null = null
watch(() => props.editor, (editor) => {
  off?.()
  off = null
  if (!editor) return
  const bump = () => version.value++
  editor.on('update', bump)
  off = () => editor.off('update', bump)
}, { immediate: true })

const positions = computed(() => {
  void version.value
  const map = new Map<string, number>()
  const editor = props.editor
  if (!editor || editor.isDestroyed) return map
  const index = indexDocument(editor.state.doc)
  for (const t of props.source.threads.value) {
    const r = threadRanges(t, index)[0]
    if (r) map.set(t.id, r.from)
  }
  return map
})

const visible = computed<Thread[]>(() => {
  const list = props.source.threads.value
  if (state.filter.value === 'resolved') {
    return list.filter(t => t.resolved_at).sort((a, b) => (b.resolved_at ?? '').localeCompare(a.resolved_at ?? ''))
  }
  const pos = positions.value
  const end = Number.MAX_SAFE_INTEGER
  return list.filter(t => !t.resolved_at).sort((a, b) => (pos.get(a.id) ?? end) - (pos.get(b.id) ?? end) || (a.comments[0]?.created_at ?? '').localeCompare(b.comments[0]?.created_at ?? ''))
})
const openCount = computed(() => props.source.threads.value.filter(t => !t.resolved_at).length)
const resolvedCount = computed(() => props.source.threads.value.length - openCount.value)

function select(thread: Thread) {
  state.activeId.value = thread.id
  const editor = props.editor
  const pos = positions.value.get(thread.id)
  if (!editor || pos === undefined || editor.isDestroyed) return
  const dom = editor.view.domAtPos(pos).node
  const el = (dom.nodeType === 1 ? dom : dom.parentElement) as HTMLElement | null
  el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
}

// Show the thread picked in the editor (highlight / badge click).
const root = shallowRef<HTMLElement | null>(null)
watch(state.activeId, (id) => {
  if (!id) return
  const thread = props.source.threads.value.find(t => t.id === id)
  if (thread) state.filter.value = thread.resolved_at ? 'resolved' : 'open'
  nextTick(() => root.value?.querySelector(`[data-thread-id="${CSS.escape(id)}"]`)?.scrollIntoView?.({ block: 'nearest' }))
})

const createThread = (body: JSONContent) => state.submitDraft(body)
</script>

<template>
  <aside ref="root" class="me-scope me-comments-panel" :aria-label="m.title">
    <header class="me-comments-header">
      <h2 class="me-comments-title">
        {{ m.title }}
      </h2>
      <div class="me-tabs me-tabs--inline me-comments-tabs" role="tablist">
        <button type="button" role="tab" class="me-tab" :class="{ 'is-active': state.filter.value === 'open' }" :aria-selected="state.filter.value === 'open'" @click="state.filter.value = 'open'">
          {{ m.open }} <span class="me-comments-count">{{ openCount }}</span>
        </button>
        <button type="button" role="tab" class="me-tab" :class="{ 'is-active': state.filter.value === 'resolved' }" :aria-selected="state.filter.value === 'resolved'" @click="state.filter.value = 'resolved'">
          {{ m.resolved }} <span class="me-comments-count">{{ resolvedCount }}</span>
        </button>
      </div>
    </header>

    <div v-if="draft && canComment" class="me-comment-thread is-active is-draft">
      <blockquote v-if="draft.anchor.kind === 'text'" class="me-comment-quote">
        {{ draft.anchor.quote }}
      </blockquote>
      <CommentComposer
        :key="draft.key"
        :source="source"
        :locale="locale"
        :m="m"
        :placeholder="m.placeholder"
        :submit-label="m.send"
        :send="createThread"
        autofocus
        cancellable
        @cancel="state.cancelDraft()"
      />
    </div>

    <p v-if="!canComment && source.me.value && levelOf(level) === 'view'" class="me-hint me-comments-hint">
      {{ m.readOnly }}
    </p>

    <ThreadCard
      v-for="t in visible"
      :key="t.id"
      :thread="t"
      :source="source"
      :m="m"
      :locale="locale"
      :can-comment="canComment"
      :active="state.activeId.value === t.id"
      :detached="!!editor && t.anchor.kind === 'text' && !positions.has(t.id)"
      @select="select(t)"
    />
    <p v-if="!visible.length && !draft" class="me-hint me-comments-empty">
      {{ state.filter.value === 'open' ? m.empty : m.emptyResolved }}
    </p>
  </aside>
</template>
