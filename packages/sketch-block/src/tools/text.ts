import type { Point } from '../geometry'
import type { PointerInput, Tool, ToolHost } from './controller'

/**
 * Text: a click on a shape edits its label, on a text element edits it, elsewhere creates a text element at the
 * pointer and edits it. The editing itself (overlay, commit, undo step) belongs to the controller.
 */
export class TextTool implements Tool {
  private pressed = false

  constructor(private readonly host: ToolHost) {}

  down(): void {
    this.pressed = !this.host.ctx.readonly()
  }

  move(): void {}

  up(_e: PointerInput, p: Point): void {
    if (!this.pressed) return
    this.pressed = false
    this.host.editAt(p)
  }

  cancel(): void {
    this.pressed = false
  }
}
