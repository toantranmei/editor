import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { hasKind } from '../src/elements/kind'
import { CLIPBOARD_TYPE, parseClipboard } from '../src/io/clipboard'
import { BoardStore } from '../src/model/store'
import {
  DEFAULT_STYLE,
  type ElementInit,
  ELEMENT_TYPES,
  isBindable,
  isFrame,
  isImage,
  isLinear,
  isRenderable,
  isShape,
  isSticky,
  normalizeElement,
  SHAPE_TYPES,
  STICKY_COLORS,
  STICKY_SIZE,
  stickyInit,
} from '../src/model/types'

const M1_RECT = {
  id: 'r1', type: 'rectangle', x: 0, y: 0, w: 100, h: 50, angle: 0, index: 'a0', seed: 1, version: 1, locked: false,
  ...DEFAULT_STYLE, label: 'hi',
}
const M1_ARROW = {
  id: 'a1', type: 'arrow', x: 0, y: 0, w: 10, h: 0, angle: 0, index: 'a1', seed: 1, version: 1, locked: false,
  stroke: '#1e1e1e', points: [[0, 0], [10, 0]], routing: 'straight', startArrowhead: 'none', endArrowhead: 'arrow',
}

describe('M2 element model', () => {
  it('normalizes M1 elements with M2 defaults', () => {
    const r = normalizeElement({ ...M1_RECT })
    expect(r).toMatchObject({ groupIds: [], frameId: null, label: 'hi' })
    const a = normalizeElement({ ...M1_ARROW })
    expect(isLinear(a)).toBe(true)
    expect(a).toMatchObject({
      groupIds: [], frameId: null, label: '', startBinding: null, endBinding: null,
      fontFamily: DEFAULT_STYLE.fontFamily, fontSize: DEFAULT_STYLE.fontSize, textAlign: DEFAULT_STYLE.textAlign,
    })
    // array defaults are fresh copies
    const b = normalizeElement({ ...M1_RECT })
    expect(b.groupIds).not.toBe(r.groupIds)
  })

  it('sticky defaults', () => {
    expect(STICKY_COLORS).toEqual(['#fff3bf', '#ffe3e3', '#d3f9d8', '#d0ebff', '#f3d9fa', '#ffe8cc', '#e9ecef', '#c5f6fa'])
    expect(STICKY_SIZE).toBe(200)
    const n = normalizeElement({ id: 's', type: 'sticky', index: 'a0' })
    expect(isSticky(n)).toBe(true)
    expect(n).toMatchObject({ color: '#fff3bf', text: '', groupIds: [], frameId: null })
    const init = stickyInit(10, 20)
    expect(init).toMatchObject({ type: 'sticky', x: 10, y: 20, w: 200, h: 200, color: '#fff3bf', text: '', angle: 0 })
    const s = new BoardStore(new Y.Doc()).create(init)
    expect(s).toMatchObject({ type: 'sticky', w: 200, h: 200, color: '#fff3bf' })
  })

  it('image and frame normalize', () => {
    const img = normalizeElement({ id: 'i', type: 'image', index: 'a0' })
    expect(isImage(img)).toBe(true)
    expect(img).toMatchObject({ src: '', naturalW: 0, naturalH: 0, crop: null, groupIds: [], frameId: null })
    const fr = normalizeElement({ id: 'f', type: 'frame', index: 'a1' })
    expect(isFrame(fr)).toBe(true)
    expect(fr).toMatchObject({ name: '', groupIds: [], frameId: null })
  })

  it('ElementInit accepts new types', () => {
    const inits: ElementInit[] = [
      { type: 'sticky', x: 0, y: 0, w: 200, h: 200, angle: 0, locked: false, ...DEFAULT_STYLE, text: 'a', color: '#ffe3e3' },
      {
        type: 'image', x: 0, y: 0, w: 10, h: 10, angle: 0, locked: false, ...DEFAULT_STYLE,
        src: 'data:image/png;base64,', naturalW: 10, naturalH: 10, crop: { x: 0, y: 0, w: 1, h: 1 },
      },
      { type: 'frame', x: 0, y: 0, w: 10, h: 10, angle: 0, locked: false, ...DEFAULT_STYLE, name: 'F', groupIds: ['g'] },
      { type: 'star', x: 0, y: 0, w: 10, h: 10, angle: 0, locked: false, ...DEFAULT_STYLE, label: '' },
      {
        type: 'arrow', x: 0, y: 0, w: 10, h: 0, angle: 0, locked: false, ...DEFAULT_STYLE,
        points: [[0, 0], [10, 0]], routing: 'straight', startArrowhead: 'none', endArrowhead: 'arrow',
        label: 'x', startBinding: { id: 'r', ax: 1, ay: 0.5 }, endBinding: null,
      },
    ]
    const doc = new Y.Doc()
    const made = new BoardStore(doc).createMany(inits)
    expect(made.map(e => e.type)).toEqual(['sticky', 'image', 'frame', 'star', 'arrow'])
    expect(made[2]!.groupIds).toEqual(['g'])
    expect(made[0]!.groupIds).toEqual([])
  })

  it('has the 15 shape types and the new element types', () => {
    expect(SHAPE_TYPES).toEqual([
      'rectangle', 'ellipse', 'diamond', 'triangle', 'pentagon', 'hexagon', 'star', 'parallelogram', 'trapezoid',
      'cylinder', 'cloud', 'callout', 'document', 'stadium', 'blockArrow',
    ])
    for (const t of ['sticky', 'image', 'frame'] as const) expect(ELEMENT_TYPES).toContain(t)
  })

  it('isBindable: shapes, sticky, text, image; not frame, linear or freedraw', () => {
    const n = (type: string, extra: Record<string, unknown> = {}) => normalizeElement({ id: type, type, index: 'a0', ...extra })
    expect(isBindable(n('rectangle'))).toBe(true)
    expect(isBindable(n('cloud'))).toBe(true)
    expect(isShape(n('cloud'))).toBe(true)
    expect(isBindable(n('sticky'))).toBe(true)
    expect(isBindable(n('text'))).toBe(true)
    expect(isBindable(n('image'))).toBe(true)
    expect(isBindable(n('frame'))).toBe(false)
    expect(isBindable(n('arrow'))).toBe(false)
    expect(isBindable(n('freedraw'))).toBe(false)
  })
})

