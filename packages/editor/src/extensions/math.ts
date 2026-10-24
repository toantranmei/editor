import { InputRule, mergeAttributes, Node } from '@tiptap/core'
import { blockNodeView } from '../nodeviews/renderer'
import MathView from '../nodeviews/MathView.vue'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    math: {
      insertMathBlock: (latex?: string) => ReturnType
      insertMathInline: (latex?: string) => ReturnType
    }
  }
}

const latexAttr = {
  latex: {
    default: '',
    parseHTML: (el: HTMLElement) => el.getAttribute('data-latex') ?? '',
    renderHTML: (attrs: Record<string, any>) => ({ 'data-latex': attrs.latex }),
  },
}

/** Display equation (KaTeX, loaded on first render). Type `$$ ` on an empty line. */
export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes: () => latexAttr,
  parseHTML: () => [{ tag: 'div[data-type="math-block"]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'math-block' })],
  addCommands() {
    return { insertMathBlock: (latex = '') => ({ commands }) => commands.insertContent({ type: this.name, attrs: { latex } }) }
  },
  addInputRules() {
    return [new InputRule({
      find: /^\$\$\s$/,
      handler: ({ range, chain }) => {
        chain().deleteRange(range).insertMathBlock().run()
      },
    })]
  },
  addNodeView: () => blockNodeView(MathView),
})

/** Inline equation. Type `$$x^2$$` (single `$` would catch prices like $5). */
export const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes: () => latexAttr,
  parseHTML: () => [{ tag: 'span[data-type="math-inline"]' }],
  renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'math-inline' })],
  renderText: ({ node }) => `$${node.attrs.latex}$`,
  addCommands() {
    return { insertMathInline: (latex = '') => ({ commands }) => commands.insertContent({ type: this.name, attrs: { latex } }) }
  },
  addInputRules() {
    return [new InputRule({
      find: /\$\$([^$\n]+)\$\$$/,
      handler: ({ state, range, match }) => {
        state.tr.replaceWith(range.from, range.to, this.type.create({ latex: match[1]!.trim() }))
      },
    })]
  },
  addNodeView: () => blockNodeView(MathView),
})
