import { blendsMultiply } from '../elements/freedraw'
import { kindOf } from '../elements/kind'
import type { Box } from '../geometry'
import type { Scene } from '../model/scene'
import type { SketchElement } from '../model/types'
import type { Viewport } from '../viewport'
import { type BitmapCache, bitmapPad, bitmapScale, buildBitmap, cacheKey } from './bitmap-cache'
import type { Theme } from './shapes'

export interface RenderState {
  viewport: Viewport
  widthCss: number
  heightCss: number
  dpr: number
  theme: Theme
  grid: boolean
  /** Zoom the bitmaps are rasterized for (defaults to viewport.zoom). Held fixed while zooming so bitmaps are scaled, not rebuilt. */
  cacheZoom?: number
}

export const LOD_ZOOM = 0.3
const GRID = 20
const GRID_MIN_PX = 8

/** Clears the canvas and sets the scene → device-pixel transform. */
export function applyViewTransform(ctx: CanvasRenderingContext2D, state: RenderState): void {
  const { viewport: vp, dpr } = state
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, state.widthCss * dpr, state.heightCss * dpr)
  const s = dpr * vp.zoom
  ctx.setTransform(s, 0, 0, s, -vp.x * s, -vp.y * s)
}

/** Moves the origin to the element center, rotated by its angle (relative to the view transform). */
function enterElementFrame(ctx: CanvasRenderingContext2D, el: SketchElement): void {
  ctx.translate(el.x + el.w / 2, el.y + el.h / 2)
  if (el.angle) ctx.rotate(el.angle)
}

function drawGrid(ctx: CanvasRenderingContext2D, box: Box, state: RenderState): void {
  const zoom = state.viewport.zoom
  if (GRID * zoom < GRID_MIN_PX) return
  ctx.beginPath()
  for (let x = Math.floor(box.minX / GRID) * GRID; x <= box.maxX; x += GRID) {
    ctx.moveTo(x, box.minY)
    ctx.lineTo(x, box.maxY)
  }
  for (let y = Math.floor(box.minY / GRID) * GRID; y <= box.maxY; y += GRID) {
    ctx.moveTo(box.minX, y)
    ctx.lineTo(box.maxX, y)
  }
  ctx.strokeStyle = state.theme === 'dark' ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'
  ctx.lineWidth = 1 / zoom
  ctx.stroke()
}

function drawBitmap(
  ctx: CanvasRenderingContext2D, el: SketchElement, state: RenderState, cache: BitmapCache,
): void {
  const zoom = state.cacheZoom ?? state.viewport.zoom
  const key = cacheKey(el, zoom, state.dpr, state.theme)
  let bmp = cache.get(key)
  if (!bmp) {
    bmp = buildBitmap(el, zoom, state.dpr, state.theme)
    cache.set(key, bmp)
  }
  const pad = bitmapPad(el)
  const s = bitmapScale(el, zoom, state.dpr)
  // exact pixel size / scale: ceil() in buildBitmap must not stretch the bitmap
  const multiply = blendsMultiply(el, state.theme)
  if (multiply) ctx.globalCompositeOperation = 'multiply'
  ctx.drawImage(bmp, -el.w / 2 - pad, -el.h / 2 - pad, bmp.width / s, bmp.height / s)
  if (multiply) ctx.globalCompositeOperation = 'source-over'
}

/**
 * Draws visible elements (culled via the scene index, whose bounds include each kind's visual pad) from cached per-element bitmaps,
 * or plain paths below LOD_ZOOM. `skipIds` are omitted (e.g. elements being dragged); `substitutes` are drawn in
 * place of the element with the same id (e.g. a shape without the label being edited).
 */
export function renderStatic(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  state: RenderState,
  cache: BitmapCache,
  skipIds?: Set<string>,
  substitutes?: ReadonlyMap<string, SketchElement>,
): { drawn: number } {
  const vp = state.viewport
  applyViewTransform(ctx, state)
  const s = state.dpr * vp.zoom
  const box = vp.visibleBox(state.widthCss, state.heightCss)
  if (state.grid) drawGrid(ctx, box, state)

  const lod = vp.zoom < LOD_ZOOM
  let drawn = 0
  for (const found of scene.queryBox(box)) {
    if (skipIds?.has(found.id)) continue
    const el = substitutes?.get(found.id) ?? found
    ctx.globalAlpha = el.opacity
    enterElementFrame(ctx, el)
    if (lod) kindOf(el).drawLod(ctx, el, state.theme, vp.zoom)
    else drawBitmap(ctx, el, state, cache)
    ctx.setTransform(s, 0, 0, s, -vp.x * s, -vp.y * s)
    drawn++
  }
  ctx.globalAlpha = 1
  return { drawn }
}
