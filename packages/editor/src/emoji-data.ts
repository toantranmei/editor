/** Emoji search data, loaded on first use (≈600KB per locale, split into its own chunk). */
export interface EmojiEntry { unicode: string, label: string, terms: string[] }

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase()

interface Compact { hexcode: string, label: string, unicode: string, tags?: string[], group?: number }
const LOCALES: Record<string, () => Promise<{ default: Compact[] }>> = {
  vi: () => import('emojibase-data/vi/compact.json'),
  zh: () => import('emojibase-data/zh/compact.json'),
}

let cache: Promise<EmojiEntry[]> | null = null
let cachedLocale = ''

/** English labels + GitHub shortcodes always; plus labels/tags in `locale` when available. */
export function loadEmojis(locale: string): Promise<EmojiEntry[]> {
  if (cache && cachedLocale === locale) return cache
  cachedLocale = locale
  cache = Promise.all([
    import('emojibase-data/en/compact.json'),
    import('emojibase-data/en/shortcodes/github.json'),
    LOCALES[locale]?.() ?? Promise.resolve({ default: [] as Compact[] }),
  ]).then(([en, shortcodes, local]) => {
    const localByHex = new Map(local.default.map(e => [e.hexcode, e]))
    const codes = shortcodes.default as Record<string, string | string[]>
    return (en.default as Compact[])
      // Skip regional indicators / components (no group).
      .filter(e => e.group !== undefined && e.group !== 2)
      .map((e) => {
        const loc = localByHex.get(e.hexcode)
        const sc = codes[e.hexcode]
        return {
          unicode: e.unicode,
          label: loc?.label ?? e.label,
          terms: [e.label, ...(e.tags ?? []), ...(loc ? [loc.label, ...(loc.tags ?? [])] : []), ...(Array.isArray(sc) ? sc : sc ? [sc] : [])].map(normalize),
        }
      })
  })
  return cache
}

export function searchEmojis(list: EmojiEntry[], query: string, limit = 40): EmojiEntry[] {
  const q = normalize(query.trim())
  if (!q) return list.slice(0, limit)
  const starts: EmojiEntry[] = []
  const contains: EmojiEntry[] = []
  for (const e of list) {
    if (e.terms.some(t => t.startsWith(q))) starts.push(e)
    else if (e.terms.some(t => t.includes(q))) contains.push(e)
    if (starts.length >= limit) break
  }
  return [...starts, ...contains].slice(0, limit)
}
