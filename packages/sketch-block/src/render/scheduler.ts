/** Coalesces layer invalidations into at most one pending animation frame. */
export class RenderScheduler {
  private frame: number | null = null
  private dirtyStatic = false
  private dirtyInteractive = false
  private destroyed = false

  constructor(
    private readonly drawStatic: () => void,
    private readonly drawInteractive: () => void,
  ) {}

  invalidateStatic(): void {
    this.dirtyStatic = true
    this.request()
  }

  invalidateInteractive(): void {
    this.dirtyInteractive = true
    this.request()
  }

  destroy(): void {
    this.destroyed = true
    if (this.frame !== null) cancelAnimationFrame(this.frame)
    this.frame = null
  }

  private request(): void {
    if (this.destroyed || this.frame !== null) return
    this.frame = requestAnimationFrame(() => this.flush())
  }

  private flush(): void {
    this.frame = null
    if (this.destroyed) return
    const s = this.dirtyStatic
    const i = this.dirtyInteractive
    this.dirtyStatic = this.dirtyInteractive = false
    if (s) this.drawStatic()
    if (i) this.drawInteractive()
  }
}

/**
 * Tracks when zooming stops. `cacheZoom` (the zoom bitmaps are rasterized for) only moves to the
 * latest zoom after `delayMs` without updates; `onSettle` then lets the board invalidate static.
 */
export class ZoomSettler {
  private current: number | undefined
  private latest: number | undefined
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly onSettle: () => void,
    private readonly delayMs = 150,
  ) {}

  get cacheZoom(): number {
    return this.current ?? 1
  }

  update(zoom: number): void {
    this.latest = zoom
    if (this.current === undefined) {
      this.current = zoom
      return
    }
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      this.current = this.latest
      this.onSettle()
    }, this.delayMs)
  }

  destroy(): void {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
  }
}
