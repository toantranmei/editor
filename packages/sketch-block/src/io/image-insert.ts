import { isImageSrc } from '../model/types'

/** Long edge of an image stored as a data URL (no uploader), px. */
export const MAX_IMAGE_SIDE = 2048
/** Largest encoded image stored as a data URL (no uploader), bytes. */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024
/** JPEG quality of re-encoded images. */
export const JPEG_QUALITY = 0.85
/** Types whose bytes may be stored as-is in a data URL (the `isImageSrc` data types). */
const DATA_URL_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

export type ImageInsertErrorCode = 'type' | 'size' | 'upload' | 'needsUpload'

/**
 * Why an image could not be inserted: not a (supported) image, too large, the upload failed, or (needsUpload) a
 * data URL over the networked board's inline limit with no uploader.
 */
export class ImageInsertError extends Error {
  constructor(readonly code: ImageInsertErrorCode, options?: { cause?: unknown }) {
    super(`sketch-block: image insert failed (${code})`, options)
    this.name = 'ImageInsertError'
  }
}

export interface PreparedImage {
  src: string
  naturalW: number
  naturalH: number
}

export type ImageUploader = (file: File) => Promise<string>

export interface PrepareImageOptions {
  /**
   * Largest data URL (decoded bytes) accepted without an uploader; above it 'needsUpload' is thrown. Set for
   * networked boards (`connection.maxInlineImageBytes`): every peer would download the bytes. Default: no limit
   * beyond the 4 MB one.
   */
  maxInlineBytes?: number
}

/** (w, h) scaled down (never up) so the long edge is at most `max`, ratio kept, rounded (min 1 px a side). */
export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  if (!(w > 0 && h > 0)) return { w: 0, h: 0 }
  const s = Math.min(1, max / Math.max(w, h))
  if (s === 1) return { w, h }
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) }
}

/** Accepted inputs: any image type the browser decodes, except SVG (it can carry script). */
export function isImageFile(file: { type: string }): boolean {
  const t = file.type.toLowerCase()
  return t.startsWith('image/') && t !== 'image/svg+xml'
}

/** Decodes `file` through a temporary object URL; rejects with 'type' when it is not a decodable image. */
function decodeFile(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new ImageInsertError('type'))
    img.src = url
  }).finally(() => URL.revokeObjectURL(url))
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new ImageInsertError('type'))
    reader.readAsDataURL(file)
  })
}

/** Decoded byte size of a base64 data URL. */
export function dataUrlBytes(url: string): number {
  const comma = url.indexOf(',')
  const body = url.length - comma - 1
  const pad = url.endsWith('==') ? 2 : url.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((body * 3) / 4) - pad)
}

/** Whether any pixel of the canvas is not opaque; unknown (no pixel access) counts as transparent. */
function hasAlpha(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  try {
    const data = ctx.getImageData(0, 0, w, h)?.data
    if (!data) return true
    for (let i = 3; i < data.length; i += 4) if (data[i]! < 255) return true
    return false
  } catch {
    return true
  }
}

/**
 * Thin canvas wrapper: draws `img` at (w, h) and encodes it as JPEG (quality 0.85), or PNG when the source may
 * have alpha.
 */
function encodeCanvas(img: HTMLImageElement, w: number, h: number, sourceType: string): string {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new ImageInsertError('type')
  ctx.drawImage(img, 0, 0, w, h)
  const alpha = sourceType !== 'image/jpeg' && hasAlpha(ctx, w, h)
  return alpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', JPEG_QUALITY)
}

/**
 * Turns a picked / pasted / dropped file into an image source. With an uploader the file is uploaded as-is
 * (its URL must pass `isImageSrc` without blob:, and a data URL it returns must be within 4 MB). Without one it becomes a data URL: kept byte for byte when it is a png /
 * jpeg / webp / gif within 2048 px and 4 MB, otherwise downscaled to 2048 px on the long edge and re-encoded
 * (JPEG 0.85, PNG when it has alpha). Throws ImageInsertError: 'type' (not a decodable image), 'size' (over
 * 4 MB after encoding), 'upload' (the uploader failed or returned an unusable URL), 'needsUpload' (no uploader
 * and the data URL is over `opts.maxInlineBytes`).
 */
export async function prepareImage(
  file: File, upload: ImageUploader | null, opts: PrepareImageOptions = {},
): Promise<PreparedImage> {
  if (!isImageFile(file)) throw new ImageInsertError('type')
  const img = await decodeFile(file)
  const naturalW = img.naturalWidth
  const naturalH = img.naturalHeight
  if (!(naturalW > 0 && naturalH > 0)) throw new ImageInsertError('type')

  if (upload) {
    let src: unknown
    try {
      src = await upload(file)
    } catch (err) {
      throw new ImageInsertError('upload', { cause: err })
    }
    // blob: URLs die with the page that made them: an uploader must return a lasting URL
    if (!isImageSrc(src, false)) throw new ImageInsertError('upload')
    if (src.startsWith('data:') && dataUrlBytes(src) > MAX_IMAGE_BYTES) throw new ImageInsertError('size')
    return { src, naturalW, naturalH }
  }

  const inline = (src: string): string => {
    if (opts.maxInlineBytes !== undefined && dataUrlBytes(src) > opts.maxInlineBytes) throw new ImageInsertError('needsUpload')
    return src
  }
  const type = file.type.toLowerCase()
  const fit = fitWithin(naturalW, naturalH, MAX_IMAGE_SIDE)
  const fits = fit.w === naturalW && fit.h === naturalH
  if (fits && DATA_URL_TYPES.has(type) && file.size <= MAX_IMAGE_BYTES) {
    const src = await readAsDataUrl(file)
    if (isImageSrc(src)) return { src: inline(src), naturalW, naturalH }
  }
  const src = encodeCanvas(img, fit.w, fit.h, type)
  if (!isImageSrc(src)) throw new ImageInsertError('type')
  if (dataUrlBytes(src) > MAX_IMAGE_BYTES) throw new ImageInsertError('size')
  return { src: inline(src), naturalW: fit.w, naturalH: fit.h }
}
