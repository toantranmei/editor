import { isImageSrc } from '../model/types'

/** A failed load is retried on the next lookup after this long, ms. */
export const IMAGE_ERROR_TTL = 30_000

interface Entry {
  state: 'loading' | 'loaded' | 'error'
  img: HTMLImageElement | null
  promise: Promise<HTMLImageElement>
  /** Loaded without CORS (the host sends no CORS headers): drawing it taints a canvas. */
  tainted: boolean
  /** When the load failed (Date.now()), for expiry. */
  failedAt: number
}

/** Decoded images by src, shared by every board on the page (the same src is decoded once). */
const cache = new Map<string, Entry>()
const listeners = new Set<(src: string) => void>()

function notify(src: string): void {
  for (const cb of [...listeners]) {
    try {
      cb(src)
    } catch (err) {
      console.warn('sketch-block: image load listener failed', err)
    }
  }
}

/** One attempt: resolves with the decoded image, rejects on error. */
function attempt(src: string, cors: boolean): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    // untainted canvases (previews, exports) need CORS-enabled images
    if (cors) img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('sketch-block: image failed to load'))
    img.src = src
  })
}

function start(src: string): Entry {
  const entry: Entry = {
    state: 'loading', img: null, promise: null as unknown as Promise<HTMLImageElement>, tainted: false, failedAt: 0,
  }
  if (!isImageSrc(src)) {
    entry.state = 'error'
    entry.failedAt = Date.now()
    entry.promise = Promise.reject(new Error('sketch-block: image src not allowed'))
  } else {
    // a host without CORS headers fails the CORS request: retry once without it (the image is then tainted)
    const remote = /^https?:/i.test(src)
    entry.promise = attempt(src, true).catch((err: unknown) => {
      if (!remote) throw err
      return attempt(src, false).then((img) => {
        entry.tainted = true
        return img
      })
    }).then(
      (img) => {
        // cleared or replaced meanwhile (clearImageCache / retry): resolve, but do not repopulate or notify
        if (cache.get(src) !== entry) return img
        entry.state = 'loaded'
        entry.img = img
        notify(src)
        return img
      },
      (err: unknown) => {
        entry.state = 'error'
        entry.failedAt = Date.now()
        throw err
      },
    )
  }
  // callers that only render (getLoadedImage) never await it
  entry.promise.catch(() => {})
  cache.set(src, entry)
  return entry
}

/** The cache entry for `src`, (re)starting the load when there is none or its failure has expired. */
function lookup(src: string): Entry {
  const entry = cache.get(src)
  if (entry && !(entry.state === 'error' && Date.now() - entry.failedAt >= IMAGE_ERROR_TTL)) return entry
  return start(src)
}

/**
 * The decoded image for `src` (cached by src; tried with crossOrigin 'anonymous', then once without it for an
 * http(s) host without CORS). Rejects when the src is not allowed or fails to load; the caller then shows a
 * placeholder. A failure is retried after IMAGE_ERROR_TTL.
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return lookup(src).promise
}

/**
 * Synchronous lookup for rendering: the image once loaded, 'error' when it failed (or is not allowed), else
 * undefined (loading). A lookup starts the load when needed (also re-trying a failure older than
 * IMAGE_ERROR_TTL); `onImageLoaded` listeners hear when it completes.
 */
export function getLoadedImage(src: string): HTMLImageElement | 'error' | undefined {
  const entry = lookup(src)
  return entry.state === 'loaded' ? entry.img! : entry.state === 'error' ? 'error' : undefined
}

/** Whether `src` loaded without CORS: drawing it taints a canvas, so previews / exports must skip it. */
export function isImageTainted(src: string): boolean {
  const entry = cache.get(src)
  return !!entry && entry.state === 'loaded' && entry.tainted
}

/** Forgets every failed load so the next lookup tries again (e.g. when a board mounts). */
export function retryFailedImages(): void {
  for (const [src, entry] of cache) if (entry.state === 'error') cache.delete(src)
}

/** Calls `cb(src)` whenever an image finishes loading (the board redraws and drops stale bitmaps); returns off. */
export function onImageLoaded(cb: (src: string) => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** Forgets every cached image (tests). */
export function clearImageCache(): void {
  cache.clear()
}
