<script setup lang="ts">
import { Check, RotateCcw } from '@lucide/vue'
import type { JSONContent, LocaleName } from '@toantranmei/editor'
import { computed } from 'vue'
import CommentComposer from './CommentComposer.vue'
import CommentItem from './CommentItem.vue'
import type { CommentsMessages } from './messages'
import type { CommentsSource, Thread } from './types'

const props = defineProps<{
  thread: Thread
  source: CommentsSource
  m: CommentsMessages
  locale: LocaleName
  canComment: boolean
  active: boolean
  /** The commented text is no longer in the document. */
  detached: boolean
}>()
const emit = defineEmits<{ select: [] }>()

const resolved = computed(() => !!props.thread.resolved_at)
const quote = computed(() => (props.thread.anchor.kind === 'text' ? props.thread.anchor.quote : props.thread.anchor.kind === 'page' ? props.m.pageComment : ''))

const reply = (body: JSONContent) => props.source.reply(props.thread.id, body)
const toggleResolved = () => props.source.resolve(props.thread.id, !resolved.value)
</script>

<template>
  <article
    class="me-comment-thread"
    :class="{ 'is-active': active, 'is-resolved': resolved }"
    :data-thread-id="thread.id"
    @click="emit('select')"
  >
    <div class="me-comment-thread-head">
      <blockquote v-if="quote" class="me-comment-quote" :class="{ 'is-detached': detached }" :title="detached ? m.detached : undefined">
        {{ quote }}
      </blockquote>
      <button
        v-if="canComment"
        type="button"
        class="me-tool-btn me-comment-resolve"
        :title="resolved ? m.reopen : m.resolve"
        @click.stop="toggleResolved"
      >
        <RotateCcw v-if="resolved" />
        <Check v-else />
      </button>
    </div>
    <CommentItem
      v-for="c in thread.comments"
      :key="c.id"
      :comment="c"
      :source="source"
      :m="m"
      :locale="locale"
      :can-comment="canComment"
    />
    <CommentComposer
      v-if="active && canComment && !resolved && source.me.value"
      :source="source"
      :locale="locale"
      :m="m"
      :placeholder="m.replyPlaceholder"
      :submit-label="m.reply"
      :send="reply"
      @click.stop
    />
  </article>
</template>