describe('isRenderable (M2)', () => {
  const base = { ...M1_RECT }

  it('validates point contents', () => {
    const line = { ...M1_ARROW, type: 'line' }
    expect(isRenderable(line)).toBe(true)
    expect(isRenderable({ ...line, points: [[0, 0], [1]] })).toBe(false)
    expect(isRenderable({ ...line, points: [[0, 0], [1, Number.NaN]] })).toBe(false)
    expect(isRenderable({ ...line, points: [[0, 0], 'x'] })).toBe(false)
    expect(isRenderable({ ...line, points: [[0, '1']] })).toBe(false)
  })

  it('validates text and label are strings', () => {
    expect(isRenderable({ ...base, label: 3 })).toBe(false)
    expect(isRenderable({ ...base, type: 'text', text: { a: 1 } })).toBe(false)
    expect(isRenderable({ ...base, type: 'text', text: 'ok' })).toBe(true)
    expect(isRenderable({ ...M1_ARROW, label: null })).toBe(false)
  })

  it('validates groupIds, frameId and bindings', () => {
    expect(isRenderable({ ...base, groupIds: ['a', 'b'], frameId: 'f' })).toBe(true)
    expect(isRenderable({ ...base, groupIds: 'a' })).toBe(false)
    expect(isRenderable({ ...base, groupIds: [1] })).toBe(false)
    expect(isRenderable({ ...base, frameId: 3 })).toBe(false)
    expect(isRenderable({ ...M1_ARROW, startBinding: { id: 'r', ax: 0, ay: 1 }, endBinding: null })).toBe(true)
    expect(isRenderable({ ...M1_ARROW, startBinding: { id: 'r', ax: Number.NaN, ay: 1 } })).toBe(false)
    expect(isRenderable({ ...M1_ARROW, endBinding: 'r' })).toBe(false)
  })

  it('accepts new shapes and validates new element types structurally', () => {
    expect(isRenderable({ ...base, type: 'blockArrow' })).toBe(true)
    expect(isRenderable({ ...base, type: 'sticky', text: 'a', color: '#fff3bf' })).toBe(true)
    expect(isRenderable({ ...base, type: 'sticky', color: 5 })).toBe(false)
    const src = 'https://cdn.example/a.png'
    expect(isRenderable({ ...base, type: 'image', src, naturalW: 1, naturalH: 1, crop: null })).toBe(true)
    expect(isRenderable({ ...base, type: 'image', src: 5 })).toBe(false)
    expect(isRenderable({ ...base, type: 'image', src: 'javascript:alert(1)' })).toBe(false)
    expect(isRenderable({ ...base, type: 'image', src, crop: { x: 0, y: 0, w: 'a', h: 1 } })).toBe(false)
    expect(isRenderable({ ...base, type: 'frame', name: 'F' })).toBe(true)
    expect(isRenderable({ ...base, type: 'frame', name: [] })).toBe(false)
  })

  it('the store hides types without a registered kind (sticky / image / frame until Tasks 3-5)', () => {
    const doc = new Y.Doc()
    const s = new BoardStore(doc)
    const els = doc.getMap('elements') as Y.Map<Y.Map<unknown>>
    for (const raw of [base, { ...base, id: 'st', type: 'sticky', index: 'a1' }, { ...base, id: 'tr', type: 'triangle', index: 'a2' }]) {
      const m = new Y.Map<unknown>()
      for (const [k, v] of Object.entries(raw)) m.set(k, v)
      els.set(raw.id, m)
    }
    const visible = ELEMENT_TYPES.filter(hasKind)
    expect(visible).toContain('triangle')
    expect(s.all().map(e => e.id)).toEqual(hasKind('sticky') ? ['r1', 'st', 'tr'] : ['r1', 'tr'])
  })
})

