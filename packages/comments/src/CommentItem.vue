<script setup lang="ts">
import { Ellipsis } from '@lucide/vue'
import type { JSONContent, LocaleName } from '@toantranmei/editor'
import { computed, ref } from 'vue'
import CommentComposer from './CommentComposer.vue'
import { bodyHtml, formatTime, initials } from './format'
import type { CommentsMessages } from './messages'
import type { Comment, CommentsSource } from './types'

const props = defineProps<{ comment: Comment, source: CommentsSource, m: CommentsMessages, locale: LocaleName, canComment: boolean }>()

const own = computed(() => !!props.source.me.value && props.source.me.value.id === props.comment.author.id)
const menu = ref(false)
const editing = ref(false)
const html = computed(() => bodyHtml(props.comment.body, props.locale))

async function save(body: JSONContent) {
  await props.source.edit(props.comment.id, body)
  editing.value = false
}
async function remove() {
  menu.value = false
  await props.source.remove(props.comment.id)
}
</script>

<template>
  <div class="me-comment">
    <div class="me-comment-head">
      <img v-if="comment.author.avatar_url" class="me-comment-avatar" :src="comment.author.avatar_url" alt="">
      <span v-else class="me-comment-avatar me-comment-avatar--initials" aria-hidden="true">{{ initials(comment.author.name) }}</span>
      <span class="me-comment-author">{{ comment.author.name }}</span>
      <span class="me-comment-meta">
        {{ formatTime(comment.created_at, locale) }}<template v-if="comment.edited_at"> · {{ m.edited }}</template>
      </span>
      <span v-if="own && canComment && !editing" class="me-comment-menu-anchor">
        <button type="button" class="me-tool-btn me-comment-more" :title="m.more" :aria-expanded="menu" @click="menu = !menu">
          <Ellipsis />
        </button>
        <span v-if="menu" class="me-popover me-menu me-comment-menu">
          <button type="button" class="me-menu-item" @click="editing = true; menu = false">
            <span class="me-menu-title">{{ m.edit }}</span>
          </button>
          <button type="button" class="me-menu-item me-menu-item--danger" @click="remove">
            <span class="me-menu-title">{{ m.delete }}</span>
          </button>
        </span>
      </span>
    </div>
    <CommentComposer
      v-if="editing"
      :source="source"
      :locale="locale"
      :m="m"
      :placeholder="m.placeholder"
      :submit-label="m.save"
      :initial="comment.body"
      :send="save"
      autofocus
      cancellable
      @cancel="editing = false"
    />
    <!-- Rendered by @toantranmei/editor/render: text escaped, URLs allow-listed. -->
    <div v-else class="me-content me-comment-body" v-html="html" />
  </div>
</template>
