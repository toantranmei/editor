import type { Box, Point } from './geometry/math'

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 30

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

export class Viewport {
  /** Scene coordinates of the screen's top-left. */
  x = 0
  y = 0
  zoom = 1

  toScene(p: Point): Point {
    return { x: p.x / this.zoom + this.x, y: p.y / this.zoom + this.y }
  }

  toScreen(p: Point): Point {
    return { x: (p.x - this.x) * this.zoom, y: (p.y - this.y) * this.zoom }
  }

  panBy(dxScreen: number, dyScreen: number): void {
    this.x -= dxScreen / this.zoom
    this.y -= dyScreen / this.zoom
  }

  zoomAt(screenPoint: Point, nextZoom: number): void {
    const before = this.toScene(screenPoint)
    this.zoom = clampZoom(nextZoom)
    this.x = before.x - screenPoint.x / this.zoom
    this.y = before.y - screenPoint.y / this.zoom
  }

  visibleBox(widthCss: number, heightCss: number): Box {
    return { minX: this.x, minY: this.y, maxX: this.x + widthCss / this.zoom, maxY: this.y + heightCss / this.zoom }
  }

  fit(box: Box, widthCss: number, heightCss: number, padding = 40): void {
    const bw = box.maxX - box.minX
    const bh = box.maxY - box.minY
    const z = Math.min((widthCss - 2 * padding) / bw, (heightCss - 2 * padding) / bh)
    this.zoom = clampZoom(Number.isNaN(z) ? 1 : z)
    this.x = (box.minX + box.maxX) / 2 - widthCss / 2 / this.zoom
    this.y = (box.minY + box.maxY) / 2 - heightCss / 2 / this.zoom
  }
}
