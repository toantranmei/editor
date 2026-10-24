import type { AllProps, ElementType, SketchElement } from './types'
import { DEFAULT_STYLE, ELEMENT_TYPES, LINEAR_TYPES, SHAPE_TYPES, TYPE_DEFAULTS } from './types'

/** Style the next element is drawn with; also what the style panel edits. */
export type CurrentStyle = Pick<AllProps,
  | 'stroke' | 'fill' | 'fillStyle' | 'strokeWidth' | 'strokeStyle' | 'roughness' | 'roundness' | 'opacity'
  | 'fontFamily' | 'fontSize' | 'textAlign' | 'routing' | 'startArrowhead' | 'endArrowhead' | 'color'>

export type StyleKey = keyof CurrentStyle

const ARROW = TYPE_DEFAULTS.arrow
const STICKY = TYPE_DEFAULTS.sticky

export const INITIAL_STYLE: Readonly<CurrentStyle> = {
  ...DEFAULT_STYLE,
  routing: ARROW.routing!,
  startArrowhead: ARROW.startArrowhead!,
  endArrowhead: ARROW.endArrowhead!,
  // the last sticky color used: new sticky notes take it
  color: STICKY.color!,
}

/** A style-panel section; each one owns a set of style keys and applies to some element types. */
export type StyleSection =
  | 'stickyColor' | 'stroke' | 'background' | 'fillStyle' | 'strokeWidth' | 'strokeStyle' | 'sloppiness' | 'edges'
  | 'arrowheads' | 'font' | 'opacity'

type Kind = ElementType
const SHAPES: readonly Kind[] = SHAPE_TYPES
const LINEAR: readonly Kind[] = LINEAR_TYPES
const ALL: readonly Kind[] = ELEMENT_TYPES
/** Sticky notes draw no outline: their text is always dark and the fill is the sticky color. */
const OUTLINED: readonly Kind[] = ALL.filter(t => t !== 'sticky')

/** Panel order; `keys` are written by the section, `types` are the element types it applies to. */
export const STYLE_SECTIONS: readonly { id: StyleSection; keys: StyleKey[]; types: readonly Kind[] }[] = [
  { id: 'stickyColor', keys: ['color'], types: ['sticky'] },
  { id: 'stroke', keys: ['stroke'], types: OUTLINED },
  { id: 'background', keys: ['fill'], types: SHAPES },
  { id: 'fillStyle', keys: ['fillStyle'], types: SHAPES },
  { id: 'strokeWidth', keys: ['strokeWidth'], types: OUTLINED.filter(t => t !== 'text') },
  { id: 'strokeStyle', keys: ['strokeStyle'], types: [...SHAPES, ...LINEAR] },
  { id: 'sloppiness', keys: ['roughness'], types: [...SHAPES, ...LINEAR] },
  { id: 'edges', keys: ['roundness'], types: ['rectangle', 'diamond'] },
  { id: 'arrowheads', keys: ['routing', 'startArrowhead', 'endArrowhead'], types: LINEAR },
  { id: 'font', keys: ['fontFamily', 'fontSize', 'textAlign'], types: [...SHAPES, 'text', 'sticky'] },
  { id: 'opacity', keys: ['opacity'], types: ALL },
]

/** Keys of a section a type lacks (sticky text is auto-fit: no font size). */
const EXCLUDED: Partial<Record<Kind, readonly StyleKey[]>> = { sticky: ['fontSize'] }

const RELEVANT = new Map<Kind, ReadonlySet<StyleKey>>(ALL.map(t => [
  t,
  new Set(STYLE_SECTIONS.filter(s => s.types.includes(t)).flatMap(s => s.keys).filter(k => !EXCLUDED[t]?.includes(k))),
]))

/** Style keys that mean something for elements of `type`. */
export function relevantStyleKeys(type: ElementType): ReadonlySet<StyleKey> {
  return RELEVANT.get(type) ?? new Set()
}

/** The entries of `patch` relevant to `el`'s type that differ from its current values (null = none). */
export function stylePatchFor(el: SketchElement, patch: Partial<CurrentStyle>): Partial<CurrentStyle> | null {
  const keys = relevantStyleKeys(el.type)
  const cur = el as unknown as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined && keys.has(k as StyleKey) && cur[k] !== v) out[k] = v
  }
  return Object.keys(out).length ? out as Partial<CurrentStyle> : null
}

/** `el`'s values for the style keys relevant to its type (what "copy style" takes). */
export function styleOf(el: SketchElement): Partial<CurrentStyle> {
  const cur = el as unknown as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const k of relevantStyleKeys(el.type)) if (cur[k] !== undefined) out[k] = cur[k]
  return out as Partial<CurrentStyle>
}
