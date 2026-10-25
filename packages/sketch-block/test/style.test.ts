import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'

import { messages } from '../src/messages'
import { History } from '../src/model/history'
import { Scene } from '../src/model/scene'
import { BoardStore } from '../src/model/store'
import {
  DEFAULT_STYLE, type LinearElement, type ShapeElement, type SketchElement, type TextElement,
} from '../src/model/types'
import { type PointerInput, ToolController } from '../src/tools/controller'
import { BG_COLORS, STROKE_COLORS } from '../src/ui/palette'
import StylePanel from '../src/ui/StylePanel.vue'
import { Viewport } from '../src/viewport'

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 0)
  vi.stubGlobal('cancelAnimationFrame', () => {})
})
afterEach(() => vi.unstubAllGlobals())

function setup(opts: { readonly?: boolean } = {}) {
  const doc = new Y.Doc()
  const store = new BoardStore(doc)
  const scene = new Scene(store)
  const history = new History(store)
  const viewport = new Viewport()
  viewport.zoom = 1
  viewport.x = 0
  viewport.y = 0
  const c = new ToolController({
    store, scene, history, viewport,
    readonly: () => opts.readonly ?? false,
    invalidate: vi.fn(),
  })
  return { doc, store, scene, history, viewport, c }
}

const ptr = (x: number, y: number, extra: Partial<PointerInput> = {}): PointerInput => ({
  screen: { x, y }, button: 0, shift: false, alt: false, mod: false, pressure: 0.5, ...extra,
})
const key = (k: string, mods: { mod?: boolean; shift?: boolean; alt?: boolean; code?: string } = {}) =>
  ({ key: k, mod: false, shift: false, alt: false, ...mods })

function rect(store: BoardStore, x: number, y: number, w: number, h: number, patch: Partial<ShapeElement> = {}) {
  return store.create({
    type: 'rectangle', x, y, w, h, angle: 0, locked: false, ...DEFAULT_STYLE, label: '',
    fill: '#ffffff', fillStyle: 'solid', ...patch,
  }) as ShapeElement
}

function text(store: BoardStore, x: number, y: number, patch: Partial<TextElement> = {}) {
  return store.create({
    type: 'text', x, y, w: 40, h: 25, angle: 0, locked: false, ...DEFAULT_STYLE,
    text: 'hi', autoSize: true, ...patch,
  }) as TextElement
}

function arrow(store: BoardStore, patch: Partial<LinearElement> = {}) {
  return store.create({
    type: 'arrow', x: 0, y: 0, w: 100, h: 0, angle: 0, locked: false, ...DEFAULT_STYLE,
    points: [[0, 0], [100, 0]], routing: 'straight', startArrowhead: 'none', endArrowhead: 'arrow', ...patch,
  }) as LinearElement
}

