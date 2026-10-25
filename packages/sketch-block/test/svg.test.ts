import { describe, expect, it } from 'vitest'
import { exportSvg, makePreview } from '../src/io/svg'
import { DEFAULT_STYLE, type FreedrawElement, type ShapeElement, type SketchElement } from '../src/model/types'

const el = (over: Partial<ShapeElement> = {}): SketchElement => ({
  id: 'a', type: 'rectangle', x: 0, y: 0, w: 100, h: 50, angle: 0, index: 'a0', seed: 7, version: 1,
  locked: false, ...DEFAULT_STYLE, groupIds: [], frameId: null, label: '', ...over,
})

describe('svg export', () => {
  it('empty board gives null preview', async () => {
    expect(await makePreview([])).toBeNull()
  })

  it('svg viewBox matches content bounds (visual pad 6) plus padding', () => {
    const svg = exportSvg([el()])
    expect(svg).toContain('viewBox="-22 -22 144 94"')
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain('<path')
  })

  it('XML-invalid control characters are stripped: the svg stays parseable', () => {
    const text = {
      id: 't', type: 'text', x: 0, y: 200, w: 80, h: 25, angle: 0, index: 'a1', seed: 1, version: 1, locked: false,
      ...DEFAULT_STYLE, text: 'bell\u0007 tab\tnul\u0000 esc\u001b', autoSize: true,
    } as SketchElement
    const svg = exportSvg([el({ label: 'a\u0007b\u000bc' }), text])
    expect(/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(svg)).toBe(false)
    expect(svg).toContain('ab')
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
    expect(doc.querySelector('parsererror')).toBeNull()
    expect(doc.documentElement.nodeName.toLowerCase()).toBe('svg')
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

describe('svg export: M1 kinds', () => {
  const base = { angle: 0, version: 1, locked: false, ...DEFAULT_STYLE, groupIds: [], frameId: null }
  const pen = (over: Partial<FreedrawElement> = {}): SketchElement => ({
    ...base, id: 'p', type: 'freedraw', x: 0, y: 0, w: 40, h: 20, index: 'a0', seed: 1,
    points: [[0, 0], [10, 5], [20, 10], [40, 20]], pressures: [], highlighter: false, ...over,
  })
  const arrow: SketchElement = {
    ...base, id: 'r', type: 'arrow', x: 100, y: 0, w: 100, h: 0, index: 'a1', seed: 2,
    points: [[0, 0], [100, 0]], label: '', startBinding: null, endBinding: null, routing: 'straight', startArrowhead: 'none', endArrowhead: 'arrow',
  }
  const text: SketchElement = {
    ...base, id: 't', type: 'text', x: 0, y: 100, w: 80, h: 25, index: 'a2', seed: 3, text: 'Xin chào <b>',
    autoSize: true,
  }
  const labelled = el({ id: 'l', x: 0, y: 200, index: 'a3', label: 'Nhãn' })

  it('exportSvg renders freedraw, arrow with heads, text and labels', () => {
    const svg = exportSvg([pen(), arrow, text, labelled])
    // freedraw: one filled outline path with no stroke
    expect(svg).toMatch(/<path d="M [^"]+Z" fill="#1e1e1e"\/>/)
    // arrow: shaft + head paths inside its translated group
    const arrowGroup = svg.split('translate(100 0)')[1]!.split('</g></g>')[0]!
    expect(arrowGroup.match(/<path /g)!.length).toBeGreaterThanOrEqual(2)
    expect(svg).toContain('>Xin chào &lt;b&gt;</tspan>')
    expect(svg).toContain('>Nhãn</tspan>')
    expect(svg).toContain('font-family="&quot;Mei Hand&quot;, &quot;Patrick Hand&quot;, cursive"')
    expect(svg).not.toContain('@font-face')
  })

  it('highlighter has opacity', () => {
    const svg = exportSvg([pen({ highlighter: true })])
    expect(svg).toContain('opacity="0.4"')
    expect(exportSvg([pen()])).not.toContain('opacity=')
  })

  it('viewBox includes arrowheads', () => {
    const plain = { ...arrow, x: 0, endArrowhead: 'none' } as SketchElement
    const headed = { ...arrow, x: 0 } as SketchElement
    const vb = (s: string) => s.match(/viewBox="([^"]+)"/)![1]!.split(' ').map(Number)
    const [px, , pw] = vb(exportSvg([plain]))
    const [hx, hy, hw, hh] = vb(exportSvg([headed]))
    // head wings reach back 16 * cos(25°) from the tip and 16 * sin(25°) off the shaft
    expect(hx! + hw!).toBeGreaterThan(px! + pw!)
    expect(hy!).toBeLessThan(-Math.sin((25 * Math.PI) / 180) * 16)
    expect(hy! + hh!).toBeGreaterThan(Math.sin((25 * Math.PI) / 180) * 16)
  })
})

describe('svg export: M2 kinds', () => {
  const base = { angle: 0, version: 1, locked: false, ...DEFAULT_STYLE, groupIds: [], frameId: null }

  it('svg exports sticky, frame, image, labeled arrow', () => {
    const sticky = {
      ...base, id: 's', type: 'sticky', x: 0, y: 0, w: 200, h: 200, index: 'a0', seed: 1, text: 'Ghi chú', color: '#ffe3e3',
    } as SketchElement
    const frame = {
      ...base, id: 'f', type: 'frame', x: 300, y: 0, w: 400, h: 300, index: 'a1', seed: 2, name: 'Khung <1>',
    } as SketchElement
    const image = {
      ...base, id: 'i', type: 'image', x: 320, y: 20, w: 100, h: 80, index: 'a2', seed: 3, frameId: 'f',
      src: 'https://example.com/a.png?x=1&y=2', naturalW: 200, naturalH: 160, crop: null,
    } as SketchElement
    const arrow = {
      ...base, id: 'r', type: 'arrow', x: 0, y: 400, w: 200, h: 0, index: 'a3', seed: 4,
      points: [[0, 0], [200, 0]], label: 'Có', startBinding: null, endBinding: null, routing: 'straight',
      startArrowhead: 'none', endArrowhead: 'arrow',
    } as SketchElement
    const svg = exportSvg([frame, sticky, image, arrow])
    // sticky: its color as the fill, and its text
    expect(svg).toContain('#ffe3e3')
    expect(svg).toContain('>Ghi chú</tspan>')
    // frame: its (escaped) name above the box
    expect(svg).toContain('>Khung &lt;1&gt;</text>')
    // image: an escaped href
    expect(svg).toContain('<image href="https://example.com/a.png?x=1&amp;y=2"')
    // labeled arrow: the shaft is masked under the label, and the label is drawn
    expect(svg).toContain('mask="url(#')
    expect(svg).toContain('>Có</tspan>')
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
    expect(doc.querySelector('parsererror')).toBeNull()
    // the viewBox covers the frame name above the frame and the arrow below everything
    const [, vy, , vh] = svg.match(/viewBox="([^"]+)"/)![1]!.split(' ').map(Number)
    expect(vy!).toBeLessThan(0)
    expect(vy! + vh!).toBeGreaterThan(400)
  })
})
