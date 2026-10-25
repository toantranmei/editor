import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { kindOf, shapeKeyOf } from '../src/elements/kind'
import { DEFAULT_STYLE, type ShapeElement, type TextElement, type TextStyle } from '../src/model/types'
import { FONT_FAMILIES, LINE_HEIGHT } from '../src/text/fonts'
import { fontString, measureText, setMeasurer, wrapText } from '../src/text/measure'
import { type FakeCtx, stubCanvas } from './helpers/canvas'

// stub measurer: every character is half the font size wide
const stub = (text: string, font: string) => text.length * Number.parseFloat(font) * 0.5

beforeEach(() => {
  stubCanvas()
  setMeasurer(stub)
})
afterEach(() => {
  setMeasurer(null)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const style = (over: Partial<TextStyle> = {}): TextStyle => ({ fontFamily: 'hand', fontSize: 20, textAlign: 'left', ...over })

const textEl = (over: Partial<TextElement> = {}): TextElement => ({
  id: 't', type: 'text', x: 0, y: 0, w: 100, h: 25, angle: 0, index: 'a0',
  ...DEFAULT_STYLE, groupIds: [], frameId: null, link: null, seed: 1, version: 1, locked: false, text: 'hello', autoSize: true, ...over,
})

const shapeEl = (over: Partial<ShapeElement> = {}): ShapeElement => ({
  id: 's', type: 'rectangle', x: 0, y: 0, w: 200, h: 100, angle: 0, index: 'a0',
  ...DEFAULT_STYLE, groupIds: [], frameId: null, link: null, label: '', seed: 42, version: 1, locked: false, ...over,
})

const newCtx = () => document.createElement('canvas').getContext('2d') as unknown as FakeCtx

describe('font constants', () => {
  it('maps font families to the exact CSS stacks', () => {
    expect(FONT_FAMILIES).toEqual({
      hand: '"Mei Hand", "Patrick Hand", cursive',
      normal: 'system-ui, sans-serif',
      code: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    })
    expect(LINE_HEIGHT).toBe(1.25)
    expect(fontString(style({ fontSize: 28, fontFamily: 'code' }))).toBe('28px ui-monospace, SFMono-Regular, Menlo, monospace')
  })
})

describe('wrapText / measureText', () => {
  it('wrapText wraps at maxWidth and keeps explicit newlines', () => {
    // 10px per char at 20px
    expect(wrapText('aaa bbb ccc\ndd', style(), 75)).toEqual(['aaa bbb', 'ccc', 'dd'])
    expect(wrapText('aaa bbb ccc\ndd', style(), null)).toEqual(['aaa bbb ccc', 'dd'])
    expect(wrapText('a\n\nb', style(), null)).toEqual(['a', '', 'b'])
    expect(wrapText('', style(), 50)).toEqual([''])
  })

  it('breaks a word longer than maxWidth', () => {
    expect(wrapText('abcdefghij', style(), 40)).toEqual(['abcd', 'efgh', 'ij'])
    expect(wrapText('xy abcdefghij z', style(), 40)).toEqual(['xy', 'abcd', 'efgh', 'ij z'])
    // never loops forever on a zero width: one character per line
    expect(wrapText('abc', style(), 0)).toEqual(['a', 'b', 'c'])
  })

  it('measureText height = lines × fontSize × 1.25', () => {
    const m = measureText('aaa bbb ccc\ndd', style({ fontSize: 16 }), 60)
    expect(m.lines).toEqual(['aaa bbb', 'ccc', 'dd'])
    expect(m.h).toBe(3 * 16 * 1.25)
    expect(m.w).toBe(7 * 8)
    const one = measureText('hi', style({ fontSize: 36 }), null)
    expect(one).toEqual({ w: 36, h: 36 * 1.25, lines: ['hi'] })
  })

  it('vietnamese text measures without throwing', () => {
    const vi1 = 'Bảng vẽ ắ ề ộ ữ đ'
    expect(measureText(vi1, style(), 60).lines.join(' ')).toBe(vi1)
    setMeasurer(null) // default measurer (no real canvas in happy-dom)
    const m = measureText(vi1, style(), null)
    expect(m.lines).toEqual([vi1])
    expect(m.w).toBeGreaterThan(0)
    expect(m.h).toBe(25)
  })
})

describe('text kind', () => {
  it('is registered for "text" with visualPad 2', () => {
    const e = textEl()
    expect(kindOf(e).visualPad(e)).toBe(2)
  })

  it('shapeKey changes with text, style, stroke and w only when not autoSize', () => {
    const base = shapeKeyOf(textEl())
    expect(shapeKeyOf(textEl({ x: 5, y: 9, angle: 1, version: 3 }))).toBe(base)
    expect(shapeKeyOf(textEl({ w: 300 }))).toBe(base)
    const changes: Partial<TextElement>[] = [
      { text: 'x' }, { fontFamily: 'code' }, { fontSize: 36 }, { textAlign: 'right' }, { stroke: '#e03131' },
    ]
    for (const c of changes) expect(shapeKeyOf(textEl(c))).not.toBe(base)
    const fixed = textEl({ autoSize: false })
    expect(shapeKeyOf(textEl({ autoSize: false, w: 300 }))).not.toBe(shapeKeyOf(fixed))
  })

  it('draws each line with fillText in the stroke color, aligned within w', () => {
    const ctx = newCtx()
    const e = textEl({ text: 'ab\ncd', w: 100, h: 50, textAlign: 'center', stroke: '#1e1e1e' })
    kindOf(e).draw(ctx, e, 'dark')
    const fills = ctx.calls.filter(c => c.name === 'fillText')
    expect(fills.map(c => c.args.slice(0, 2))).toEqual([['ab', 50], ['cd', 50]])
    expect(ctx.calls.some(c => c.name === 'set:fillStyle' && c.args[0] === '#e3e3e3')).toBe(true)
    expect(ctx.calls.some(c => c.name === 'set:font' && c.args[0] === `20px ${FONT_FAMILIES.hand}`)).toBe(true)
  })

  it('text svg escapes <&> and uses tspans', () => {
    const e = textEl({ text: 'a<b>&c\nline 2', textAlign: 'right', w: 100 })
    const svg = kindOf(e).svg(e, 'light')
    expect(svg).toMatch(/^<text [^>]*font-family="&quot;Mei Hand&quot;, &quot;Patrick Hand&quot;, cursive"/)
    expect(svg).toContain('text-anchor="end"')
    expect(svg).toContain('a&lt;b&gt;&amp;c</tspan>')
    expect(svg).toContain('line 2</tspan>')
    expect(svg.match(/<tspan /g)).toHaveLength(2)
    expect(svg).toContain('x="100"')
    expect(svg).not.toMatch(/<b>/)
  })

  it('hit is the box ± tol', () => {
    const e = textEl({ w: 100, h: 25 })
    const k = kindOf(e)
    expect(k.hit(e, { x: 50, y: 10 }, 0)).toBe(true)
    expect(k.hit(e, { x: 103, y: 10 }, 4)).toBe(true)
    expect(k.hit(e, { x: 110, y: 10 }, 4)).toBe(false)
    expect(k.hit(e, { x: 50, y: -5 }, 4)).toBe(false)
  })

  it('resize sets w, measured height for the new width and autoSize false', () => {
    const e = textEl({ text: 'aaa bbb ccc', fontSize: 20 })
    expect(kindOf(e).resize(e, { x: 1, y: 2, w: 75, h: 999 })).toEqual({ x: 1, y: 2, w: 75, h: 2 * 25, autoSize: false })
  })
})

describe('shape labels', () => {
  it('shape label renders in svg centered', () => {
    const e = shapeEl({ label: 'Xin chào', w: 200, h: 100 })
    const svg = kindOf(e).svg(e, 'light')
    const text = svg.slice(svg.indexOf('<text'))
    expect(text).toContain('text-anchor="middle"')
    expect(text).toContain('Xin chào</tspan>')
    // one line, vertically centered: line box 25px tall from y=37.5, baseline at its middle
    expect(text).toMatch(/<tspan x="100" y="50"/)
    expect(kindOf(shapeEl()).svg(shapeEl(), 'light')).not.toContain('<text')
  })

  it('wraps the label to w - 16 and draws it on canvas', () => {
    const ctx = newCtx()
    // 10px per char; w - 16 = 64 → "aaa bbb" (70) does not fit
    const e = shapeEl({ type: 'ellipse', label: 'aaa bbb', w: 80, h: 80 })
    kindOf(e).draw(ctx, e, 'light')
    const fills = ctx.calls.filter(c => c.name === 'fillText')
    expect(fills.map(c => c.args[0])).toEqual(['aaa', 'bbb'])
    expect(fills.map(c => c.args[1])).toEqual([40, 40])
    expect(fills.map(c => c.args[2])).toEqual([27.5, 52.5])
  })
})

describe('loadFonts', () => {
  beforeEach(() => vi.resetModules())

  it('loadFonts is idempotent and resolves even when FontFace is missing', async () => {
    vi.stubGlobal('FontFace', undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { loadFonts } = await import('../src/text/fonts')
    const p = loadFonts()
    expect(loadFonts()).toBe(p)
    await expect(p).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('registers three "Mei Hand" faces with unicode ranges and notifies listeners', async () => {
    const added: { family: string; source: string; desc: FontFaceDescriptors }[] = []
    class FakeFace {
      constructor(public family: string, public source: string, public desc: FontFaceDescriptors) {}
      load() { return Promise.resolve(this) }
    }
    vi.stubGlobal('FontFace', FakeFace)
    const fonts = { add: (f: FakeFace) => added.push(f) }
    Object.defineProperty(document, 'fonts', { value: fonts, configurable: true })
    try {
      const { loadFonts, onFontsLoaded } = await import('../src/text/fonts')
      const cb = vi.fn()
      onFontsLoaded(cb)
      await loadFonts()
      await loadFonts()
      expect(cb).toHaveBeenCalledTimes(1)
      expect(added).toHaveLength(3)
      expect(added.every(f => f.family === 'Mei Hand')).toBe(true)
      expect(added.map(f => f.source).join()).toMatch(/patrick-hand-latin-400-normal\.woff2/)
      expect(added.map(f => f.source).join()).toMatch(/patrick-hand-vietnamese-400-normal\.woff2/)
      expect(added.some(f => f.desc.unicodeRange?.includes('U+1EA0-1EF9'))).toBe(true)
      const late = vi.fn()
      onFontsLoaded(late) // already loaded: called right away
      expect(late).toHaveBeenCalledTimes(1)
    } finally {
      delete (document as { fonts?: unknown }).fonts
    }
  })

  it('never rejects when a face fails to load', async () => {
    class BadFace {
      load() { return Promise.reject(new Error('404')) }
    }
    vi.stubGlobal('FontFace', BadFace)
    Object.defineProperty(document, 'fonts', { value: { add() {} }, configurable: true })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { loadFonts } = await import('../src/text/fonts')
      await expect(loadFonts()).resolves.toBeUndefined()
      expect(warn).toHaveBeenCalled()
    } finally {
      delete (document as { fonts?: unknown }).fonts
    }
  })
})