describe('current style', () => {
  it('starts from DEFAULT_STYLE plus the linear defaults and the default sticky color', () => {
    const { c } = setup()
    expect(c.currentStyle.value).toEqual({
      ...DEFAULT_STYLE, routing: 'straight', startArrowhead: 'none', endArrowhead: 'arrow', color: '#fff3bf',
    })
  })

  it('applyStyle updates selection in one undo step and currentStyle', () => {
    const { c, store, history } = setup()
    const a = rect(store, 0, 0, 50, 50)
    const b = rect(store, 100, 0, 50, 50)
    history.stopCapturing()
    c.setSelection([a.id, b.id])
    c.applyStyle({ stroke: '#e03131' })
    c.applyStyle({ strokeWidth: 4 })
    expect(c.currentStyle.value).toMatchObject({ stroke: '#e03131', strokeWidth: 4 })
    expect(store.get(a.id)).toMatchObject({ stroke: '#e03131', strokeWidth: 4 })
    expect(store.get(b.id)).toMatchObject({ stroke: '#e03131', strokeWidth: 4 })
    // each applyStyle is its own step; one undo reverts both elements of the last one
    history.undo()
    expect(store.get(a.id)).toMatchObject({ stroke: '#e03131', strokeWidth: 2 })
    expect(store.get(b.id)).toMatchObject({ stroke: '#e03131', strokeWidth: 2 })
    history.undo()
    expect(store.get(a.id)!.stroke).toBe('#1e1e1e')
    expect(store.get(b.id)!.stroke).toBe('#1e1e1e')
  })

  it('applyStyle on a mixed locked / unlocked selection changes only the unlocked element', () => {
    const { c, store } = setup()
    const locked = rect(store, 0, 0, 50, 50, { locked: true })
    const free = rect(store, 100, 0, 50, 50)
    c.setSelection([locked.id, free.id])
    c.applyStyle({ stroke: '#e03131', opacity: 0.5 })
    expect(store.get(locked.id)).toMatchObject({ stroke: '#1e1e1e', opacity: 1 })
    expect(store.get(free.id)).toMatchObject({ stroke: '#e03131', opacity: 0.5 })
  })

  it('applyStyle skips locked elements and writes nothing when read-only', () => {
    const { c, store } = setup()
    const a = rect(store, 0, 0, 50, 50, { locked: true })
    c.setSelection([a.id])
    c.applyStyle({ stroke: '#e03131' })
    expect(store.get(a.id)!.stroke).toBe('#1e1e1e')

    const ro = setup({ readonly: true })
    const b = rect(ro.store, 0, 0, 50, 50)
    ro.c.setSelection([b.id])
    ro.c.applyStyle({ stroke: '#e03131' })
    expect(ro.store.get(b.id)!.stroke).toBe('#1e1e1e')
  })

  it('applyStyle only writes relevant props', () => {
    const { c, store } = setup()
    const t = text(store, 0, 0)
    const r = rect(store, 100, 0, 50, 50, { fill: 'transparent', fillStyle: 'hachure' })
    const a = arrow(store)
    c.setSelection([t.id, r.id, a.id])
    c.applyStyle({ fillStyle: 'solid', fill: '#ffc9c9', strokeWidth: 4, endArrowhead: 'dot', fontSize: 36 })
    const tt = store.get(t.id) as TextElement
    expect(tt.fillStyle).toBe('hachure')
    expect(tt.fill).toBe('transparent')
    expect(tt.strokeWidth).toBe(2)
    expect(tt.fontSize).toBe(36)
    expect('endArrowhead' in tt).toBe(false)
    // an auto-sized text refits to the new font size
    expect(tt.h).toBeCloseTo(36 * 1.25)
    expect(store.get(r.id)).toMatchObject({ fillStyle: 'solid', fill: '#ffc9c9', strokeWidth: 4, fontSize: 36 })
    expect('endArrowhead' in store.get(r.id)!).toBe(false)
    const aa = store.get(a.id) as LinearElement
    expect(aa).toMatchObject({ endArrowhead: 'dot', strokeWidth: 4, fillStyle: 'hachure' })
    // lines and arrows take the text style (for their label)
    expect(aa.fontSize).toBe(36)
  })

  it('new rectangle uses currentStyle', () => {
    const { c, store } = setup()
    c.applyStyle({ stroke: '#2f9e44', fill: '#a5d8ff', fillStyle: 'cross-hatch', strokeStyle: 'dashed', roughness: 2 })
    c.setTool('rectangle')
    c.pointerDown(ptr(10, 10))
    c.pointerMove(ptr(60, 60))
    expect(c.overlay().draft).toMatchObject({ stroke: '#2f9e44', fill: '#a5d8ff' })
    c.pointerUp(ptr(60, 60))
    expect(store.all()[0]).toMatchObject({
      type: 'rectangle', stroke: '#2f9e44', fill: '#a5d8ff', fillStyle: 'cross-hatch', strokeStyle: 'dashed', roughness: 2,
    })
  })

  it('new arrow uses the current arrowheads and routing; a line keeps none', () => {
    const { c, store } = setup()
    c.applyStyle({ startArrowhead: 'bar', endArrowhead: 'triangle', routing: 'curved', stroke: '#9c36b5' })
    c.setTool('arrow')
    c.pointerDown(ptr(0, 0))
    c.pointerMove(ptr(80, 0))
    c.pointerUp(ptr(80, 0))
    c.setTool('line')
    c.pointerDown(ptr(0, 50))
    c.pointerMove(ptr(80, 50))
    c.pointerUp(ptr(80, 50))
    const [a, l] = store.all() as LinearElement[]
    expect(a).toMatchObject({ type: 'arrow', startArrowhead: 'bar', endArrowhead: 'triangle', routing: 'curved', stroke: '#9c36b5' })
    expect(l).toMatchObject({ type: 'line', startArrowhead: 'none', endArrowhead: 'none', routing: 'curved', stroke: '#9c36b5' })
  })

  it('new pen stroke and text use currentStyle', () => {
    const { c, store } = setup()
    c.applyStyle({ stroke: '#f08c00', fontFamily: 'code', fontSize: 28, textAlign: 'left' })
    c.setTool('pen')
    c.pointerDown(ptr(0, 0))
    c.pointerMove(ptr(20, 20))
    c.pointerUp(ptr(20, 20))
    expect(store.all()[0]).toMatchObject({ type: 'freedraw', stroke: '#f08c00' })
    c.setTool('text')
    c.pointerDown(ptr(200, 200))
    c.pointerUp(ptr(200, 200))
    const t = store.all().find(e => e.type === 'text') as TextElement
    expect(t).toMatchObject({ stroke: '#f08c00', fontFamily: 'code', fontSize: 28, textAlign: 'left' })
  })

  it('new pen, line, arrow and text elements do not inherit the current fill', () => {
    const { c, store } = setup()
    c.applyStyle({ fill: '#ffc9c9', fillStyle: 'solid', stroke: '#e03131' })
    c.setTool('pen')
    c.pointerDown(ptr(0, 0))
    c.pointerMove(ptr(20, 20))
    c.pointerUp(ptr(20, 20))
    for (const t of ['line', 'arrow'] as const) {
      c.setTool(t)
      c.pointerDown(ptr(0, 100))
      c.pointerMove(ptr(80, 100))
      c.pointerUp(ptr(80, 100))
    }
    c.setTool('text')
    c.pointerDown(ptr(300, 300))
    c.pointerUp(ptr(300, 300))
    const els = store.all()
    expect(els.map(e => e.type).sort()).toEqual(['arrow', 'freedraw', 'line', 'text'])
    for (const el of els) {
      expect(el).toMatchObject({ stroke: '#e03131', fill: DEFAULT_STYLE.fill, fillStyle: DEFAULT_STYLE.fillStyle })
    }
    // shapes still take it
    c.cancelEditing()
    c.setTool('rectangle')
    c.pointerDown(ptr(400, 0))
    c.pointerMove(ptr(450, 50))
    c.pointerUp(ptr(450, 50))
    expect(store.all().find(e => e.type === 'rectangle')).toMatchObject({ fill: '#ffc9c9', fillStyle: 'solid' })
  })

  it('copy/paste style matches the physical key only', () => {
    const { c, store } = setup()
    const a = rect(store, 0, 0, 50, 50)
    c.setSelection([a.id])
    expect(c.keyDown(key('c', { mod: true, alt: true }))).toBe(false)
    expect(c.keyDown(key('c', { mod: true, alt: true, code: 'KeyC' }))).toBe(true)
    expect(c.keyDown(key('v', { mod: true, alt: true }))).toBe(false)
  })

  it('copy/paste style', () => {
    const { c, store, history } = setup()
    const src = rect(store, 0, 0, 50, 50, { stroke: '#1971c2', fill: '#ffec99', fillStyle: 'cross-hatch', opacity: 0.5, roughness: 0 })
    const dst = rect(store, 100, 0, 50, 50)
    const t = text(store, 0, 100)
    history.stopCapturing()
    c.setSelection([src.id])
    // Mac: Cmd+Alt+C reports key 'ç'; the physical key code is matched
    expect(c.keyDown(key('ç', { mod: true, alt: true, code: 'KeyC' }))).toBe(true)
    c.setSelection([dst.id, t.id])
    expect(c.keyDown(key('v', { mod: true, alt: true, code: 'KeyV' }))).toBe(true)
    expect(store.get(dst.id)).toMatchObject({ stroke: '#1971c2', fill: '#ffec99', fillStyle: 'cross-hatch', opacity: 0.5, roughness: 0 })
    // the text takes what applies to text
    expect(store.get(t.id)).toMatchObject({ stroke: '#1971c2', opacity: 0.5, fill: 'transparent', fillStyle: 'hachure', roughness: 1 })
    expect(c.currentStyle.value).toMatchObject({ stroke: '#1971c2', fill: '#ffec99' })
    // one undo step
    history.undo()
    expect(store.get(dst.id)!.stroke).toBe('#1e1e1e')
    expect(store.get(t.id)!.stroke).toBe('#1e1e1e')
  })

  it('send to back / bring to front keep the relative order', () => {
    const { c, store } = setup()
    const a = rect(store, 0, 0, 10, 10)
    const b = rect(store, 0, 0, 10, 10)
    const x = rect(store, 0, 0, 10, 10)
    const y = rect(store, 0, 0, 10, 10)
    c.setSelection([a.id, b.id])
    c.reorderSelection('front')
    expect(store.all().map(e => e.id)).toEqual([x.id, y.id, a.id, b.id])
    c.setSelection([b.id, y.id])
    c.reorderSelection('back')
    expect(store.all().map(e => e.id)).toEqual([y.id, b.id, x.id, a.id])
  })

  it('reordering three selected elements is one undo step', () => {
    const { c, store, history } = setup()
    const els = [0, 1, 2, 3, 4].map(() => rect(store, 0, 0, 10, 10))
    const ids = els.map(e => e.id)
    history.stopCapturing()
    c.setSelection([ids[3]!, ids[0]!, ids[2]!])
    c.reorderSelection('back')
    expect(store.all().map(e => e.id)).toEqual([ids[0], ids[2], ids[3], ids[1], ids[4]])
    history.undo()
    expect(store.all().map(e => e.id)).toEqual(ids)
    c.reorderSelection('front')
    expect(store.all().map(e => e.id)).toEqual([ids[1], ids[4], ids[0], ids[2], ids[3]])
    history.undo()
    expect(store.all().map(e => e.id)).toEqual(ids)
  })
})

