import type { JSONContent } from '@tiptap/core'
import { type DateValue, formatDateValue } from '../date-utils'
import { toEmbedUrl } from '../extensions/embed-url'
import { HTML_MAX_HEIGHT, HTML_MIN_HEIGHT, htmlBlockDocument } from '../extensions/html-document'
import { highlightCode } from './highlight'
import { attr, escapeHtml, isExternal } from './html'
import type { RenderState } from './index'
import type { MarkRenderer, NodeRenderer, RenderContext } from './types'

type Ctx = RenderContext & { state: RenderState }
const st = (ctx: RenderContext) => (ctx as Ctx).state

export interface HeadingEntry { level: number, text: string, id: string }

const textOf = (node: JSONContent): string => {
  if (node.type === 'text') return node.text ?? ''
  return (node.content ?? []).map(textOf).join('')
}

const slug = (text: string) => text.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'section'

/**
 * Headings and toggle headings, in document order, with their anchor ids: the block id
 * (what "Copy link to block" uses) or, for documents without ids, a unique slug of the text.
 */
export function collectHeadings(doc: JSONContent | null | undefined) {
  const headings: HeadingEntry[] = []
  const anchorOf = new WeakMap<JSONContent, string>()
  const used = new Set<string>()
  const anchor = (node: JSONContent, text: string) => {
    let id = typeof node.attrs?.id === 'string' && node.attrs.id ? node.attrs.id : slug(text)
    if (used.has(id)) {
      let n = 2
      while (used.has(`${id}-${n}`)) n++
      id = `${id}-${n}`
    }
    used.add(id)
    anchorOf.set(node, id)
    return id
  }
  const visit = (node: JSONContent) => {
    if (node.type === 'heading') {
      const text = textOf(node)
      headings.push({ level: Number(node.attrs?.level) || 1, text, id: anchor(node, text) })
      return
    }
    if (node.type === 'details' && node.attrs?.level) {
      const text = node.content?.[0] ? textOf(node.content[0]) : ''
      headings.push({ level: Number(node.attrs.level) || 1, text, id: anchor(node, text) })
    }
    if (node.type === 'text' || !node.content) return
    for (const child of node.content) visit(child)
  }
  if (doc) visit(doc)
  return { headings, anchorOf }
}

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Number(value)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null)
const PALETTE = /^[a-z]+$/
const color = (value: unknown) => (typeof value === 'string' && PALETTE.test(value) ? value : null)

const wrapBlock = (tag: string, extra = '') => ((node, ctx) => `<${tag}${extra}${ctx.blockAttrs(node)}>${ctx.children(node)}</${tag}>`) as NodeRenderer

function linkAttrs(href: string, ctx: RenderContext) {
  const external = (ctx.options.externalLinksInNewTab ?? true) && isExternal(href)
  return `${attr('href', href)}${external ? ' target="_blank" rel="noopener noreferrer nofollow"' : ''}`
}

function renderMath(latex: string, display: boolean, ctx: RenderContext): string {
  const katex = st(ctx).katex
  if (katex) {
    try {
      // trust: false (default) keeps \href / \htmlClass and friends disabled.
      return katex.renderToString(latex, { displayMode: display, throwOnError: false, trust: false, strict: 'ignore', output: 'htmlAndMathml' })
    }
    catch {
      // fall through to the source
    }
  }
  return `<code class="me-math-source">${escapeHtml(latex)}</code>`
}

