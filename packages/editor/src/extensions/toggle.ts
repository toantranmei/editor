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
  //
  // Upstream also opens a toggle created open with a deferred *flip*
  // (`setTimeout(() => toggleDetailsContent())`). If update() runs before that timer
  // (any transaction touching the toggle right after it renders, e.g. typing inside a
  // nested toggle), update() opens it and the timer closes it again: an open toggle shows
  // closed although the document says `open: true`. So until that timer has fired we only
  // remember the latest node, then settle the DOM on its `open` attribute (set, not flip).
  // Remove once upstream sets the value instead of toggling (it still flips in
  // @tiptap/extension-details 3.32.0 through 3.32.2). Covered by test/toggle.test.ts.
  addNodeView() {
    const parent = this.parent?.()
    if (!parent) return null
    return (props) => {
      const view = parent(props)
      type PMNode = typeof props.node
      const upstreamUpdate = view.update?.bind(view) as ((node: PMNode, ...rest: any[]) => boolean) | undefined
      let latest = props.node
      let openPending = Boolean(props.node.attrs.open) && !!upstreamUpdate
      if (openPending) {
        // Queued after upstream's timer (same delay, FIFO), so it runs right after the flip.
        setTimeout(() => {
          openPending = false
          upstreamUpdate?.(latest)
        })
      }
      const dom = view.dom as HTMLElement
      const sync = (attrs: Record<string, any>) => {
        for (const [data, value] of [['data-level', attrs.level], ['data-text-color', attrs.blockColor], ['data-bg-color', attrs.blockBg]]) {
          if (value) dom.setAttribute(data, String(value))
          else dom.removeAttribute(data)
        }
      }
      return Object.assign(view, {
        update: (node: PMNode, ...rest: any[]) => {
          const ok = upstreamUpdate && !openPending ? upstreamUpdate(node, ...rest) : node.type === props.node.type
          if (ok && openPending) latest = node
          if (ok) sync(node.attrs)
          return ok
        },
      })
    }
  },
}).configure({ persist: true, HTMLAttributes: { class: 'me-toggle' } })

export const toggleExtensions = [ToggleDetails, DetailsSummary, DetailsContent]
