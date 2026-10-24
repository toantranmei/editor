import { Mark, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textColor: {
      /** Sets a palette color by name (`'red'`, `'blue'`…); `null`/`'default'` removes it. */
      setTextColor: (color: string | null) => ReturnType
    }
    bgColor: {
      setBgColor: (color: string | null) => ReturnType
    }
  }
}

const isDefault = (color: string | null) => !color || color === 'default'

/** Text color stored by palette name, so themes and dark mode can restyle it. */
export const TextColor = Mark.create({
  name: 'textColor',
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: el => el.getAttribute('data-text-color'),
        renderHTML: attrs => ({ 'data-text-color': attrs.color }),
      },
    }
  },
  parseHTML() {
    return [{ tag: 'span[data-text-color]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0]
  },
  addCommands() {
    return {
      setTextColor: color => ({ commands }) =>
        isDefault(color) ? commands.unsetMark(this.name) : commands.setMark(this.name, { color }),
    }
  },
})

/** Background (highlight) color stored by palette name. */
export const BgColor = Mark.create({
  name: 'bgColor',
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: el => el.getAttribute('data-bg-color'),
        renderHTML: attrs => ({ 'data-bg-color': attrs.color }),
      },
    }
  },
  parseHTML() {
    return [{ tag: 'mark[data-bg-color]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['mark', mergeAttributes(HTMLAttributes), 0]
  },
  addCommands() {
    return {
      setBgColor: color => ({ commands }) =>
        isDefault(color) ? commands.unsetMark(this.name) : commands.setMark(this.name, { color }),
    }
  },
})
