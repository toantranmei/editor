<script setup lang="ts">
/**
 * Small rich-text box for a comment body: paragraphs, bold/italic/code/links and
 * @mentions of people (`source.people`). ⌘/Ctrl+Enter sends, Esc cancels.
 */
import { Extension } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Editor, EditorContent, type JSONContent } from '@tiptap/vue-3'
import { MeiConfig, MentionNode, type LocaleName, type MentionItem, resolveMessages } from '@toantranmei/editor'
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import type { CommentsMessages } from './messages'
import type { CommentsSource } from './types'

const props = defineProps<{
  source: CommentsSource
  locale: LocaleName
  m: CommentsMessages
  placeholder: string
  submitLabel: string
  initial?: JSONContent | null
  autofocus?: boolean
  /** Show Cancel. */
  cancellable?: boolean
  /** Saves the body; the box clears when it resolves and shows an error when it rejects. */
  send: (body: JSONContent) => Promise<unknown>
}>()
const emit = defineEmits<{ cancel: [] }>()

const busy = ref(false)
const error = ref(false)

const Keys = Extension.create({
  name: 'commentKeys',
  addKeyboardShortcuts: () => ({
    'Mod-Enter': () => {
      submit()
      return true
    },
    'Escape': () => {
      if (props.cancellable) emit('cancel')
      return props.cancellable
    },
  }),
})

const editor = shallowRef(new Editor({
  extensions: [
    StarterKit.configure({ heading: false, codeBlock: false, blockquote: false, horizontalRule: false, bulletList: false, orderedList: false, listItem: false, listKeymap: false, dropcursor: false, gapcursor: false, trailingNode: false, link: { openOnClick: false, autolink: true } }),
    MeiConfig.configure({ locale: props.locale, messages: resolveMessages(props.locale) }),
    MentionNode.configure({
      search: async (query: string): Promise<MentionItem[]> => {
        const people = await props.source.people(query)
        return people.map(p => ({ id: p.id, label: p.name, kind: 'user', avatar: p.avatar ?? undefined, description: p.description }))
      },
    }),
    Keys,
  ],
  content: props.initial ?? null,
  autofocus: props.autofocus ? 'end' : false,
  editorProps: { attributes: { 'class': 'me-content me-comment-input', 'aria-label': props.placeholder } },
}))
onBeforeUnmount(() => editor.value.destroy())

const isEmpty = () => {
  const { doc } = editor.value.state
  return doc.textContent.trim() === '' && !hasMention(doc.toJSON())
}
// Reading `state` makes this reactive (Tiptap's Vue editor re-renders once per frame).
const empty = computed(isEmpty)
function hasMention(node: JSONContent): boolean {
  return node.type === 'mention' || !!node.content?.some(hasMention)
}

async function submit() {
  if (busy.value || isEmpty()) return
  busy.value = true
  error.value = false
  try {
    await props.send(editor.value.getJSON())
    if (!editor.value.isDestroyed) editor.value.commands.clearContent(true)
  }
  catch (e) {
    console.error('[comments]', e)
    error.value = true
  }
  finally {
    busy.value = false
  }
}

defineExpose({ editor, submit })
</script>

<template>
  <div class="me-comment-composer" :class="{ 'is-busy': busy }">
    <div class="me-comment-field">
      <EditorContent :editor="editor" />
      <span v-if="empty" class="me-comment-placeholder">{{ placeholder }}</span>
    </div>
    <p v-if="error" class="me-comment-error" role="alert">
      {{ m.failed }}
    </p>
    <div class="me-comment-actions">
      <button v-if="cancellable" type="button" class="me-btn" @click="emit('cancel')">
        {{ m.cancel }}
      </button>
      <button type="button" class="me-btn me-btn--primary" :disabled="busy || empty" @click="submit">
        {{ submitLabel }}
      </button>
    </div>
  </div>
</template>
