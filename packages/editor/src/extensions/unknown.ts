import { Node } from '@tiptap/core'
import { NodeSelection, Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'

/**
 * Placeholders for content whose block type isn't loaded in this editor (e.g. a doc
 * written where `math` was enabled). The original JSON is kept in `data` and restored
 * on output, so nothing is lost; the block can be moved or deleted but not edited.
 */
function placeholder(name: string, inline: boolean) {
  return Node.create({
    name,
    group: inline ? 'inline' : 'block',
    inline,
    atom: true,
    selectable: true,
    draggable: !inline,

    addAttributes() {
      return {
        data: {
          default: null,
          parseHTML: el => JSON.parse(el.getAttribute('data-json') || 'null'),
          renderHTML: attrs => ({ 'data-json': JSON.stringify(attrs.data) }),
        },
        /** True when the block type is known but its content was invalid. */
        invalid: { default: false, rendered: false },
      }
    },

    parseHTML() {
      return [{ tag: `${inline ? 'span' : 'div'}[data-type="${name}"]` }]
    },

    renderHTML({ HTMLAttributes }) {
      return [inline ? 'span' : 'div', { ...HTMLAttributes, 'data-type': name }]
    },

    addProseMirrorPlugins() {
      // Typing while the placeholder is selected would replace it (and lose its data);
      // put the text in a new paragraph after it instead. Deleting still works on purpose.
      return [new Plugin({
        key: new PluginKey(`${name}Guard`),
        props: {
          handleTextInput: (view, _from, _to, text) => {
            const sel = view.state.selection
            if (!(sel instanceof NodeSelection) || sel.node.type.name !== name) return false
            const tr = view.state.tr
            if (inline) {
              tr.setSelection(TextSelection.create(tr.doc, sel.to)).insertText(text)
            }
            else {
              const paragraph = view.state.schema.nodes.paragraph!.create(null, view.state.schema.text(text))
              tr.insert(sel.to, paragraph).setSelection(TextSelection.create(tr.doc, sel.to + 1 + text.length))
            }
            view.dispatch(tr.scrollIntoView())
            return true
          },
        },
      })]
    },

    addNodeView() {
      return ({ node, editor }) => {
        const dom = document.createElement(inline ? 'span' : 'div')
        dom.className = inline ? 'me-unknown me-unknown--inline' : `me-unknown${node.attrs.invalid ? ' is-invalid' : ''}`
        dom.contentEditable = 'false'
        const m = editor.storage.meiConfig?.messages
        const label = node.attrs.invalid ? (m?.invalidBlock ?? 'Invalid block') : (m?.unknownBlock ?? 'Unsupported block')
        dom.textContent = `${label}: ${node.attrs.data?.type ?? '?'}`
        return { dom }
      }
    },
  })
}

export const UnknownBlock = placeholder('unknownBlock', false)
export const UnknownInline = placeholder('unknownInline', true)
