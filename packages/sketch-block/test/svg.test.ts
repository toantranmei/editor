import { describe, expect, it } from 'vitest'
import { exportSvg, makePreview } from '../src/io/svg'
import { DEFAULT_STYLE, type ShapeElement, type SketchElement } from '../src/model/types'

const el = (over: Partial<ShapeElement> = {}): SketchElement => ({
  id: 'a', type: 'rectangle', x: 0, y: 0, w: 100, h: 50, angle: 0, index: 'a0', seed: 7, version: 1,
  locked: false, ...DEFAULT_STYLE, label: '', ...over,
})

describe('svg export', () => {
  it('empty board gives null preview', async () => {
    expect(await makePreview([])).toBeNull()
  })

  it('svg viewBox matches content bounds plus padding', () => {
    const svg = exportSvg([el()])
    expect(svg).toContain('viewBox="-17 -17 134 84"')
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain('<path')
  })

  it('same seed gives identical svg', () => {
    expect(exportSvg([el()])).toBe(exportSvg([el()]))
  })

  it('rotated element emits rotate transform', () => {
    expect(exportSvg([el({ angle: Math.PI / 2 })])).toContain('rotate(90 50 25)')
  })

  it('background adds a rect and opacity goes on the group', () => {
    const svg = exportSvg([el({ opacity: 0.5 })], { background: '#fff' })
    expect(svg).toContain('<rect')
    expect(svg).toContain('opacity="0.5"')
  })

  it('small boards preview as svg data url', async () => {
    const p = await makePreview([el()])
    expect(p!.dataUrl.startsWith('data:image/svg+xml;base64,')).toBe(true)
    expect(p!.blob.type).toBe('image/svg+xml')
  })

  it('large boards use the rasterizer', async () => {
    const many = Array.from({ length: 400 }, (_, i) => el({ id: `e${i}`, seed: i, x: i * 5 }))
    const png = { dataUrl: 'data:image/png;base64,AA', blob: new Blob(['x'], { type: 'image/png' }) }
    let called = 0
    const p = await makePreview(many, { rasterize: async (_s, w) => { called = w; return png } })
    expect(called).toBe(1200)
    expect(p).toBe(png)
  })

  it('dashes only the outline, not hatch fills, and sets no caps', () => {
    const svg = exportSvg([el({ strokeStyle: 'dashed', fill: '#ff0000', fillStyle: 'hachure' })])
    const paths = svg.match(/<path [^>]*>/g)!
    const dashed = paths.filter(p => p.includes('stroke-dasharray'))
    const hatch = paths.filter(p => p.includes('stroke="#ff0000"'))
    expect(dashed.length).toBeGreaterThan(0)
    expect(hatch.length).toBeGreaterThan(0)
    expect(hatch.some(p => p.includes('stroke-dasharray'))).toBe(false)
    expect(dashed.every(p => p.includes('stroke="#1e1e1e"'))).toBe(true)
    expect(svg).not.toContain('stroke-linecap')
    expect(svg).not.toContain('stroke-linejoin')
  })
})
