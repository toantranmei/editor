import { FRAME_COLOR, FRAME_LABEL_PX } from '../elements/frame'
import type { Point } from '../geometry/math'
import type { Scene } from '../model/scene'
import { type FontSize, type FrameElement, isFrame } from '../model/types'
import { FONT_FAMILIES, LINE_HEIGHT } from '../text/fonts'
import { measureText } from '../text/measure'
import type { RenderState } from './static'

/** Gap between the label's bottom and the frame's top edge, screen px. */
const LABEL_GAP_PX = 4
const LABEL_STYLE = { fontFamily: 'normal', fontSize: FRAME_LABEL_PX as FontSize, textAlign: 'left' } as const
export const FRAME_LABEL_FONT = `${FRAME_LABEL_PX}px ${FONT_FAMILIES.normal}`

/** Label height, screen px. */
export const FRAME_LABEL_H_PX = FRAME_LABEL_PX * LINE_HEIGHT

/**
 * The frame's name label box in scene units at `zoom`: above the top-left corner, 12 px text in screen terms,
 * as wide as the name (cut to the frame's width). Zero width for an unnamed frame.
 */
export function frameLabelBox(f: FrameElement, zoom: number): { x: number; y: number; w: number; h: number } {
  const textW = f.name ? measureText(f.name, LABEL_STYLE, null).w : 0
  const h = FRAME_LABEL_H_PX / zoom
  return { x: f.x, y: f.y - h - LABEL_GAP_PX / zoom, w: Math.min(textW / zoom, f.w), h }
}

/** The topmost frame whose name label contains scene point `p`, if any. */
export function frameLabelAt(scene: Scene, p: Point, zoom: number): FrameElement | undefined {
  const reach = (FRAME_LABEL_H_PX + LABEL_GAP_PX) / zoom
  // a label sits above its frame, within the frame's x range
  const found = scene.queryBox({ minX: p.x, minY: p.y, maxX: p.x, maxY: p.y + reach })
  for (let i = found.length - 1; i >= 0; i--) {
    const f = found[i]!
    if (!isFrame(f) || !f.name) continue
    const b = frameLabelBox(f, zoom)
    if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return f
  }
  return undefined
}

/**
 * Draws visible frames' names in screen space (12 px at every zoom), each clipped to its frame's width. Called by
 * the interactive layer after the static elements; `hiddenId` (the frame being renamed) is skipped.
 */
export function drawFrameLabels(
  ctx: CanvasRenderingContext2D, scene: Scene, state: RenderState, hiddenId: string | null = null,
): void {
  const vp = state.viewport
  const zoom = vp.zoom
  const box = vp.visibleBox(state.widthCss, state.heightCss)
  const reach = (FRAME_LABEL_H_PX + LABEL_GAP_PX) / zoom
  const frames = scene.queryBox({ ...box, maxY: box.maxY + reach }).filter(
    (el): el is FrameElement => isFrame(el) && !!el.name && el.id !== hiddenId,
  )
  if (!frames.length) return
  ctx.save()
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0)
  ctx.globalAlpha = 1
  ctx.font = FRAME_LABEL_FONT
  ctx.textBaseline = 'bottom'
  ctx.textAlign = 'left'
  ctx.fillStyle = FRAME_COLOR[state.theme]
  for (const f of frames) {
    const at = vp.toScreen({ x: f.x, y: f.y })
    const maxW = f.w * zoom
    if (maxW < 1) continue
    const bottom = at.y - LABEL_GAP_PX
    ctx.save()
    ctx.beginPath()
    ctx.rect(at.x, bottom - FRAME_LABEL_H_PX, maxW, FRAME_LABEL_H_PX)
    ctx.clip()
    ctx.fillText(f.name, at.x, bottom)
    ctx.restore()
  }
  ctx.restore()
}
