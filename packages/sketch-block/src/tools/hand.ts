import type { Point } from '../geometry'
import type { PointerInput, Tool, ToolHost } from './controller'

/** Pans the viewport by screen-space pointer deltas (hand tool, middle button, Space). */
export class HandTool implements Tool {
  private last: Point | null = null

  constructor(private readonly host: ToolHost) {}

  down(e: PointerInput): void {
    this.last = e.screen
    this.host.cursor.value = 'grabbing'
  }

  move(e: PointerInput): void {
    if (!this.last) return
    const dx = e.screen.x - this.last.x
    const dy = e.screen.y - this.last.y
    this.last = e.screen
    if (!dx && !dy) return
    this.host.ctx.viewport.panBy(dx, dy)
    this.host.ctx.invalidate()
  }

  up(e: PointerInput): void {
    this.move(e)
    this.last = null
    this.host.resetCursor()
  }

  cancel(): void {
    this.last = null
  }
}
