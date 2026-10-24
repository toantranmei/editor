<script setup lang="ts">
import type { Editor, LocaleName, MentionItem, ThemeMode, ThemeTokens } from '@toantranmei/editor'
import { defaultBlocks, emoji, file, html, math, mention, mermaid, toc } from '@toantranmei/editor'

// Demo people/pages for @mentions (a real app would query its API).
const PEOPLE: MentionItem[] = [
  { id: 'u1', kind: 'user', label: 'Trần Minh Anh', description: 'anh.tran@example.com' },
  { id: 'u2', kind: 'user', label: 'Nguyễn Hoàng Long', description: 'long.nguyen@example.com' },
  { id: 'p1', kind: 'page', label: 'Kế hoạch Q4', href: 'https://example.com/q4' },
  { id: 'p2', kind: 'page', label: 'Ghi chú họp', href: 'https://example.com/meeting' },
]
const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036F]/g, '').replace(/đ/g, 'd').toLowerCase()

// All built-in blocks, including the opt-in ones.
const blocks = [
  ...defaultBlocks,
  toc,
  math,
  mermaid,
  html,
  emoji,
  file.configure({ maxSize: 2 }),
  mention.configure({
    search: q => PEOPLE.filter(p => normalize(p.label).includes(normalize(q))),
    reminderHelpUrl: 'https://www.notion.com/help/reminders',
    // A real app would schedule a notification on its backend here.
    onRemind: reminder => console.info('[reminder]', reminder ? `${reminder.remind} → ${reminder.fireAt.toLocaleString()}` : 'cleared'),
  }),
]

const { title, content, status, error, loaded, setContent, reset } = useLocalPage()

const titleEl = ref<HTMLTextAreaElement | null>(null)
const editor = shallowRef<Editor | null>(null)
const pageKey = ref(0)
const locale = ref<LocaleName>('vi')
const editable = ref(true)

// Theme demo: page dark mode (html.dark), per-editor forced mode, and token overrides.
const pageDark = ref(false)
const mode = ref<ThemeMode>('auto')
const accent = ref('')
watch(pageDark, v => document.documentElement.classList.toggle('dark', v))
const tokens = computed<ThemeTokens | undefined>(() => accent.value ? { color: { accent: accent.value }, components: { todo: { checkColor: accent.value } } } : undefined)

useHead({ title: () => title.value || 'Không có tiêu đề' })

function autosize() {
  const el = titleEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}
watch([title, loaded], () => nextTick(autosize))

/** Enter / ArrowDown in the title jumps into the editor, like Notion. */
function onTitleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' || (e.key === 'ArrowDown' && titleEl.value?.selectionStart === title.value.length)) {
    e.preventDefault()
    editor.value?.commands.focus('start')
  }
}

function exportJson() {
  const blob = new Blob([JSON.stringify({ title: title.value, content: content.value }, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${(title.value || 'page').replace(/[^\p{L}\p{N}-]+/gu, '-')}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

function resetPage() {
  if (!confirm('Xoá toàn bộ nội dung và khôi phục trang mẫu?')) return
  reset()
  pageKey.value++
}

const statusText = computed(() => ({ idle: '', saving: 'Đang lưu...', saved: 'Đã lưu', error: error.value })[status.value])
</script>

<template>
  <div class="min-h-screen">
    <header class="sticky top-0 z-20 flex h-11 items-center justify-between bg-white/90 px-4 text-sm backdrop-blur dark:bg-[#191919]/90">
      <div class="truncate text-neutral-700 dark:text-neutral-300">
        {{ title || 'Không có tiêu đề' }}
      </div>
      <div class="flex items-center gap-1">
        <span class="mr-2" :class="status === 'error' ? 'text-red-600' : 'text-neutral-400'">{{ statusText }}</span>
        <button type="button" class="toolbar-btn" @click="pageDark = !pageDark">
          {{ pageDark ? '☀️ Trang sáng' : '🌙 Trang tối' }}
        </button>
        <select v-model="mode" class="toolbar-btn bg-transparent" title="Ép chế độ cho editor (prop theme)">
          <option value="auto">Editor: theo trang</option>
          <option value="light">Editor: luôn sáng</option>
          <option value="dark">Editor: luôn tối</option>
        </select>
        <select v-model="accent" class="toolbar-btn bg-transparent" title="Màu nhấn (prop tokens)">
          <option value="">Accent: mặc định</option>
          <option value="#7c3aed">Accent: tím</option>
          <option value="#16a34a">Accent: xanh lá</option>
          <option value="#e11d48">Accent: hồng</option>
        </select>
        <select v-model="locale" class="toolbar-btn bg-transparent">
          <option value="vi">Tiếng Việt</option>
          <option value="en">English</option>
        </select>
        <button type="button" class="toolbar-btn" @click="editable = !editable">
          {{ editable ? 'Chỉ xem' : 'Chỉnh sửa' }}
        </button>
        <button type="button" class="toolbar-btn" @click="exportJson">
          Xuất JSON
        </button>
        <button type="button" class="toolbar-btn" @click="resetPage">
          Đặt lại
        </button>
      </div>
    </header>

    <main v-if="loaded" class="mx-auto max-w-[720px] px-4 pt-16 sm:px-14">
      <textarea
        ref="titleEl"
        v-model="title"
        rows="1"
        class="page-title"
        placeholder="Không có tiêu đề"
        :readonly="!editable"
        @input="autosize"
        @keydown="onTitleKeydown"
      />
      <MeiEditor
        :key="pageKey"
        :model-value="content"
        :locale="locale"
        :editable="editable"
        :max-image-size="2"
        :theme="mode"
        :tokens="tokens"
        :blocks="blocks"
        @update:model-value="setContent"
        @ready="editor = $event"
      />
    </main>
  </div>
</template>