describe('eyedropper', () => {
  it('eyedropper picks stroke and alt picks fill then returns to previous tool', () => {
    const { c, store } = setup()
    rect(store, 0, 0, 100, 100, { stroke: '#e03131', fill: '#b2f2bb' })
    c.setTool('ellipse')
    expect(c.keyDown(key('i'))).toBe(true)
    expect(c.tool.value).toBe('eyedropper')
    expect(c.cursor.value).toBe('crosshair')
    c.pointerDown(ptr(50, 50))
    c.pointerUp(ptr(50, 50))
    expect(c.currentStyle.value.stroke).toBe('#e03131')
    expect(c.currentStyle.value.fill).toBe('transparent')
    expect(c.tool.value).toBe('ellipse')

    c.keyDown(key('i'))
    c.pointerDown(ptr(50, 50, { alt: true }))
    c.pointerUp(ptr(50, 50, { alt: true }))
    expect(c.currentStyle.value.fill).toBe('#b2f2bb')
    expect(c.tool.value).toBe('ellipse')
  })

  it('applies the picked color to the selection', () => {
    const { c, store } = setup()
    const src = rect(store, 0, 0, 100, 100, { stroke: '#2f9e44' })
    const dst = rect(store, 300, 0, 100, 100)
    c.setSelection([dst.id])
    c.keyDown(key('i'))
    expect(c.selectedIds.value.has(dst.id)).toBe(true)
    c.pointerDown(ptr(50, 50))
    c.pointerUp(ptr(50, 50))
    expect(store.get(dst.id)!.stroke).toBe('#2f9e44')
    expect(store.get(src.id)!.stroke).toBe('#2f9e44')
    expect(c.tool.value).toBe('select')
  })

  it('a click on empty canvas changes nothing and returns', () => {
    const { c } = setup()
    c.setTool('rectangle')
    c.keyDown(key('i'))
    c.pointerDown(ptr(500, 500))
    c.pointerUp(ptr(500, 500))
    expect(c.currentStyle.value.stroke).toBe('#1e1e1e')
    expect(c.tool.value).toBe('rectangle')
  })

  it('is unavailable when read-only', () => {
    const { c } = setup({ readonly: true })
    expect(c.keyDown(key('i'))).toBe(false)
    expect(c.tool.value).toBe('select')
  })
})