describe('clipboard (M2)', () => {
  const paste = (el: Record<string, unknown>) =>
    parseClipboard(JSON.stringify({ type: CLIPBOARD_TYPE, version: 1, elements: [el] }))

  it('accepts new shapes and carries groupIds (strings, capped at 16)', () => {
    const groupIds = Array.from({ length: 20 }, (_, i) => `g${i}`)
    const r = paste({ ...M1_RECT, type: 'hexagon', groupIds, frameId: 'f' }) as { elements: ElementInit[] }
    expect(r.elements).toHaveLength(1)
    expect(r.elements[0]).toMatchObject({ type: 'hexagon', frameId: null })
    expect(r.elements[0]!.groupIds).toEqual(groupIds.slice(0, 16))
    const bad = paste({ ...M1_RECT, groupIds: [1, 'a'] }) as { elements: ElementInit[] }
    expect(bad.elements[0]!.groupIds).toEqual([])
  })

  it('keeps an arrow label, drops bindings', () => {
    const r = paste({
      ...M1_ARROW, label: 'yes', startBinding: { id: 'x', ax: 0, ay: 0 }, endBinding: { id: 'y', ax: 1, ay: 1 },
    }) as { elements: ElementInit[] }
    expect(r.elements[0]).toMatchObject({ type: 'arrow', label: 'yes', startBinding: null, endBinding: null })
  })

  it('skips element types without a registered kind', () => {
    const r = paste({ ...M1_RECT, type: 'frame', name: 'F' }) as { elements: ElementInit[] }
    expect(r.elements).toHaveLength(hasKind('frame') ? 1 : 0)
  })
})
