import type { BlockRenderers, NodeRenderer, RenderBlock } from '@toantranmei/editor/render'
import { pageMessages } from './messages'
import type { PageBlockOptions } from './types'

type RenderOptions = Pick<PageBlockOptions, 'href' | 'messages'>

/**
 * Static HTML for `pageLink` (used by `renderHTML` from `@toantranmei/editor/render`).
 * Title, icon and URL come from the render option `resolveLink(pageId)`; without it the
 * block's `href` option gives the URL and the title shows as "Untitled".
 * `null` from `resolveLink` renders the "not found / no access" row, without a link.
 */
export function pageLinkRenderers(options: Partial<RenderOptions> = {}): BlockRenderers {
  const pageLink: NodeRenderer = (node, ctx) => {
    const m = pageMessages(ctx.locale, options.messages)
    const pageId = typeof node.attrs?.pageId === 'string' ? node.attrs.pageId : null
    const resolved = !pageId
      ? null
      : ctx.options.resolveLink
        ? ctx.options.resolveLink(pageId)
        : options.href ? { href: options.href(pageId), title: null, icon: null } : null
    const href = resolved ? ctx.safeUrl(resolved.href, 'link') : null
    const missing = !resolved
    const title = resolved?.title?.trim() || ''
    const label = missing ? m.notFound : title || m.untitled
    const icon = missing
      ? ctx.icon('fileQuestion')
      : resolved.icon ? `<span class="me-page-link-emoji">${ctx.escape(resolved.icon)}</span>` : ctx.icon('fileText')
    const cls = `me-page-link${missing ? ' is-missing' : ''}`
    const row = `<span class="me-page-link-icon" aria-hidden="true">${icon}</span><span class="me-page-link-title${missing || !title ? ' is-muted' : ''}">${ctx.escape(label)}</span>`
    const aria = ctx.attr('aria-label', m.openPage.replace('{title}', label))
    return `<div class="${cls}" data-type="page-link"${ctx.attr('data-page-id', pageId)}${ctx.blockAttrs(node)}>`
      + (href ? `<a class="me-page-link-row"${ctx.attr('href', href)}${aria}>${row}</a>` : `<a class="me-page-link-row" aria-disabled="true"${aria}>${row}</a>`)
      + '</div>'
  }
  return { nodes: { pageLink } }
}

/**
 * Render-only stand-in for `pageBlock`, for servers that don't load the editor's Vue code:
 * `renderHTML(doc, { blocks: [pageBlockRender], resolveLink })`.
 */
export const pageBlockRender: RenderBlock = { name: 'page', render: pageLinkRenderers() }
