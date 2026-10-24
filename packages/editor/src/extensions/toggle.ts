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

  // Tiptap's node view doesn't re-render attributes on update; keep level and block
  // colors in sync so changing them shows without a reload.
  addNodeView() {
    const parent = this.parent?.()
    if (!parent) return null
    return (props) => {
      const view = parent(props)
      const dom = view.dom as HTMLElement
      const sync = (attrs: Record<string, any>) => {
        for (const [data, value] of [['data-level', attrs.level], ['data-text-color', attrs.blockColor], ['data-bg-color', attrs.blockBg]]) {
          if (value) dom.setAttribute(data, String(value))
          else dom.removeAttribute(data)
        }
      }
      const update = view.update?.bind(view)
      return Object.assign(view, {
        update: (node: Parameters<NonNullable<typeof update>>[0], ...rest: any[]) => {
          const ok = update ? (update as any)(node, ...rest) : node.type === props.node.type
          if (ok) sync(node.attrs)
          return ok
        },
      })
    }
  },
}).configure({ persist: true, HTMLAttributes: { class: 'me-toggle' } })

export const toggleExtensions = [ToggleDetails, DetailsSummary, DetailsContent]
