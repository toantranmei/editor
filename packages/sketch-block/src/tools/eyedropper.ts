import type { Point } from '../geometry'
import type { PointerInput, Tool, ToolHost } from './controller'

/** Hit tolerance, in screen px (same as select). */
const HIT_PX = 6

/**
 * Eyedropper: a click on an element takes its stroke color (Alt: its background) into the current style and
 * the selection; a click on empty canvas changes nothing. Either way the previous tool comes back.
 */
export class EyedropperTool implements Tool {
  private pressed = false

  constructor(private readonly host: ToolHost) {}

  down(): void {
    this.pressed = true
  }

  move(): void {}

  up(e: PointerInput, p: Point): void {
    if (!this.pressed) return
    this.pressed = false
    const { scene, viewport } = this.host.ctx
    const hit = scene.hitTest(p, HIT_PX / viewport.zoom)
    if (hit) this.host.applyStyle(e.alt ? { fill: hit.fill } : { stroke: hit.stroke })
    this.host.restoreTool()
  }

  cancel(): void {
    this.pressed = false
  }
}
