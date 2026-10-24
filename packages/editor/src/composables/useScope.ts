import type { Editor } from '@tiptap/core'
import { computed } from 'vue'

/**
 * Theme scope attributes (mode class + overrides id) for elements rendered outside
 * the editor root, e.g. popovers teleported to <body>. Use with `v-bind`.
 */
export function useScope(editor: () => Editor | undefined) {
  return computed(() => editor()?.storage.meiConfig?.scope ?? { 'class': ['me-scope'], 'data-me-id': '' })
}
