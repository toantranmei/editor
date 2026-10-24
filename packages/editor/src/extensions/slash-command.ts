import { Extension } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import Suggestion from '@tiptap/suggestion'
import SlashMenu from '../components/SlashMenu.vue'
import { type SlashItem, slashItems } from '../slash-items'
import { suggestionRenderer } from './suggestion-renderer'

export const slashPluginKey = new PluginKey('slashCommand')

export const SlashCommand = Extension.create({
  name: 'slashCommand',
  // Above list/task keymaps, so Enter picks a menu item instead of splitting the item.
  priority: 200,

  addProseMirrorPlugins() {
    let lastMatch = 0
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        pluginKey: slashPluginKey,
        char: '/',
        // Multi-word names ("tiêu đề 2", "nền vàng") need spaces; see onUpdate for closing.
        allowSpaces: true,
        // Not inside code blocks, nor table cells (cells are text-only).
        allow: ({ state, range }) => {
          const $pos = state.doc.resolve(range.from)
          if ($pos.parent.type.spec.code) return false
          for (let d = $pos.depth; d > 0; d--) {
            if (['tableCell', 'tableHeader'].includes($pos.node(d).type.name)) return false
          }
          return true
        },
        items: ({ query, editor }) => slashItems(editor, query),
        command: ({ editor, range, props: item }) => {
          editor.chain().focus().deleteRange(range).run()
          item.apply(editor)
        },
        render: suggestionRenderer<SlashItem>(SlashMenu, slashPluginKey, {
          onStart: () => (lastMatch = 0),
          // Smart close (like Notion): stop once the user is clearly just typing text —
          // no results and a space, or 3+ chars past the last match. props.items is
          // briefly empty while items load, so count matches directly.
          onUpdate: (props) => {
            if (slashItems(props.editor, props.query).length) lastMatch = props.query.length
            else if (props.query.endsWith(' ') || props.query.length - lastMatch >= 3) return false
          },
        }),
      }),
    ]
  },
})
