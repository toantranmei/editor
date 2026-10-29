/**
 * `@toantranmei/editor/render`: editor JSON → static HTML, on the server or in the browser.
 *
 * No DOM, no Vue, no ProseMirror schema: a single pass over the JSON that emits the same
 * markup and `me-*` classes as the editor's node views, so `@toantranmei/editor/style.css`
 * styles it like a read-only editor. Every text and attribute is escaped, URLs are
 * allow-listed (see `safeUrl`), embeds and HTML blocks are sandboxed iframes.
 */
import type { JSONContent } from '@tiptap/core'
import { resolveMessages, type LocaleName } from '../locale'
import { builtinMarks, builtinNodes, collectHeadings, type HeadingEntry } from './nodes'
import { attr, escapeHtml, safeUrl } from './html'
import { icon } from './icons'
import type { JSONMark, KatexLike, MarkRenderer, NodeRenderer, RenderContext, RenderOptions } from './types'

export type {
  BlockRenderers, JSONMark, KatexLike, MarkRenderer, MentionTarget, NodeRenderer, RenderBlock, RenderContext,
  RenderOptions, ResolvedLink, UrlKind,
} from './types'
export { attr, escapeHtml, safeUrl } from './html'
export { highlightCode } from './highlight'
export { hydrateMermaid, type HydrateMermaidOptions } from './mermaid'
import { baseTokensCss, overridesCss } from '../theme/css'
import type { ThemeTokens } from '../theme/tokens'

export { baseTokensCss, overridesCss }

/** Per-render state shared by the built-in renderers. */
export interface RenderState {
  headings: HeadingEntry[]
  anchorOf: WeakMap<JSONContent, string>
  katex: KatexLike | null
  htmlOptions: { network: boolean | string[], defaultHeight: number }
}

const BLOCK_COLOR = /^[a-z]+$/

/**
 * Renders editor JSON (`editor.getJSON()`, or ProseMirror JSON from the server) to HTML.
 * Synchronous and DOM-free; pass `katex` to render equations (or use `renderHTMLAsync`).
 *
 * @example
 * import { renderHTML } from '@toantranmei/editor/render'
 * const html = renderHTML(doc, { locale: 'vi', blocks: [pageBlockRender], resolveLink: id => ({ href: `/p/${id}`, title }) })
 */
export function renderHTML(doc: JSONContent | null | undefined, options: RenderOptions = {}): string {
  const locale: LocaleName = options.locale ?? 'vi'
  const blocks = options.blocks ?? []
  const messages = resolveMessages(locale, ...blocks.map(b => (b as { messages?: Record<string, any> }).messages?.[locale]), options.messages)

  const nodes: Record<string, NodeRenderer> = { ...builtinNodes }
  const marks: Record<string, MarkRenderer> = { ...builtinMarks }
  for (const b of blocks) {
    Object.assign(nodes, b.render?.nodes)
    Object.assign(marks, b.render?.marks)
  }
  const htmlBlock = blocks.find(b => b.name === 'html')?.options ?? {}
  const { headings, anchorOf } = collectHeadings(doc)
  const state: RenderState = {
    headings,
    anchorOf,
    katex: options.katex ?? null,
    htmlOptions: { network: htmlBlock.network ?? false, defaultHeight: htmlBlock.defaultHeight ?? 400 },
  }

  const renderInline = (node: JSONContent): string => {
    let out = escapeHtml(node.text ?? '')
    const list = (node.marks ?? []) as JSONMark[]
    for (let i = list.length - 1; i >= 0; i--) {
      const mark = list[i]!
      const fn = marks[mark.type]
      out = fn ? fn(mark, out, ctx) : out
    }
    return out
  }

  const render = (node: JSONContent): string => {
    if (!node || typeof node !== 'object') return ''
    if (node.type === 'text') return renderInline(node)
    const fn = node.type ? nodes[node.type] : undefined
    if (fn) return fn(node, ctx)
    // Unknown type: keep its content visible, drop the wrapper's semantics.
    return node.content?.length ? `<div${attr('data-type', node.type)}${blockAttrs(node)}>${children(node)}</div>` : ''
  }

  const children = (node: JSONContent): string => {
    const list = node.content
    if (!list?.length) return ''
    let out = ''
    for (const child of list) out += render(child)
    return out
  }

  const blockAttrs = (node: JSONContent): string => {
    const a = node.attrs
    if (!a) return ''
    let out = attr('data-id', a.id)
    if (typeof a.blockColor === 'string' && BLOCK_COLOR.test(a.blockColor)) out += ` data-text-color="${a.blockColor}"`
    if (typeof a.blockBg === 'string' && BLOCK_COLOR.test(a.blockBg)) out += ` data-bg-color="${a.blockBg}"`
    return out
  }

  const text = (node: JSONContent): string => {
    if (node.type === 'text') return node.text ?? ''
    if (node.type === 'hardBreak') return '\n'
    return (node.content ?? []).map(text).join('')
  }

  const ctx: RenderContext & { state: RenderState } = {
    locale,
    messages,
    options,
    children,
    render,
    blockAttrs,
    escape: escapeHtml,
    attr,
    safeUrl,
    text,
    icon: name => icon(name),
    state,
  }

  const body = doc ? render(doc.type ? doc : { type: 'doc', content: [] }) : ''
  if (options.wrap === false) return body
  const theme = options.theme === 'light' ? ' me-light' : options.theme === 'dark' ? ' me-dark' : ''
  const extra = options.className ? ` ${escapeHtml(options.className)}` : ''
  return `<div class="me-scope me-root me-render${theme}${extra}"><div class="me-content">${body}</div></div>`
}

/** True when the document contains equations (math blocks or inline math). */
export function hasMath(doc: JSONContent | null | undefined): boolean {
  if (!doc) return false
  if (doc.type === 'mathBlock' || doc.type === 'mathInline') return true
  return doc.content?.some(hasMath) ?? false
}

let katexPromise: Promise<KatexLike | null> | null = null

/**
 * Like `renderHTML`, but loads KaTeX (optional peer `katex`) when the document has math
 * and `options.katex` isn't given. Falls back to TeX source if KaTeX isn't installed.
 */
export async function renderHTMLAsync(doc: JSONContent | null | undefined, options: RenderOptions = {}): Promise<string> {
  if (options.katex === undefined && hasMath(doc)) {
    katexPromise ??= import('katex').then(m => (m.default ?? m) as KatexLike).catch(() => null)
    return renderHTML(doc, { ...options, katex: await katexPromise })
  }
  return renderHTML(doc, options)
}

/**
 * `<style id="mei-editor-tokens">` with the editor's default design tokens (light + dark).
 * The editor injects them at runtime; server-rendered pages put this in `<head>` (next to
 * `style.css`). A `<MeiEditor>` mounted later on the page reuses it instead of adding another.
 * `overrides` (token overrides) are appended, unlayered, for `.me-scope`.
 */
export function renderTokensStyle(overrides?: ThemeTokens): string {
  const css = [baseTokensCss(), overridesCss(overrides)].filter(Boolean).join('\n').replace(/<\/style/gi, '<\\/style')
  return `<style id="mei-editor-tokens">${css}</style>`
}
