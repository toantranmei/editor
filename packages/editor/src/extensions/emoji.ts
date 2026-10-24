import { Extension } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import Suggestion from '@tiptap/suggestion'
import EmojiMenu from '../components/EmojiMenu.vue'
import { type EmojiEntry, loadEmojis, searchEmojis } from '../emoji-data'
import { suggestionRenderer } from './suggestion-renderer'

export const emojiPluginKey = new PluginKey('emoji')

/** Type `:` + a word (e.g. `:smile`, `:cười`) to insert an emoji as text. */
export const EmojiSuggestion = Extension.create({
  name: 'emojiSuggestion',

  addProseMirrorPlugins() {
    return [
      Suggestion<EmojiEntry>({
        editor: this.editor,
        pluginKey: emojiPluginKey,
        char: ':',
        allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
        items: async ({ query, editor }) => {
          // Wait for 2 letters so "10:30" or "Note:" doesn't pop the menu.
          if (query.length < 2) return []
          return searchEmojis(await loadEmojis(editor.storage.meiConfig.locale), query, 48)
        },
        command: ({ editor, range, props }) => {
          editor.chain().focus().insertContentAt(range, `${props.unicode} `).run()
        },
        // The menu hides itself while there are no matches; a space ends the suggestion.
        render: suggestionRenderer<EmojiEntry>(EmojiMenu, emojiPluginKey),
      }),
    ]
  },
})
