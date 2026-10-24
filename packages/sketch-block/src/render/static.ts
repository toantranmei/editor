import type { Scene } from '../model/scene'
import type { SketchElement } from '../model/types'
import type { Box } from '../geometry'
import type { Viewport } from '../viewport'
import { type BitmapCache, bitmapPad, buildBitmap, cacheKey } from './bitmap-cache'
import { cornerRadius, displayColor, hasFill, type Theme } from './shapes'

export interface RenderState {
  viewport: Viewport
  widthCss: number
  heightCss: number
  dpr: number
  theme: Theme
  grid: boolean
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

/** Plain geometric path in the element's centered frame (used for LOD). */
function plainPath(ctx: CanvasRenderingContext2D, el: SketchElement): void {
  const hw = el.w / 2
  const hh = el.h / 2
  ctx.beginPath()
  if (el.type === 'ellipse') {
    ctx.ellipse(0, 0, Math.abs(hw), Math.abs(hh), 0, 0, Math.PI * 2)
  } else if (el.type === 'diamond') {
    ctx.moveTo(0, -hh)
    ctx.lineTo(hw, 0)
    ctx.lineTo(0, hh)
    ctx.lineTo(-hw, 0)
    ctx.closePath()
  } else if (el.roundness === 'round' && typeof ctx.roundRect === 'function') {
    ctx.roundRect(-hw, -hh, el.w, el.h, cornerRadius(el))
  } else {
    ctx.rect(-hw, -hh, el.w, el.h)
  }
}

function drawLod(ctx: CanvasRenderingContext2D, el: SketchElement, theme: Theme, zoom: number): void {
  plainPath(ctx, el)
  if (hasFill(el)) {
    ctx.fillStyle = displayColor(el.fill, theme)
    ctx.fill()
  }
  ctx.strokeStyle = displayColor(el.stroke, theme)
  ctx.lineWidth = Math.max(1 / zoom, el.strokeWidth)
  ctx.stroke()
}

function drawBitmap(
  ctx: CanvasRenderingContext2D, el: SketchElement, state: RenderState, cache: BitmapCache,
): void {
  const { zoom } = state.viewport
  const key = cacheKey(el, zoom, state.dpr, state.theme)
  let bmp = cache.get(key)
  if (!bmp) {
    bmp = buildBitmap(el, zoom, state.dpr, state.theme)
    cache.set(key, bmp)
  }
  const pad = bitmapPad(el)
  ctx.drawImage(bmp, -el.w / 2 - pad, -el.h / 2 - pad, el.w + 2 * pad, el.h + 2 * pad)
}

/**
 * Draws visible elements (culled via the scene index) from cached per-element bitmaps,
 * or plain paths below LOD_ZOOM. `skipIds` are omitted (e.g. elements being dragged).
 */
export function renderStatic(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  state: RenderState,
  cache: BitmapCache,
  skipIds?: Set<string>,
): { drawn: number } {
  const vp = state.viewport
  applyViewTransform(ctx, state)
  const s = state.dpr * vp.zoom
  const box = vp.visibleBox(state.widthCss, state.heightCss)
  if (state.grid) drawGrid(ctx, box, state)

  const lod = vp.zoom < LOD_ZOOM
  let drawn = 0
  for (const el of scene.queryBox(box)) {
    if (skipIds?.has(el.id)) continue
    ctx.globalAlpha = el.opacity
    enterElementFrame(ctx, el)
    if (lod) drawLod(ctx, el, state.theme, vp.zoom)
    else drawBitmap(ctx, el, state, cache)
    ctx.setTransform(s, 0, 0, s, -vp.x * s, -vp.y * s)
    drawn++
  }
  ctx.globalAlpha = 1
  return { drawn }
}
