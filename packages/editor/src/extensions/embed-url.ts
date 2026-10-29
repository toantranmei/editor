/** Turns a YouTube / Vimeo / Loom watch link into an embeddable URL. */
export function toEmbedUrl(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw.trim())
  }
  catch {
    return null
  }
  if (!/^https?:$/.test(url.protocol)) return null

  const host = url.hostname.replace(/^www\./, '')
  if (host === 'youtu.be') return `https://www.youtube.com/embed/${url.pathname.slice(1)}`
  if (host.endsWith('youtube.com')) {
    const id = url.searchParams.get('v') ?? url.pathname.match(/\/(?:embed|shorts)\/([^/]+)/)?.[1]
    if (id) return `https://www.youtube.com/embed/${id}`
  }
  if (host === 'vimeo.com') {
    const id = url.pathname.match(/\/(\d+)/)?.[1]
    if (id) return `https://player.vimeo.com/video/${id}`
  }
  if (host === 'loom.com') {
    const id = url.pathname.match(/\/share\/([^/]+)/)?.[1]
    if (id) return `https://www.loom.com/embed/${id}`
  }
  return url.toString()
}
