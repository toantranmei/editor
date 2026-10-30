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
 * Renders the Y.Doc into the editor once, when the editor view is created.
 *
 * Without a `mapping`, y-tiptap's sync plugin re-renders the whole document (and dispatches a
 * transaction) every time plugin views are re-created, i.e. on every `editor.registerPlugin()`
 * (drag handle, bubble menus…). That dispatch runs while ProseMirror is still creating plugin
 * views, so the view re-creates them a second time: every plugin view after the sync plugin
 * exists twice. The Yjs undo plugin's view is one of them, and when both copies are destroyed
 * the undo manager loses itself from its tracked origins, so undo steps are never recorded on
 * the redo stack — redo never works (KS-BUG-10). The nested render was also overwritten by the
 * state update around it, leaving the binding's mapping pointing at stale nodes (the first local
 * edit after mount was reverted). Passing our own `mapping` turns those re-renders off; this
 * plugin does the first render instead.
 */
const firstRender = Extension.create({
  name: 'meiCollaborationFirstRender',
  addProseMirrorPlugins() {
    let rendered = false
    return [new Plugin({
      key: new PluginKey('meiCollaborationFirstRender'),
      view: (view) => {
        if (!rendered) {
          rendered = true
          const binding = (ySyncPluginKey.getState(view.state) as { binding?: { _forceRerender?: () => void } } | undefined)?.binding
          binding?._forceRerender?.()
        }
        return {}
      },
    })]
  },
})

/**
 * Tiptap extensions for a collaborative editor: Yjs sync + Yjs undo (Mod-z / Mod-Shift-z / Mod-y).
 * Use with `createExtensions({ ..., undoRedo: false })` — the built-in history must be off.
 * Kept in its own module (`@toantranmei/editor/collaboration`) so editors without collaboration never load Yjs.
 */
export function collaborationExtensions(options: MeiCollaboration): AnyExtension[] {
  return [
    Collaboration.configure({
      document: options.document,
      field: options.field ?? 'default',
      ySyncOptions: { mapping: new Map() },
    }),
    firstRender,
  ]
}

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
