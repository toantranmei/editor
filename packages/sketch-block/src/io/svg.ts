import { kindOf } from '../elements/kind'
import { boxCenter, elementBounds } from '../geometry/bounds'
import type { SketchElement } from '../model/types'

const SVG_PREVIEW_LIMIT = 150_000
const PNG_MAX_WIDTH = 1200

export interface ExportSvgOptions { padding?: number; background?: string | null }
export interface PreviewResult { dataUrl: string; blob: Blob }
export interface PreviewOptions {
  rasterize?: (svg: string, maxWidth: number) => Promise<PreviewResult>
}

const num = (n: number): string => String(Math.round(n * 100) / 100)
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

function elementSvg(el: SketchElement): string {
  const body = kindOf(el).svg(el, 'light')
  const attrs: string[] = []
  if (el.angle) {
    const c = boxCenter(el)
    attrs.push(`transform="rotate(${num((el.angle * 180) / Math.PI)} ${num(c.x)} ${num(c.y)})"`)
  }
  if (el.opacity < 1) attrs.push(`opacity="${num(el.opacity)}"`)
  return `<g${attrs.length ? ` ${attrs.join(' ')}` : ''}><g transform="translate(${num(el.x)} ${num(el.y)})">${body}</g></g>`
}

/** Standalone SVG of the elements, in the given (z-)order. */
export function exportSvg(elements: readonly SketchElement[], opts: ExportSvgOptions = {}): string {
  const padding = opts.padding ?? 16
  let minX = 0, minY = 0, maxX = 0, maxY = 0
  elements.forEach((el, i) => {
    const b = elementBounds(el)
    if (i === 0) ({ minX, minY, maxX, maxY } = b)
    else {
      minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY)
      maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY)
    }
  })
  const x = minX - padding, y = minY - padding
  const w = maxX - minX + padding * 2, h = maxY - minY + padding * 2
  const bg = opts.background
    ? `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" fill="${esc(opts.background)}"/>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${num(x)} ${num(y)} ${num(w)} ${num(h)}" width="${num(w)}" height="${num(h)}">${bg}${elements.map(elementSvg).join('')}</svg>`
}

function toBase64(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

/** Browser-only: draw the SVG onto a canvas (max `maxWidth` px wide) and return a PNG. */
async function rasterizeInBrowser(svg: string, maxWidth: number): Promise<PreviewResult> {
  const url = `data:image/svg+xml;base64,${toBase64(svg)}`
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('svg rasterize failed'))
    img.src = url
  })
  const scale = Math.min(1, maxWidth / (img.width || maxWidth))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.width * scale))
  canvas.height = Math.max(1, Math.round(img.height * scale))
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'))
  return { dataUrl: canvas.toDataURL('image/png'), blob }
}

/** Preview image for the document node: SVG data URL when small, otherwise a PNG (max 1200 px wide). */
export async function makePreview(
  elements: readonly SketchElement[],
  opts: PreviewOptions = {},
): Promise<PreviewResult | null> {
  if (elements.length === 0) return null
  const svg = exportSvg(elements)
  const dataUrl = `data:image/svg+xml;base64,${toBase64(svg)}`
  if (dataUrl.length <= SVG_PREVIEW_LIMIT) {
    return { dataUrl, blob: new Blob([svg], { type: 'image/svg+xml' }) }
  }
  return (opts.rasterize ?? rasterizeInBrowser)(svg, PNG_MAX_WIDTH)
}