function fileSize(bytes: unknown): string {
  const n = Number(bytes)
  if (!n || !Number.isFinite(n) || n < 0) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`
}

const FILE_ICONS: Record<string, string> = { file: 'file', audio: 'audio', video: 'video' }

export const builtinNodes: Record<string, NodeRenderer> = {
  doc: (node, ctx) => ctx.children(node),
  paragraph: wrapBlock('p'),
  hardBreak: () => '<br>',
  heading: (node, ctx) => {
    const level = clamp(node.attrs?.level, 1, 6, 1)
    return `<h${level}${attr('id', st(ctx).anchorOf.get(node))}${ctx.blockAttrs(node)}>${ctx.children(node)}</h${level}>`
  },
  blockquote: wrapBlock('blockquote'),
  horizontalRule: (node, ctx) => `<hr${ctx.blockAttrs(node)}>`,
  bulletList: wrapBlock('ul'),
  orderedList: (node, ctx) => {
    const start = num(node.attrs?.start)
    return `<ol${start !== null && start !== 1 ? attr('start', Math.trunc(start)) : ''}${ctx.blockAttrs(node)}>${ctx.children(node)}</ol>`
  },
  listItem: wrapBlock('li'),
  taskList: wrapBlock('ul', ' data-type="taskList"'),
  taskItem: (node, ctx) => {
    const checked = !!node.attrs?.checked
    return `<li data-type="taskItem" data-checked="${checked}"${ctx.blockAttrs(node)}><label><input type="checkbox" tabindex="-1" aria-readonly="true"${checked ? ' checked' : ''}><span></span></label><div>${ctx.children(node)}</div></li>`
  },

  codeBlock: (node, ctx) => {
    const code = ctx.text(node)
    const raw = typeof node.attrs?.language === 'string' ? node.attrs.language : ''
    const language = /^[\w+#.-]{1,32}$/.test(raw) ? raw : 'plaintext'
    if (language === 'mermaid') {
      return `<div class="me-code-block me-mermaid-block"${ctx.blockAttrs(node)}><pre class="mermaid">${escapeHtml(code)}</pre></div>`
    }
    return `<div class="me-code-block"${ctx.blockAttrs(node)}><div class="me-block-bar me-code-toolbar"><span class="me-code-lang">${escapeHtml(language)}</span></div>`
      + `<pre><code class="hljs language-${escapeHtml(language)}">${highlightCode(code, language)}</code></pre></div>`
  },

  image: (node, ctx) => {
    const a = node.attrs ?? {}
    const src = ctx.safeUrl(a.src, 'media')
    if (!src) return ''
    const width = clamp(a.width, 1, 100, 100)
    const align = ['left', 'right'].includes(a.align) ? a.align : 'center'
    const crop = a.crop && typeof a.crop === 'object' ? a.crop : null
    const c = crop && [crop.x, crop.y, crop.w, crop.h, crop.ratio].every(v => num(v) !== null) && crop.w > 0 && crop.h > 0 && crop.ratio > 0 ? crop : null
    const imgStyle = c ? ` style="width:${100 / c.w}%;left:${(-c.x / c.w) * 100}%;top:${(-c.y / c.h) * 100}%"` : ''
    const caption = typeof a.caption === 'string' ? a.caption : ''
    const showCaption = (a.showCaption ?? !!caption) && caption
    return `<div class="me-media"${ctx.blockAttrs(node)}><figure class="me-figure me-figure--${align}" style="width:${width}%">`
      + `<div class="me-figure-frame"><div class="me-figure-media${c ? ' is-cropped' : ''}"${c ? ` style="aspect-ratio:${c.ratio}"` : ''}>`
      + `<img class="me-figure-img"${attr('src', src)}${attr('alt', a.alt ?? '')}${attr('title', a.title)} loading="lazy" decoding="async"${imgStyle}></div></div>`
      + `${showCaption ? `<figcaption class="me-caption">${escapeHtml(caption)}</figcaption>` : ''}</figure></div>`
  },

  embed: (node, ctx) => {
    const src = ctx.safeUrl(typeof node.attrs?.src === 'string' ? toEmbedUrl(node.attrs.src) : null, 'frame')
    if (!src) return ''
    const height = Math.round(clamp(node.attrs?.height, 50, 2000, 400))
    return `<div class="me-media"${ctx.blockAttrs(node)}><div class="me-embed"><iframe class="me-embed-frame"${attr('src', src)} height="${height}"`
      + ' sandbox="allow-scripts allow-same-origin allow-popups allow-presentation" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe></div></div>'
  },

  callout: (node, ctx) => {
    const icon = typeof node.attrs?.icon === 'string' ? node.attrs.icon : '💡'
    return `<div class="me-callout" data-type="callout"${attr('data-color', color(node.attrs?.color) ?? 'gray')}${ctx.blockAttrs(node)}>`
      + `<div class="me-callout-icon-wrap"><span class="me-callout-icon">${escapeHtml(icon)}</span></div>`
      + `<div class="me-callout-content">${ctx.children(node)}</div></div>`
  },

  details: (node, ctx) => {
    const level = node.attrs?.level ? clamp(node.attrs.level, 1, 3, 1) : null
    return `<details class="me-toggle" data-type="details"${attr('id', st(ctx).anchorOf.get(node))}${level ? ` data-level="${level}"` : ''}${node.attrs?.open ? ' open' : ''}${ctx.blockAttrs(node)}>${ctx.children(node)}</details>`
  },
  detailsSummary: (node, ctx) => `<summary${ctx.blockAttrs(node)}><span class="me-toggle-arrow" aria-hidden="true"></span><span class="me-toggle-title">${ctx.children(node)}</span></summary>`,
  detailsContent: (node, ctx) => `<div data-type="detailsContent">${ctx.children(node)}</div>`,

  table: (node, ctx) => {
    const first = node.content?.[0]?.content ?? []
    const cols: (number | null)[] = []
    for (const cell of first) {
      const span = clamp(cell.attrs?.colspan, 1, 100, 1)
      const widths = Array.isArray(cell.attrs?.colwidth) ? cell.attrs.colwidth : []
      for (let i = 0; i < span; i++) cols.push(num(widths[i]))
    }
    const colgroup = cols.some(w => w !== null)
      ? `<colgroup>${cols.map(w => (w !== null ? `<col style="width:${Math.max(1, Math.round(w))}px">` : '<col>')).join('')}</colgroup>`
      : ''
    return `<div class="tableWrapper"${ctx.blockAttrs(node)}><table>${colgroup}<tbody>${ctx.children(node)}</tbody></table></div>`
  },
  tableRow: (node, ctx) => `<tr>${ctx.children(node)}</tr>`,
  tableHeader: (node, ctx) => cell('th', node, ctx),
  tableCell: (node, ctx) => cell('td', node, ctx),

  columns: (node, ctx) => `<div class="me-columns" data-type="columns" style="--cols:${node.content?.length ?? 2}"${ctx.blockAttrs(node)}>${ctx.children(node)}</div>`,
  column: (node, ctx) => `<div class="me-column" data-type="column">${ctx.children(node)}</div>`,

  tableOfContents: (node, ctx) => {
    const { headings } = st(ctx)
    if (!headings.length) return ''
    const min = Math.min(...headings.map(h => h.level), 4)
    const items = headings.map(h => `<a class="me-toc-item" data-depth="${h.level - min}" href="#${encodeURIComponent(h.id)}">${escapeHtml(h.text || ctx.messages.toc.untitled)}</a>`).join('')
    return `<nav class="me-toc"${attr('aria-label', ctx.messages.toc.title)}${ctx.blockAttrs(node)}>${items}</nav>`
  },

  mathBlock: (node, ctx) => {
    const latex = typeof node.attrs?.latex === 'string' ? node.attrs.latex : ''
    if (!latex.trim()) return ''
    return `<div class="me-math-block" data-type="math-block"${ctx.blockAttrs(node)}><span class="me-math-render">${renderMath(latex, true, ctx)}</span></div>`
  },
  mathInline: (node, ctx) => {
    const latex = typeof node.attrs?.latex === 'string' ? node.attrs.latex : ''
    if (!latex.trim()) return ''
    return `<span class="me-math-inline" data-type="math-inline"><span class="me-math-render">${renderMath(latex, false, ctx)}</span></span>`
  },

  fileBlock: (node, ctx) => {
    const a = node.attrs ?? {}
    const kind = FILE_ICONS[a.kind] ? a.kind as string : 'file'
    if (!a.src) return ''
    const player = kind !== 'file' ? ctx.safeUrl(a.src, 'media') : null
    const link = ctx.safeUrl(a.src, 'download')
    const name = typeof a.name === 'string' && a.name ? a.name : link ? String(a.src).slice(0, 200) : ''
    const size = fileSize(a.size)
    return `<div class="me-media"${ctx.blockAttrs(node)}><div class="me-file me-file--${kind}">`
      + (player ? `<${kind} class="me-file-player"${attr('src', player)} controls preload="metadata"></${kind}>` : '')
      + `<div class="me-file-row">${ctx.icon(FILE_ICONS[kind]!).replace('class="lucide"', 'class="lucide me-file-icon"')}<span class="me-file-name">${escapeHtml(name)}</span>`
      + (size ? `<span class="me-file-size">${size}</span>` : '')
      + (link ? `<a class="me-tool-btn"${attr('href', link)}${attr('download', a.name || true)} target="_blank" rel="noopener noreferrer"${attr('title', ctx.messages.image.download)}>${ctx.icon('download')}</a>` : '')
      + '</div></div></div>'
  },

  mention: (node, ctx) => {
    const a = node.attrs ?? {}
    const kind = a.kind === 'page' || a.kind === 'date' ? a.kind : 'user'
    if (kind === 'date') {
      const value: DateValue = { start: a.id, end: a.end, time: a.time, endTime: a.endTime, format: a.format ?? 'relative', timeFormat: a.timeFormat, remind: a.remind }
      let label: string
      try {
        label = formatDateValue(value, ctx.locale, ctx.messages.mention)
      }
      catch {
        label = String(a.label ?? a.id ?? '')
      }
      return `<span class="me-mention me-mention--date" data-type="mention" data-kind="date"><span>@${escapeHtml(label)}</span></span>`
    }
    const label = String(a.label ?? a.id ?? '')
    const target = ctx.options.mentionHref ? ctx.options.mentionHref({ id: String(a.id ?? ''), label: a.label, kind, href: a.href }) : a.href
    const href = ctx.safeUrl(target, 'link')
    const lead = kind === 'page'
      ? ctx.icon('fileText').replace('class="lucide"', 'class="lucide me-mention-icon"')
      : (() => {
          const avatar = ctx.safeUrl(a.avatar, 'media')
          return avatar ? `<img class="me-mention-avatar"${attr('src', avatar)} alt="" loading="lazy">` : ''
        })()
    const inner = `${lead}<span>${kind === 'page' ? '' : '@'}${escapeHtml(label)}</span>`
    const cls = `me-mention me-mention--${kind}`
    const data = `data-type="mention" data-kind="${kind}"${attr('data-id', a.id)}`
    return href
      ? `<a class="${cls}" ${data}${linkAttrs(href, ctx)}>${inner}</a>`
      : `<span class="${cls}" ${data}>${inner}</span>`
  },

  htmlBlock: (node, ctx) => {
    const code = typeof node.attrs?.code === 'string' ? node.attrs.code : ''
    if (!code.trim()) return ''
    const { network, defaultHeight } = st(ctx).htmlOptions
    const height = Math.round(clamp(node.attrs?.height ?? defaultHeight, HTML_MIN_HEIGHT, HTML_MAX_HEIGHT, defaultHeight))
    const title = typeof node.attrs?.fileName === 'string' && node.attrs.fileName ? node.attrs.fileName : ctx.messages.html.title
    // No allow-same-origin: the code can't reach this page, its cookies or storage.
    return `<div class="me-html"${ctx.blockAttrs(node)}><div class="me-html-frame"><div class="me-html-body" style="height:${height}px">`
      + `<iframe class="me-html-iframe is-live"${attr('srcdoc', htmlBlockDocument(code, network))} sandbox="allow-scripts allow-forms allow-modals allow-popups allow-pointer-lock allow-downloads"${attr('title', title)} loading="lazy" referrerpolicy="no-referrer"></iframe>`
      + '</div></div></div>'
  },

  // Placeholders for blocks an editor didn't load: render the original JSON they keep.
  unknownBlock: (node, ctx) => (node.attrs?.data && typeof node.attrs.data === 'object' && node.attrs.data.type !== 'unknownBlock' ? ctx.render(node.attrs.data) : ''),
  unknownInline: (node, ctx) => (node.attrs?.data && typeof node.attrs.data === 'object' && node.attrs.data.type !== 'unknownInline' ? ctx.render(node.attrs.data) : ''),
}

function cell(tag: 'td' | 'th', node: JSONContent, ctx: RenderContext) {
  const a = node.attrs ?? {}
  const colspan = clamp(a.colspan, 1, 100, 1)
  const rowspan = clamp(a.rowspan, 1, 1000, 1)
  return `<${tag}${colspan > 1 ? ` colspan="${colspan}"` : ''}${rowspan > 1 ? ` rowspan="${rowspan}"` : ''}${attr('data-color', color(a.color))}>${ctx.children(node)}</${tag}>`
}

const simple = (tag: string): MarkRenderer => (_mark, inner) => `<${tag}>${inner}</${tag}>`

export const builtinMarks: Record<string, MarkRenderer> = {
  bold: simple('strong'),
  italic: simple('em'),
  underline: simple('u'),
  strike: simple('s'),
  code: simple('code'),
  subscript: simple('sub'),
  superscript: simple('sup'),
  highlight: simple('mark'),
  link: (mark, inner, ctx) => {
    const href = ctx.safeUrl(mark.attrs?.href, 'link')
    return href ? `<a${linkAttrs(href, ctx)}>${inner}</a>` : inner
  },
  textColor: (mark, inner) => {
    const c = color(mark.attrs?.color)
    return c ? `<span data-text-color="${c}">${inner}</span>` : inner
  },
  bgColor: (mark, inner) => {
    const c = color(mark.attrs?.color)
    return c ? `<mark data-bg-color="${c}">${inner}</mark>` : inner
  },
}
