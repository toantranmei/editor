import { describe, expect, it } from 'vitest'
import { hasKind, kindOf } from '../src/elements/kind'
import { CLIPBOARD_TYPE, parseClipboard } from '../src/io/clipboard'
import { relevantStyleKeys, STYLE_SECTIONS } from '../src/model/style'
import {
  DEFAULT_STYLE, ELEMENT_TYPES, type ElementType, isShape, normalizeElement, SHAPE_TYPES, type SketchElement,
} from '../src/model/types'
import { CREATOR_TOOLS, TOOL_ELEMENT_TYPES } from '../src/tools/controller'

/** Element types whose kinds (and tools) land in later M2 tasks (image: 4, frame: 5); hidden until then. */
const PENDING_KINDS: readonly ElementType[] = ['image', 'frame']
const READY_TYPES = ELEMENT_TYPES.filter(t => !PENDING_KINDS.includes(t))

/** A minimal valid element of `type` (points for the types that need them). */
function sample(type: ElementType): SketchElement {
  return normalizeElement({
    id: `id-${type}`, type, x: 0, y: 0, w: 10, h: 10, angle: 0, index: 'a0', seed: 1, version: 1, locked: false,
    ...DEFAULT_STYLE,
    ...(type === 'line' || type === 'arrow' || type === 'freedraw' ? { points: [[0, 0], [10, 10]] } : {}),
  })
}

describe('element type lists derive from SHAPE_TYPES / ELEMENT_TYPES', () => {
  it('ELEMENT_TYPES includes every shape type', () => {
    for (const t of SHAPE_TYPES) expect(ELEMENT_TYPES).toContain(t)
  })

  it('every element type has a registered kind (pending ones are hidden until their task)', () => {
    for (const t of READY_TYPES) expect(() => kindOf(sample(t))).not.toThrow()
    for (const t of PENDING_KINDS) expect(hasKind(t), t).toBe(false)
  })

  it('isShape is true for exactly the shape types', () => {
    for (const t of ELEMENT_TYPES) expect(isShape(sample(t))).toBe((SHAPE_TYPES as readonly string[]).includes(t))
  })

  it('the clipboard accepts every element type', () => {
    for (const t of READY_TYPES) {
      const { id: _id, index: _index, version: _version, ...rest } = sample(t)
      const r = parseClipboard(JSON.stringify({ type: CLIPBOARD_TYPE, version: 1, elements: [rest] }))
      expect(r, t).toMatchObject({ elements: [{ type: t }] })
    }
  })

  it('the style panel covers every element type; shape sections cover every shape type', () => {
    for (const t of ELEMENT_TYPES) expect(relevantStyleKeys(t).size, t).toBeGreaterThan(0)
    for (const id of ['background', 'fillStyle', 'strokeStyle', 'sloppiness', 'font'] as const) {
      const section = STYLE_SECTIONS.find(s => s.id === id)!
      for (const t of SHAPE_TYPES) expect(section.types, `${id}/${t}`).toContain(t)
    }
  })

  it('every shape type has a creating tool, and the creating tools cover every element type', () => {
    for (const t of SHAPE_TYPES) {
      expect(TOOL_ELEMENT_TYPES[t]).toBe(t)
      expect(CREATOR_TOOLS.has(t)).toBe(true)
    }
    const created = new Set(Object.values(TOOL_ELEMENT_TYPES))
    for (const t of READY_TYPES) expect(created.has(t), t).toBe(true)
    for (const tool of Object.keys(TOOL_ELEMENT_TYPES)) expect(CREATOR_TOOLS.has(tool as never)).toBe(true)
  })
})