describe('palette', () => {
  it('palette values exact', () => {
    expect(STROKE_COLORS).toEqual(['#1e1e1e', '#e03131', '#2f9e44', '#1971c2', '#f08c00', '#9c36b5'])
    expect(BG_COLORS).toEqual(['transparent', '#ffc9c9', '#b2f2bb', '#a5d8ff', '#ffec99', '#eebefa'])
  })
})

describe('StylePanel', () => {
  const style = { ...DEFAULT_STYLE, routing: 'straight', startArrowhead: 'none', endArrowhead: 'arrow', color: '#fff3bf' } as const
  const el = (patch: Partial<SketchElement> & Pick<SketchElement, 'type'>): SketchElement => ({
    id: Math.random().toString(36), x: 0, y: 0, w: 10, h: 10, angle: 0, index: 'a0', seed: 1, version: 1,
    locked: false, ...DEFAULT_STYLE, label: '', text: '', autoSize: true, points: [[0, 0], [10, 0]],
    pressures: [], highlighter: false, routing: 'straight', startArrowhead: 'none', endArrowhead: 'arrow',
    groupIds: [], frameId: null, ...patch,
  } as unknown as SketchElement)
  const panel = (props: Record<string, unknown>) => mount(StylePanel, {
    props: { elements: [], tool: 'select', currentStyle: style, messages: messages.en, theme: 'light', ...props },
  })
  const sections = (w: ReturnType<typeof panel>) => w.findAll('[data-section]').map(s => s.attributes('data-section'))

  it('StylePanel shows arrowheads only for linear selection', () => {
    expect(sections(panel({ elements: [el({ type: 'arrow' })] }))).toContain('arrowheads')
    expect(sections(panel({ elements: [el({ type: 'rectangle' })] }))).not.toContain('arrowheads')
    expect(sections(panel({ elements: [el({ type: 'text' })] }))).not.toContain('arrowheads')
    expect(sections(panel({ tool: 'arrow' }))).toContain('arrowheads')
  })

  it('shows sections by relevance', () => {
    expect(sections(panel({ elements: [el({ type: 'rectangle' })] }))).toEqual([
      'stroke', 'background', 'fillStyle', 'strokeWidth', 'strokeStyle', 'sloppiness', 'edges', 'font', 'opacity', 'layers', 'arrange',
    ])
    expect(sections(panel({ elements: [el({ type: 'text' })] }))).toEqual(['stroke', 'font', 'opacity', 'layers', 'arrange'])
    expect(sections(panel({ tool: 'pen' }))).toEqual(['stroke', 'strokeWidth', 'opacity'])
    expect(sections(panel({ tool: 'ellipse' }))).not.toContain('edges')
  })

  it('is hidden without a drawing tool or selection, when read-only or hidden', () => {
    expect(panel({}).find('.me-sketch-style').exists()).toBe(false)
    expect(panel({ tool: 'rectangle', hidden: true }).find('.me-sketch-style').exists()).toBe(false)
    expect(panel({ tool: 'rectangle', readonly: true }).find('.me-sketch-style').exists()).toBe(false)
    expect(panel({ tool: 'rectangle' }).find('.me-sketch-style').exists()).toBe(true)
  })

  it('shows the common value or a mixed state', () => {
    const same = panel({ elements: [el({ type: 'rectangle', stroke: '#e03131' }), el({ type: 'ellipse', stroke: '#e03131' })] })
    expect(same.find('[data-section="stroke"] [data-value="#e03131"]').classes()).toContain('is-active')
    const mixed = panel({ elements: [el({ type: 'rectangle', stroke: '#e03131' }), el({ type: 'ellipse', stroke: '#1971c2' })] })
    expect(mixed.find('[data-section="stroke"]').classes()).toContain('is-mixed')
    expect(mixed.findAll('[data-section="stroke"] .is-active')).toHaveLength(0)
  })

  it('has 6 swatches plus a custom color input per color row', () => {
    const w = panel({ elements: [el({ type: 'rectangle' })] })
    for (const s of ['stroke', 'background']) {
      expect(w.findAll(`[data-section="${s}"] .me-sketch-swatch`)).toHaveLength(6)
      expect(w.findAll(`[data-section="${s}"] input[type="color"]`)).toHaveLength(1)
    }
  })

  it('emits apply and layer', async () => {
    const w = panel({ elements: [el({ type: 'arrow' })] })
    await w.find('[data-section="stroke"] [data-value="#2f9e44"]').trigger('click')
    await w.find('[data-section="arrowheads"] [data-end="triangle"]').trigger('click')
    await w.find('[data-section="layers"] [data-layer="back"]').trigger('click')
    expect(w.emitted('apply')).toEqual([[{ stroke: '#2f9e44' }], [{ endArrowhead: 'triangle' }]])
    expect(w.emitted('layer')).toEqual([['back']])
  })

  it('arrange section: group needs 2+, ungroup needs a group, lock toggles', async () => {
    const one = panel({ elements: [el({ type: 'rectangle' })] })
    expect(one.find('[data-arrange="lock"]').exists()).toBe(true)
    expect(one.find('[data-arrange="group"]').exists()).toBe(false)
    expect(one.find('[data-arrange="ungroup"]').exists()).toBe(false)
    const two = panel({ elements: [el({ type: 'rectangle' }), el({ type: 'ellipse', groupIds: ['g'] })] })
    await two.find('[data-arrange="group"]').trigger('click')
    await two.find('[data-arrange="ungroup"]').trigger('click')
    await two.find('[data-arrange="lock"]').trigger('click')
    expect(two.emitted('group')).toHaveLength(1)
    expect(two.emitted('ungroup')).toHaveLength(1)
    expect(two.emitted('lock')).toHaveLength(1)
    expect(two.find('[data-arrange="lock"]').attributes('aria-pressed')).toBe('false')
    const locked = panel({ elements: [el({ type: 'rectangle', locked: true })] })
    expect(locked.find('[data-arrange="lock"]').attributes('aria-pressed')).toBe('true')
    // a toggle: constant name, the state is in aria-pressed
    expect(locked.find('[data-arrange="lock"]').attributes('aria-label')).toBe(two.find('[data-arrange="lock"]').attributes('aria-label'))
    expect(locked.find('[data-arrange="lock"]').attributes('aria-label')).toBe(messages.en.style.lock)
  })

  it('arrange buttons count units: a single group is one unit, locked elements do not count', () => {
    const grp = panel({ elements: [
      el({ type: 'rectangle', groupIds: ['g'] }), el({ type: 'ellipse', groupIds: ['g'] }), el({ type: 'text', groupIds: ['g'] }),
    ] })
    expect(grp.find('[data-align-mode]').exists()).toBe(false)
    expect(grp.find('[data-distribute]').exists()).toBe(false)
    expect(grp.find('[data-arrange="group"]').exists()).toBe(false)
    expect(grp.find('[data-arrange="ungroup"]').exists()).toBe(true)
    const withLocked = panel({ elements: [el({ type: 'rectangle' }), el({ type: 'ellipse', locked: true })] })
    expect(withLocked.find('[data-align-mode]').exists()).toBe(false)
    expect(withLocked.find('[data-arrange="group"]').exists()).toBe(false)
    expect(withLocked.find('[data-arrange="lock"]').exists()).toBe(true)
    // a group plus two loose elements: three units
    const three = panel({ elements: [
      el({ type: 'rectangle', groupIds: ['g'] }), el({ type: 'ellipse', groupIds: ['g'] }), el({ type: 'text' }), el({ type: 'diamond' }),
    ] })
    expect(three.find('[data-distribute]').exists()).toBe(true)
    expect(three.find('[data-arrange="group"]').exists()).toBe(true)
  })

  it('align buttons for 2+, distribute for 3+; emits align / distribute', async () => {
    const one = panel({ elements: [el({ type: 'rectangle' })] })
    expect(one.find('[data-align-mode]').exists()).toBe(false)
    const two = panel({ elements: [el({ type: 'rectangle' }), el({ type: 'ellipse' })] })
    expect(two.findAll('[data-align-mode]').map(b => b.attributes('data-align-mode')))
      .toEqual(['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom'])
    expect(two.find('[data-distribute]').exists()).toBe(false)
    await two.find('[data-align-mode="vcenter"]').trigger('click')
    expect(two.emitted('align')).toEqual([['vcenter']])
    const three = panel({ elements: [el({ type: 'rectangle' }), el({ type: 'ellipse' }), el({ type: 'text' })] })
    expect(three.findAll('[data-distribute]').map(b => b.attributes('data-distribute'))).toEqual(['h', 'v'])
    await three.find('[data-distribute="v"]').trigger('click')
    expect(three.emitted('distribute')).toEqual([['v']])
  })
})
