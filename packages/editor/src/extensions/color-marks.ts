import { Extension, Mark, mergeAttributes } from '@tiptap/core'

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

/** Blocks that take a whole-block color (Notion's block menu / "/red" colors). */
export const COLORABLE_BLOCKS = ['paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'taskList', 'listItem', 'taskItem', 'details']

/**
 * Whole-block text/background color, stored by palette name as `blockColor` / `blockBg`.
 * Renders the same `data-text-color` / `data-bg-color` attributes as the marks, so one
 * set of palette rules styles both. New blocks split off with Enter start uncolored.
 */
export const BlockColor = Extension.create({
  name: 'blockColor',
  addGlobalAttributes() {
    const attr = (data: string) => ({
      default: null,
      keepOnSplit: false,
      parseHTML: (el: HTMLElement) => (el.tagName === 'SPAN' || el.tagName === 'MARK' ? null : el.getAttribute(data)),
    })
    return [{
      types: COLORABLE_BLOCKS,
      attributes: {
        blockColor: { ...attr('data-text-color'), renderHTML: a => (a.blockColor ? { 'data-text-color': a.blockColor } : {}) },
        blockBg: { ...attr('data-bg-color'), renderHTML: a => (a.blockBg ? { 'data-bg-color': a.blockBg } : {}) },
      },
    }]
  },
})
