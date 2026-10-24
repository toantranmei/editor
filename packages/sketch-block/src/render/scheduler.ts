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
