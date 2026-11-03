import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { computed, onBeforeUnmount, ref, watchEffect } from 'vue'
import { pendingUpload, uploadStaleAt, uploadState } from '../extensions/file-drop'

/**
 * Upload state of an image / file node view (`uploadState`), re-evaluated when an `uploading` node without a local
 * file becomes stale (shown as interrupted).
 */
export function useUploadState(editor: Editor, node: () => PMNode) {
  const now = ref(Date.now())
  let timer: ReturnType<typeof setTimeout> | null = null
  const stop = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }
  const pending = computed(() => pendingUpload(editor, node().attrs.uploadId))
  const state = computed(() => uploadState(editor, node().attrs, now.value))
  watchEffect(() => {
    stop()
    if (state.value !== 'remote') return
    const at = uploadStaleAt(editor, node().attrs, now.value)
    timer = setTimeout(() => (now.value = Date.now()), Math.max(0, at - now.value) + 50)
  })
  onBeforeUnmount(stop)
  return { pending, state }
}
