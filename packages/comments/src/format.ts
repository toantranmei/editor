import type { JSONContent, LocaleName } from '@toantranmei/editor'

// Comment bodies hold paragraphs, a few marks and mentions. A small renderer instead of
// `renderHTML`, which would bring every code grammar into the browser bundle.
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ESC[c]!)
/** http(s), mailto and relative links only (control characters stripped before checking). */
export function safeHref(url: unknown): string | null {
  if (typeof url !== 'string' || !url.trim()) return null
  // eslint-disable-next-line no-control-regex
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url.trim().replace(/[\u0000-\u001F\u007F\s]+/g, ''))?.[1]?.toLowerCase()
  return !scheme || ['http', 'https', 'mailto'].includes(scheme) ? url.trim() : null
}
const MARKS: Record<string, string> = { bold: 'strong', italic: 'em', underline: 'u', strike: 's', code: 'code' }

function node(n: JSONContent): string {
  if (n.type === 'text') {
    let out = esc(n.text)
    for (const mark of [...(n.marks ?? [])].reverse()) {
      const tag = MARKS[mark.type]
      if (tag) out = `<${tag}>${out}</${tag}>`
      else if (mark.type === 'link') {
        const href = safeHref(mark.attrs?.href)
        if (href) out = `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer nofollow">${out}</a>`
      }
    }
    return out
  }
  const inner = (n.content ?? []).map(node).join('')
  switch (n.type) {
    case 'doc': return inner
    case 'paragraph': return `<p>${inner}</p>`
    case 'hardBreak': return '<br>'
    case 'mention': return `<span class="me-mention me-mention--${n.attrs?.kind === 'date' ? 'date' : 'user'}" data-type="mention" data-id="${esc(n.attrs?.id)}"><span>@${esc(n.attrs?.label ?? n.attrs?.id)}</span></span>`
    default: return inner
  }
}

/** Comment body → safe HTML (escaped text, allow-listed links; mentions as chips). */
export function bodyHtml(body: JSONContent | null | undefined, _locale?: LocaleName): string {
  return body ? node(body) : ''
}

const formatters = new Map<string, Intl.DateTimeFormat>()

/** "Oct 30, 2026, 2:05 PM" in the UI language. */
export function formatTime(iso: string | null | undefined, locale: LocaleName): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  let f = formatters.get(locale)
  if (!f) {
    f = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : locale, { dateStyle: 'medium', timeStyle: 'short' })
    formatters.set(locale, f)
  }
  return f.format(date)
}

/** Up to two initials for an avatar placeholder. */
export const initials = (name: string) => name.trim().split(/\s+/).slice(-2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?'
