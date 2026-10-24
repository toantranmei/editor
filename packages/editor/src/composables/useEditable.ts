import type { Editor } from '@tiptap/core'
import { onBeforeUnmount, readonly, ref } from 'vue'

/**
 * `editor.isEditable` as a Vue ref. The editor's flag isn't reactive, so node views
 * would keep showing edit controls after switching to read-only (setEditable emits
 * an update, which is what we listen to).
 */
export function useEditable(editor: Editor) {
  const editable = ref(editor.isEditable)
  const sync = () => {
    if (editable.value !== editor.isEditable) editable.value = editor.isEditable
  }
  editor.on('update', sync)
  onBeforeUnmount(() => editor.off('update', sync))
  return readonly(editable)
}
