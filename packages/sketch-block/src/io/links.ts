/** Longest link kept, characters (a longer one is refused). */
export const MAX_LINK_CHARS = 2048
/** URL schemes an element link may use. */
const ALLOWED_PROTOCOLS: ReadonlySet<string> = new Set(['https:', 'http:', 'mailto:'])
/** An internal link to another element of the board: `#el:<id>`. */
const INTERNAL_RE = /^#el:([A-Za-z0-9_-]{1,64})$/
/** Characters never allowed in a link (control characters, which URL parsing would silently drop). */
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001F\u007F]/

/**
 * An element link as stored, or null when it is not allowed: an absolute `https:` / `http:` / `mailto:` URL (as
 * normalized by the URL parser) or an internal `#el:<id>` link (id of 1–64 of `A-Za-z0-9_-`), at most
 * MAX_LINK_CHARS long. Surrounding blanks are trimmed; anything else (`javascript:`, `data:`, relative URLs,
 * control characters...) is refused. Never throws.
 */
export function sanitizeLink(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  if (!s || s.length > MAX_LINK_CHARS || CONTROL_RE.test(s)) return null
  if (s.startsWith('#')) return INTERNAL_RE.test(s) ? s : null
  let url: URL
  try {
    url = new URL(s)
  } catch {
    return null
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return null
  if (url.protocol === 'mailto:' ? !url.pathname : !url.hostname) return null
  const href = url.href
  return href.length <= MAX_LINK_CHARS ? href : null
}

/** The element id an internal link (`#el:<id>`) points at, else null. */
export function internalLinkTarget(link: string): string | null {
  return INTERNAL_RE.exec(link)?.[1] ?? null
}

export interface LinkContext {
  /** Pans / zooms to element `id` and selects it; false when there is no such element. */
  focus(id: string): boolean
}

/**
 * Follows a link: an internal one focuses its element (`ctx.focus`), an external one opens in a new tab with no
 * opener or referrer. A link that fails `sanitizeLink` does nothing. True when something happened.
 */
export function openLink(link: string, ctx: LinkContext): boolean {
  const safe = sanitizeLink(link)
  if (!safe) return false
  const target = internalLinkTarget(safe)
  if (target) return ctx.focus(target)
  if (typeof window === 'undefined' || typeof window.open !== 'function') return false
  window.open(safe, '_blank', 'noopener,noreferrer')
  return true
}
