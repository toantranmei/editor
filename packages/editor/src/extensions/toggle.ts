import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details'

/**
 * Toggle (collapsible) block. `level` turns the summary into a heading, which is how
 * Notion's toggle headings work: the heading's content folds under it.
 */
export const ToggleDetails = Details.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      level: {
        default: null,
        parseHTML: el => Number(el.getAttribute('data-level')) || null,
        renderHTML: attrs => (attrs.level ? { 'data-level': attrs.level } : {}),
      },
    }
  },
}).configure({ persist: true, HTMLAttributes: { class: 'me-toggle' } })

export const toggleExtensions = [ToggleDetails, DetailsSummary, DetailsContent]
