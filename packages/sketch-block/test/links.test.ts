import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import * as Y from 'yjs'

import { CLIPBOARD_TYPE, parseClipboard, serializeClipboard } from '../src/io/clipboard'
import { MAX_LINK_CHARS, openLink, sanitizeLink } from '../src/io/links'
import { messages } from '../src/messages'
import { History } from '../src/model/history'
import { Scene } from '../src/model/scene'
import { BoardStore } from '../src/model/store'
import {
  DEFAULT_STYLE, type ElementInit, isRenderable, normalizeElement, type ShapeElement, type SketchElement,
} from '../src/model/types'
import { linkBadgeCenter, renderInteractive } from '../src/render/interactive'
import { type PointerInput, ToolController } from '../src/tools/controller'
import StylePanel from '../src/ui/StylePanel.vue'
import { Viewport } from '../src/viewport'
import { makeFakeCtx } from './helpers/canvas'

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0))
  vi.stubGlobal('cancelAnimationFrame', () => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function setup() {
  const doc = new Y.Doc()
  const store = new BoardStore(doc)
  const scene = new Scene(store)
  const history = new History(store)
  const viewport = new Viewport()
  const c = new ToolController({
    store, scene, history, viewport,
    readonly: () => false,
    invalidate: vi.fn(),
    viewBox: () => viewport.visibleBox(800, 600),
  })
  return { doc, store, scene, history, viewport, c }
}

const ptr = (x: number, y: number, extra: Partial<PointerInput> = {}): PointerInput => ({
  screen: { x, y }, button: 0, shift: false, alt: false, mod: false, pressure: 0.5, ...extra,
})
const click = (c: ToolController, x: number, y: number, extra: Partial<PointerInput> = {}) => {
  c.pointerDown(ptr(x, y, extra))
  c.pointerUp(ptr(x, y, extra))
}

const rectInit = (over: Partial<ShapeElement> = {}): ElementInit => ({
  type: 'rectangle', x: 0, y: 0, w: 100, h: 50, angle: 0, locked: false, ...DEFAULT_STYLE, label: '',
  fill: '#ffffff', fillStyle: 'solid', ...over,
}) as ElementInit

describe('sanitizeLink', () => {
  it('allowlist', () => {
    expect(sanitizeLink('https://example.com/a?b=1#c')).toBe('https://example.com/a?b=1#c')
    expect(sanitizeLink('http://example.com/')).toBe('http://example.com/')
    // normalized by the URL parser; surrounding blanks trimmed
    expect(sanitizeLink('  https://Example.com  ')).toBe('https://example.com/')
    expect(sanitizeLink('mailto:someone@example.com')).toBe('mailto:someone@example.com')
    expect(sanitizeLink('#el:abc_D-1')).toBe('#el:abc_D-1')
    expect(sanitizeLink(`#el:${'a'.repeat(64)}`)).toBe(`#el:${'a'.repeat(64)}`)
    for (const bad of [
      'ftp://example.com/x', 'file:///etc/passwd', 'data:text/html,<b>x</b>', 'blob:https://example.com/1',
      'vbscript:msgbox(1)', '//example.com', 'example.com', '/relative', '#top', '#el:', '#el:a b', '#el:a/b',
      `#el:${'a'.repeat(65)}`, `https://example.com/${'a'.repeat(MAX_LINK_CHARS)}`, 'https://', '', '   ',
    ]) {
      expect(sanitizeLink(bad), bad).toBeNull()
    }
    for (const bad of [null, undefined, 42, {}, ['https://example.com']]) expect(sanitizeLink(bad)).toBeNull()
  })

  it('javascript: rejected', () => {
    for (const bad of [
      'javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'java\tscript:alert(1)',
      'java\nscript:alert(1)', '\u0000javascript:alert(1)', 'javascript://example.com/%0aalert(1)',
      '#el:x\njavascript:alert(1)',
    ]) {
      expect(sanitizeLink(bad), JSON.stringify(bad)).toBeNull()
    }
    // a stored element with such a link stays renderable, its link read as null
    const raw = {
      id: 'a', type: 'rectangle', index: 'a0', x: 0, y: 0, w: 10, h: 10, angle: 0, link: 'javascript:alert(1)',
    }
    expect(isRenderable(raw)).toBe(true)
    expect(normalizeElement(raw).link).toBeNull()
    expect(normalizeElement({ ...raw, link: 42 }).link).toBeNull()
    expect(normalizeElement({ ...raw, link: undefined }).link).toBeNull()
    // never opened
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    expect(openLink('javascript:alert(1)', { focus: () => true })).toBe(false)
    expect(open).not.toHaveBeenCalled()
    // never stored through the panel's command
    const { store, c } = setup()
    const el = store.create(rectInit())
    expect(c.setLink(el.id, 'javascript:alert(1)')).toBe(false)
    expect(store.get(el.id)!.link).toBeNull()
  })
})

describe('links on the board', () => {
  it('setLink writes one undo step; empty clears; locked elements are never written', () => {
    const { store, history, c } = setup()
    const el = store.create(rectInit())
    history.stopCapturing()
    expect(c.setLink(el.id, ' https://example.com/x ')).toBe(true)
    expect(store.get(el.id)!.link).toBe('https://example.com/x')
    history.stopCapturing()
    expect(c.setLink(el.id, '')).toBe(true)
    expect(store.get(el.id)!.link).toBeNull()
    history.undo()
    expect(store.get(el.id)!.link).toBe('https://example.com/x')
    history.undo()
    expect(store.get(el.id)!.link).toBeNull()
    const locked = store.create(rectInit({ locked: true }))
    expect(c.setLink(locked.id, 'https://example.com/')).toBe(false)
    expect(store.get(locked.id)!.link).toBeNull()
  })

  it('internal link pans and selects', () => {
    const { store, viewport, c } = setup()
    const target = store.create(rectInit({ x: 5000, y: 3000 }))
    const src = store.create(rectInit({ x: 100, y: 100 }))
    c.setLink(src.id, `#el:${target.id}`)
    // via openLink directly
    expect(openLink(`#el:${target.id}`, { focus: id => c.focusElement(id) })).toBe(true)
    expect([...c.selectedIds.value]).toEqual([target.id])
    expect(viewport.toScreen({ x: 5050, y: 3025 })).toEqual({ x: 400, y: 300 })
    // a missing target does nothing
    expect(openLink('#el:missing', { focus: id => c.focusElement(id) })).toBe(false)

    // mod+click on the element follows its link
    viewport.x = 0
    viewport.y = 0
    c.setSelection([])
    click(c, 150, 125, { mod: true })
    expect([...c.selectedIds.value]).toEqual([target.id])
    expect(viewport.toScreen({ x: 5050, y: 3025 })).toEqual({ x: 400, y: 300 })

    // a click on the badge of the selected element follows it too
    viewport.x = 0
    viewport.y = 0
    c.setSelection([src.id])
    const badge = linkBadgeCenter(store.get(src.id)!, viewport)
    click(c, badge.x, badge.y)
    expect([...c.selectedIds.value]).toEqual([target.id])
  })

  it('external opens with noopener', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    expect(openLink('https://example.com/x', { focus: () => false })).toBe(true)
    expect(open).toHaveBeenCalledWith('https://example.com/x', '_blank', 'noopener,noreferrer')
    open.mockClear()
    expect(openLink('mailto:a@example.com', { focus: () => false })).toBe(true)
    expect(open).toHaveBeenCalledWith('mailto:a@example.com', '_blank', 'noopener,noreferrer')
    open.mockClear()

    const { store, c } = setup()
    const el = store.create(rectInit({ x: 100, y: 100 }))
    c.setLink(el.id, 'https://example.com/y')
    // a plain click selects (no open); the badge of the selection opens; mod+click opens
    click(c, 150, 125)
    expect(open).not.toHaveBeenCalled()
    expect([...c.selectedIds.value]).toEqual([el.id])
    const badge = linkBadgeCenter(store.get(el.id)!, c.ctx.viewport)
    click(c, badge.x, badge.y)
    expect(open).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenLastCalledWith('https://example.com/y', '_blank', 'noopener,noreferrer')
    // the badge click did not move or deselect anything
    expect(store.get(el.id)!.x).toBe(100)
    click(c, 150, 125, { mod: true })
    expect(open).toHaveBeenCalledTimes(2)
    // no badge without a link
    const plain = store.create(rectInit({ x: 400, y: 100 }))
    c.setSelection([plain.id])
    const nb = linkBadgeCenter(store.get(plain.id)!, c.ctx.viewport)
    click(c, nb.x, nb.y)
    expect(open).toHaveBeenCalledTimes(2)
  })

  it('link survives copy/paste only for allowed values', () => {
    const { store, c } = setup()
    const a = store.create(rectInit())
    const b = store.create(rectInit({ x: 200 }))
    c.setLink(a.id, 'https://example.com/a')
    c.setLink(b.id, `#el:${a.id}`)
    const parsed = parseClipboard(serializeClipboard([store.get(a.id)!, store.get(b.id)!]))
    expect(parsed).toMatchObject({ elements: [{ link: 'https://example.com/a' }, { link: `#el:${a.id}` }] })
    // a forged payload: disallowed links are dropped
    const forged = JSON.stringify({
      type: CLIPBOARD_TYPE,
      version: 1,
      elements: ['javascript:alert(1)', 'data:text/html,x', 42, 'https://ok.example/', '#el:bad id'].map((link, i) => ({
        ...rectInit({ x: i * 10 }), link,
      })),
    })
    const r = parseClipboard(forged) as { elements: Array<{ link: unknown }> }
    expect(r.elements.map(e => e.link)).toEqual([null, null, null, 'https://ok.example/', null])
    // pasting stores the links; an internal link to an element pasted along points at its copy
    const before = new Set(store.all().map(e => e.id))
    c.pasteElements((parsed as { elements: ElementInit[] }).elements, null)
    const copies = store.all().filter(e => !before.has(e.id))
    expect(copies).toHaveLength(2)
    expect(copies[0]!.link).toBe('https://example.com/a')
    expect(copies[1]!.link).toBe(`#el:${copies[0]!.id}`)
  })

  it('draws a link badge on hovered / selected elements with a link', () => {
    const { store, scene, c } = setup()
    const a = store.create(rectInit())
    c.setLink(a.id, 'https://example.com/')
    const canvas = document.createElement('canvas')
    const state = { viewport: new Viewport(), widthCss: 800, heightCss: 600, dpr: 1, theme: 'light' as const, grid: false, cacheZoom: 1 }
    const base = {
      selectedIds: new Set<string>(), marquee: null, hoverId: null as string | null, draft: null, pointHandles: null, previewSegment: null,
      erasing: new Set<string>(), laser: [], lasso: null, bindTarget: null, guides: [],
    }
    const count = (overlay: typeof base) => {
      const ctx = makeFakeCtx(canvas)
      renderInteractive(ctx, scene, state, overlay)
      return ctx.calls.length
    }
    const idle = count(base)
    expect(count({ ...base, hoverId: a.id })).toBeGreaterThan(idle + 5)
  })
})

