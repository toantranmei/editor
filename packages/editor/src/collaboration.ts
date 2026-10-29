import type { AnyExtension } from '@tiptap/core'
import Collaboration from '@tiptap/extension-collaboration'
import type * as Y from 'yjs'

/**
 * `<MeiEditor :collaboration>`: the editor reads and writes a Yjs document instead of `v-model`.
 * Read once, at mount (like `blocks`).
 */
export interface MeiCollaboration {
  /** The shared document. It is the source of truth: `modelValue` is never loaded into it. */
  document: Y.Doc
  /** Name of the `Y.XmlFragment` in `document` that holds the editor content. Default `'default'`. */
  field?: string
  // Reserved: presence (`CollaborationCaret`: provider + user) will be added here.
}

/**
 * Tiptap extensions for a collaborative editor: Yjs sync + Yjs undo (Mod-z / Mod-Shift-z / Mod-y).
 * Use with `createExtensions({ ..., undoRedo: false })` — the built-in history must be off.
 * Kept in its own module (`@toantranmei/editor/collaboration`) so editors without collaboration never load Yjs.
 */
export function collaborationExtensions(options: MeiCollaboration): AnyExtension[] {
  return [Collaboration.configure({ document: options.document, field: options.field ?? 'default' })]
}
