import { TableCell, TableHeader, TableKit } from '@tiptap/extension-table'

/** Background color by palette name (`data-color`), so themes and dark mode apply. */
const colorAttr = {
  color: {
    default: null,
    parseHTML: (el: HTMLElement) => el.getAttribute('data-color'),
    renderHTML: (attrs: Record<string, any>) => (attrs.color ? { 'data-color': attrs.color } : {}),
  },
}

// Cells hold paragraphs only (like Notion's simple tables): no images, lists or columns
// nested in cells, which made tables hard to use.
const ColoredCell = TableCell.extend({
  content: 'paragraph+',
  addAttributes() {
    return { ...this.parent?.(), ...colorAttr }
  },
})
const ColoredHeader = TableHeader.extend({
  content: 'paragraph+',
  addAttributes() {
    return { ...this.parent?.(), ...colorAttr }
  },
})

export const tableExtensions = [
  // allowTableNodeSelection: the whole table can be selected as a block (drag handle, block menu, Delete). Without it
  // prosemirror-tables turns that selection into one of its cells, so a drag copied the table (only the cells' text
  // was removed) and Delete emptied the cells instead of removing the table.
  TableKit.configure({ table: { resizable: true, allowTableNodeSelection: true }, tableCell: false, tableHeader: false }),
  ColoredCell,
  ColoredHeader,
]
