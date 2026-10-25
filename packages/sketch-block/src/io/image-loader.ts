import { isImageSrc } from '../model/types'

interface Entry {
  state: 'loading' | 'loaded' | 'error'
  img: HTMLImageElement | null
  promise: Promise<HTMLImageElement>
}

/** Decoded images by src, shared by every board on the page (the same src is decoded once). */
const cache = new Map<string, Entry>()
const listeners = new Set<(src: string) => void>()

function start(src: string): Entry {
  if (!isImageSrc(src)) {
    const promise = Promise.reject(new Error('sketch-block: image src not allowed'))
    // callers that only render (getLoadedImage) never await it
    promise.catch(() => {})
    const entry: Entry = { state: 'error', img: null, promise }
    cache.set(src, entry)
    return entry
  }
  const img = new Image()
  // untainted canvases (previews, exports) need CORS-enabled images
  img.crossOrigin = 'anonymous'
  img.decoding = 'async'
  const entry: Entry = { state: 'loading', img: null, promise: null as unknown as Promise<HTMLImageElement> }
  entry.promise = new Promise<HTMLImageElement>((resolve, reject) => {
    img.onload = () => {
      // cleared meanwhile (clearImageCache): resolve, but do not repopulate or notify
      if (cache.get(src) !== entry) return resolve(img)
      entry.state = 'loaded'
      entry.img = img
      resolve(img)
      for (const cb of [...listeners]) {
        try {
          cb(src)
        } catch (err) {
          console.warn('sketch-block: image load listener failed', err)
        }
      }
    }
    img.onerror = () => {
      entry.state = 'error'
      reject(new Error('sketch-block: image failed to load'))
    }
  })
  entry.promise.catch(() => {})
  cache.set(src, entry)
  img.src = src
  return entry
}

/**
 * The decoded image for `src` (cached by src; crossOrigin 'anonymous'). Rejects when the src is not allowed or
 * fails to load; the caller then shows a placeholder.
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return (cache.get(src) ?? start(src)).promise
}

/**
 * Synchronous lookup for rendering: the image once loaded, 'error' when it failed (or is not allowed), else
 * undefined (loading). The first lookup starts the load; `onImageLoaded` listeners hear when it completes.
 */
export function getLoadedImage(src: string): HTMLImageElement | 'error' | undefined {
  const entry = cache.get(src) ?? start(src)
  return entry.state === 'loaded' ? entry.img! : entry.state === 'error' ? 'error' : undefined
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