describe('StylePanel link input', () => {
  const el = (over: Record<string, unknown> = {}) => normalizeElement({
    id: 'e1', index: 'a0', seed: 1, version: 1, ...rectInit(), ...over,
  })
  const panel = (elements: SketchElement[]) => mount(StylePanel, {
    props: { elements, tool: 'select', currentStyle: setup().c.currentStyle.value, messages: messages.en },
    attachTo: document.body,
  })

  it('shows only for a single selection; saves valid values on Enter / blur; hints at invalid ones', async () => {
    expect(panel([el(), el({ id: 'e2' })]).find('[data-section="link"]').exists()).toBe(false)
    const w = panel([el({ link: 'https://example.com/' })])
    const input = w.find<HTMLInputElement>('[data-section="link"] input')
    expect(input.element.value).toBe('https://example.com/')
    expect(input.attributes('aria-label')).toBe(messages.en.style.link)
    await input.setValue('javascript:alert(1)')
    await input.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('link')).toBeUndefined()
    expect(w.find('.me-sketch-link-hint').text()).toBe(messages.en.style.linkInvalid)
    await input.setValue('https://example.org/x')
    await input.trigger('blur')
    expect(w.emitted('link')).toEqual([['https://example.org/x']])
    await nextTick()
    expect(w.find('.me-sketch-link-hint').exists()).toBe(false)
    await input.setValue('')
    await input.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('link')!.at(-1)).toEqual([''])
    for (const loc of ['vi', 'en'] as const) {
      for (const k of ['link', 'linkPlaceholder', 'linkInvalid'] as const) expect(messages[loc].style[k]).toBeTruthy()
    }
    w.unmount()
  })
})
