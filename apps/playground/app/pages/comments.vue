<script setup lang="ts">
/**
 * /comments: `@toantranmei/comments` with an in-memory adapter.
 * Switch the access level (edit marks the text; comment = read-only editor that can still
 * comment, anchored by block id + quote; view = read only) and the signed-in user.
 */
import type { Editor, JSONContent, LocaleName } from '@toantranmei/editor'
import { defaultBlocks, mention } from '@toantranmei/editor'
import { type Anchor, type Comment, comments, CommentsGutter, CommentsPanel, type CommentsLevel, type CommentsSource, type Thread } from '@toantranmei/comments'

const people = [
  { id: 'u1', name: 'Trần An', avatar: null },
  { id: 'u2', name: 'Lê Bình', avatar: null },
  { id: 'u3', name: 'Phạm Chi', avatar: null },
]
const userId = ref('u1')
const me = computed(() => people.find(p => p.id === userId.value) ?? null)
const meRef = ref(me.value)
watch(me, v => (meRef.value = v))

const threads = ref<Thread[]>([])
let n = 0
const id = (p: string) => `${p}-${++n}`
const author = () => ({ id: meRef.value!.id, name: meRef.value!.name, avatar_url: null })
const delay = () => new Promise(r => setTimeout(r, 120)) // pretend it's an API call

const source: CommentsSource = {
  me: meRef,
  threads,
  async create(anchor: Anchor, body: JSONContent) {
    await delay()
    const t: Thread = { id: id('t'), anchor, resolved_at: null, comments: [{ id: id('c'), author: author(), body, created_at: new Date().toISOString() }] }
    threads.value = [...threads.value, t]
    return t
  },
  async reply(threadId: string, body: JSONContent) {
    await delay()
    const c: Comment = { id: id('c'), author: author(), body, created_at: new Date().toISOString() }
    threads.value = threads.value.map(t => (t.id === threadId ? { ...t, comments: [...t.comments, c] } : t))
    return c
  },
  async edit(commentId: string, body: JSONContent) {
    await delay()
    threads.value = threads.value.map(t => ({ ...t, comments: t.comments.map(c => (c.id === commentId ? { ...c, body, edited_at: new Date().toISOString() } : c)) }))
  },
  async remove(commentId: string) {
    await delay()
    threads.value = threads.value.map(t => ({ ...t, comments: t.comments.filter(c => c.id !== commentId) })).filter(t => t.comments.length)
  },
  async resolve(threadId: string, resolved: boolean) {
    await delay()
    threads.value = threads.value.map(t => (t.id === threadId ? { ...t, resolved_at: resolved ? new Date().toISOString() : null } : t))
  },
  people: q => people.filter(p => p.name.toLowerCase().includes(q.toLowerCase())),
}

const level = ref<CommentsLevel>('edit')
const locale = ref<LocaleName>('vi')
const blocks = [...defaultBlocks, mention, comments.configure({ source, level: () => level.value })]

const doc = ref<JSONContent | null>({
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Kế hoạch Q4' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Bôi đen một đoạn chữ rồi bấm "Bình luận" trên thanh định dạng. Ở quyền "comment" editor chỉ đọc nhưng vẫn bình luận được.' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Mục tiêu: ra mắt ghi chú cộng tác, chia sẻ trang công khai và bình luận theo đoạn văn.' }] },
    { type: 'callout', attrs: { icon: '💡', color: 'yellow' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Số bình luận của mỗi block hiện ở lề phải.' }] }] },
  ],
})
const editor = shallowRef<Editor | null>(null)
</script>

<template>
  <div class="min-h-screen">
    <header class="sticky top-0 z-20 flex h-11 items-center justify-between bg-white/90 px-4 text-sm backdrop-blur dark:bg-[#191919]/90">
      <span class="text-neutral-600">Comments · {{ threads.length }} threads</span>
      <div class="flex items-center gap-2">
        <select v-model="level" class="toolbar-btn bg-transparent" title="Access level">
          <option value="edit">edit</option>
          <option value="comment">comment</option>
          <option value="view">view</option>
        </select>
        <select v-model="userId" class="toolbar-btn bg-transparent" title="Signed-in user">
          <option v-for="p in people" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <select v-model="locale" class="toolbar-btn bg-transparent">
          <option value="vi">Tiếng Việt</option>
          <option value="en">English</option>
          <option value="zh">中文</option>
        </select>
        <NuxtLink to="/" class="toolbar-btn">Playground</NuxtLink>
      </div>
    </header>
    <main class="mx-auto flex max-w-[1300px] gap-6 px-4 pt-8">
      <section class="min-w-0 flex-1 pl-12 pr-14">
        <MeiEditor
          v-model="doc"
          :blocks="blocks"
          :locale="locale"
          :editable="level === 'edit' || level === 'full'"
          :outline="false"
          @ready="editor = $event"
        />
        <CommentsGutter :editor="editor" :source="source" :locale="locale" />
      </section>
      <CommentsPanel class="sticky top-14 max-h-[calc(100vh-4rem)] shrink-0 overflow-y-auto" :source="source" :editor="editor" :level="level" :locale="locale" />
    </main>
  </div>
</template>
