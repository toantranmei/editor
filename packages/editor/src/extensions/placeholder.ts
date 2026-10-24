import { type Editor, Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export interface PlaceholderOptions {
  /** Hint for an empty text block, e.g. "Type '/' for commands". */
  placeholder: string | ((props: { editor: Editor, node: PMNode, pos: number }) => string)
}

export const placeholderPluginKey = new PluginKey('mePlaceholder')

/**
 * "Type '/'…" hint on the empty text block holding the cursor, at any depth (inside
 * lists, callouts, toggles, columns). Renders `class="is-empty"` and `data-placeholder`;
 * `is-editor-empty` is added when the whole document is empty.
 *
 * Replaces Tiptap's Placeholder: with `includeChildren` it keeps an incremental
 * decoration set whose rescan ranges are off by one, so hints stayed on blocks the
 * cursor had left (moving up through empty lines showed one on each). Only the
 * cursor's block can show a hint, so it's computed from the selection on every render:
 * no stored state to go stale, and O(1) whatever the document size.
 */
export const Placeholder = Extension.create<PlaceholderOptions>({
  name: 'placeholder',

  addOptions: () => ({ placeholder: '' }),

  addProseMirrorPlugins() {
    const { editor, options } = this
    return [new Plugin({
      key: placeholderPluginKey,
      props: {
        decorations: ({ doc, selection }) => {
          if (!editor.isEditable) return null
          const { $anchor } = selection
          const node = $anchor.parent
          if ($anchor.depth === 0 || !node.isTextblock || node.content.size > 0) return null
          const pos = $anchor.before()
          const text = typeof options.placeholder === 'function' ? options.placeholder({ editor, node, pos }) : options.placeholder
          return DecorationSet.create(doc, [Decoration.node(pos, pos + node.nodeSize, {
            'class': editor.isEmpty ? 'is-empty is-editor-empty' : 'is-empty',
            'data-placeholder': text,
          })])
        },
      },
    })]
  },
})
