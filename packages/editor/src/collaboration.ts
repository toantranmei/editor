import { type AnyExtension, Extension, type JSONContent } from '@tiptap/core'
import Collaboration from '@tiptap/extension-collaboration'
import type { Schema } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProsemirrorJSON, ySyncPluginKey } from '@tiptap/y-tiptap'
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
  return [Collaboration.configure({ document: options.document, field: options.field ?? 'default' }), CollaborationResync]
}

/**
 * Plugins registered after the editor is created (bubble menu, drag handle…) reconfigure the
 * state, which re-creates every plugin view. The Yjs binding then re-renders the document from
 * inside that state update, and the result is overwritten by it: the binding's node mapping
 * points at nodes that are no longer in the document, and the next local edit is reverted.
 * Re-render once more right after any (re)configuration, outside the state update.
 */
const CollaborationResync = Extension.create({
  name: 'collaborationResync',
  addProseMirrorPlugins: () => [new Plugin({
    key: new PluginKey('meiCollaborationResync'),
    view: (view) => {
      queueMicrotask(() => {
        if (view.isDestroyed) return
        const binding = (ySyncPluginKey.getState(view.state) as { binding?: { _forceRerender?: () => void } } | undefined)?.binding
        binding?._forceRerender?.()
      })
      return {}
    },
  })],
})

/**
 * Replaces the content of `document` (its `field` fragment) with `content`, in one Yjs
 * transaction. Use it to seed a new shared document, e.g. a synced block created from
 * existing blocks. `schema` is the editor's (`editor.schema`); invalid content throws.
 */
export function fillDocument(document: Y.Doc, content: JSONContent, schema: Schema, field = 'default'): void {
  const fragment = document.getXmlFragment(field)
  document.transact(() => {
    if (fragment.length) fragment.delete(0, fragment.length)
    prosemirrorJSONToYXmlFragment(schema, content, fragment)
  })
}

/** The content of `document` as editor JSON (`{ type: 'doc', content }`), e.g. for `renderHTML`. */
export function documentToJSON(document: Y.Doc, field = 'default'): JSONContent {
  return yXmlFragmentToProsemirrorJSON(document.getXmlFragment(field)) as JSONContent
}
