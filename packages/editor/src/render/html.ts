import type { UrlKind } from './types'

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }
const ESCAPE_RE = /[&<>"']/g

/** Escapes text for HTML text and (quoted) attribute values. */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  return ESCAPE_RE.test(s) ? s.replace(ESCAPE_RE, c => ESCAPES[c]!) : s
}

/** ` name="value"`, or '' for null / undefined / false. `true` renders a bare attribute. */
export function attr(name: string, value: unknown): string {
  if (value === null || value === undefined || value === false) return ''
  if (value === true) return ` ${name}`
  return ` ${name}="${escapeHtml(value)}"`
}

// Media that can't run script when loaded as <img>/<audio>/<video> or downloaded.
const MEDIA_DATA = /^data:(?:image\/(?:png|jpe?g|gif|webp|avif|bmp|x-icon|svg\+xml)|audio\/[\w.+-]+|video\/[\w.+-]+)[;,]/i
const ACTIVE_DATA = /^data:(?:text\/html|application\/xhtml|image\/svg|text\/xml|application\/xml|text\/javascript|application\/javascript)/i

/**
 * Returns the URL when it is safe for `kind`, else null. Allowed: `http:`, `https:`,
 * `mailto:` (links only) and relative URLs; `data:` media for `media`; inert `data:` files
 * for `download`. Iframes (`frame`) need an absolute http(s) URL. Control characters and
 * whitespace inside the scheme (`java\tscript:`) are stripped before checking, like browsers do.
 */
export function safeUrl(url: unknown, kind: UrlKind = 'link'): string | null {
  if (typeof url !== 'string') return null
  const trimmed = url.trim()
  if (!trimmed) return null
  // Browsers ignore these when parsing the scheme.
  // eslint-disable-next-line no-control-regex
  const normalized = trimmed.replace(/[\u0000-\u001F\u007F\s]+/g, '')
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(normalized)?.[1]?.toLowerCase()

  if (kind === 'frame') return scheme === 'http' || scheme === 'https' ? trimmed : null
  if (!scheme) {
    // Relative URL. A backslash start is treated as `//host` by browsers.
    return /^[\\]/.test(normalized) ? null : trimmed
  }
  if (scheme === 'http' || scheme === 'https') return trimmed
  if (scheme === 'mailto') return kind === 'link' ? trimmed : null
  if (scheme === 'data') {
    if (kind === 'media') return MEDIA_DATA.test(normalized) ? trimmed : null
    if (kind === 'download') return ACTIVE_DATA.test(normalized) ? null : trimmed
  }
  return null
}

/** True for absolute http(s) URLs (opened in a new tab by default). */
export const isExternal = (url: string) => /^https?:\/\//i.test(url) || url.startsWith('//')
