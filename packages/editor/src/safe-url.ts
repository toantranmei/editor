/**
 * Which `data:` URLs a block may load: `image` (only `data:image/*`), `any`, or `none`.
 */
export type DataUrlPolicy = 'image' | 'any' | 'none'

/**
 * URLs from document content (pasted, synced, imported) before they reach `src`, `href` or
 * `window.open`: http(s), `blob:`, URLs without a scheme and the allowed `data:` URLs. Anything
 * else — `javascript:`, `data:text/html`, `vbscript:`, URLs with control characters — gives `null`.
 *
 * URLs without a scheme take the page's: paths (`/api/v1/files/<id>`, `a.png`) are same-origin,
 * while `//cdn.example.com/a.png` (and `\\host`, `/\host`, which browsers read the same way) are
 * http(s) URLs on another host — as safe as any https URL, but not same-origin. Use `isSameOrigin`
 * when that matters.
 */
export function safeUrl(src: unknown, data: DataUrlPolicy = 'none'): string | null {
  if (typeof src !== 'string') return null
  const url = src.trim()
  // Browsers drop tabs / newlines inside URLs ("java\tscript:"), so refuse any control character.
  // eslint-disable-next-line no-control-regex
  if (!url || /[\u0000-\u001F\u007F]/.test(url)) return null
  const scheme = /^([a-z][a-z\d+.-]*):/i.exec(url)?.[1]?.toLowerCase()
  if (!scheme) return url // relative or protocol-relative: same scheme as the page
  if (scheme === 'http' || scheme === 'https' || scheme === 'blob') return url
  if (scheme === 'data') {
    if (data === 'any') return url
    if (data === 'image' && /^data:image\/[a-z\d.+-]+[;,]/i.test(url)) return url
  }
  return null
}

/** True when `url` (resolved against the page) is on the page's origin. */
export function isSameOrigin(url: string, base: string = globalThis.location?.href ?? 'http://localhost/'): boolean {
  try {
    return new URL(url, base).origin === new URL(base).origin
  }
  catch {
    return false
  }
}

/** True when `url` (resolved against the page) is an http(s) URL. */
export function isWebUrl(url: string, base: string = globalThis.location?.href ?? 'http://localhost/'): boolean {
  try {
    return /^https?:$/.test(new URL(url, base).protocol)
  }
  catch {
    return false
  }
}
