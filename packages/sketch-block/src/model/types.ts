/** Shape element types: the single source for every shape list (kinds, clipboard, style panel, tools). */
export const SHAPE_TYPES = ['rectangle', 'ellipse', 'diamond'] as const
/** Line-like element types (points + arrowheads). */
export const LINEAR_TYPES = ['line', 'arrow'] as const
/** Every element type the board knows how to render; the single source for every element-type list. */
export const ELEMENT_TYPES = [...SHAPE_TYPES, ...LINEAR_TYPES, 'freedraw', 'text'] as const

export type ShapeType = typeof SHAPE_TYPES[number]
export type LinearType = typeof LINEAR_TYPES[number]
export type ElementType = typeof ELEMENT_TYPES[number]
export type FillStyle = 'hachure' | 'cross-hatch' | 'solid' | 'none'
export type FontFamily = 'hand' | 'normal' | 'code'
export type FontSize = 16 | 20 | 28 | 36
export type TextAlign = 'left' | 'center' | 'right'
export type Arrowhead = 'none' | 'arrow' | 'triangle' | 'dot' | 'bar'
export type Routing = 'straight' | 'elbow' | 'curved'
/** Point relative to the element's (x, y). */
export type LocalPoint = [number, number]

export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/** Props shared by every element. fill/roundness live on all types so the style panel stays uniform. */
export interface CommonProps {
  id: string
  type: ElementType
  x: number
  y: number
  w: number
  h: number
  angle: number
  index: string
  seed: number
  version: number
  locked: boolean
  opacity: number
  stroke: string
  strokeWidth: 1 | 2 | 4
  strokeStyle: 'solid' | 'dashed' | 'dotted'
  roughness: 0 | 1 | 2
  fill: string
  fillStyle: FillStyle
  roundness: 'sharp' | 'round'
}

export interface TextStyle {
  fontFamily: FontFamily
  fontSize: FontSize
  textAlign: TextAlign
}

export interface ShapeElement extends CommonProps, TextStyle {
  type: ShapeType
  label: string
}

export interface LinearElement extends CommonProps {
  type: LinearType
  points: LocalPoint[]
  routing: Routing
  startArrowhead: Arrowhead
  endArrowhead: Arrowhead
}

export interface FreedrawElement extends CommonProps {
  type: 'freedraw'
  points: LocalPoint[]
  pressures: number[]
  highlighter: boolean
}

export interface TextElement extends CommonProps, TextStyle {
  type: 'text'
  text: string
  autoSize: boolean
}

export type SketchElement = ShapeElement | LinearElement | FreedrawElement | TextElement

/** Every prop of every element type (minus `type`), for patches that may target any element. */
export type AllProps =
  & Omit<ShapeElement, 'type'>
  & Omit<LinearElement, 'type'>
  & Omit<FreedrawElement, 'type'>
  & Omit<TextElement, 'type'>

export type ElementPatch = Partial<Omit<AllProps, 'id' | 'version'>>

export type ElementInit =
  & DistributiveOmit<SketchElement, 'id' | 'index' | 'seed' | 'version'>
  & { id?: string; seed?: number }

type StyleKey =
  | 'stroke' | 'fill' | 'fillStyle' | 'strokeWidth' | 'strokeStyle' | 'roughness' | 'roundness' | 'opacity'
  | keyof TextStyle

export const DEFAULT_STYLE: Pick<AllProps, StyleKey> = {
  stroke: '#1e1e1e',
  fill: 'transparent',
  fillStyle: 'hachure',
  strokeWidth: 2,
  strokeStyle: 'solid',
  roughness: 1,
  roundness: 'round',
  opacity: 1,
  fontFamily: 'hand',
  fontSize: 20,
  textAlign: 'center',
}

type ElementOf<T extends ElementType> =
  T extends ShapeType ? ShapeElement
    : T extends LinearElement['type'] ? LinearElement
      : T extends 'freedraw' ? FreedrawElement
        : TextElement

const SHAPE_DEFAULTS = { label: '' } as const
const LINEAR_DEFAULTS = { routing: 'straight', startArrowhead: 'none' } as const

/** Type-specific defaults filled in when a stored element lacks the field. */
export const TYPE_DEFAULTS: { [T in ElementType]: Partial<ElementOf<T>> } = {
  rectangle: SHAPE_DEFAULTS,
  ellipse: SHAPE_DEFAULTS,
  diamond: SHAPE_DEFAULTS,
  line: { ...LINEAR_DEFAULTS, endArrowhead: 'none' },
  arrow: { ...LINEAR_DEFAULTS, endArrowhead: 'arrow' },
  freedraw: { highlighter: false, pressures: [] },
  text: { text: '', autoSize: true },
}

const KNOWN_TYPES: ReadonlySet<string> = new Set<string>(ELEMENT_TYPES)
const POINTS_TYPES: ReadonlySet<string> = new Set<string>([...LINEAR_TYPES, 'freedraw'])
const isFiniteNumber = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v)
const BASE62 = /^[0-9A-Za-z]+$/
const SMALLEST_KEY = `A${'0'.repeat(26)}`

/**
 * Whether `key` is a valid fractional-indexing order key (the library throws on invalid ones): a head letter
 * fixing the integer part's length, base-62 digits, and no trailing zero in the fractional part.
 */
export function isOrderKey(key: unknown): key is string {
  if (typeof key !== 'string' || !BASE62.test(key)) return false
  const head = key.charCodeAt(0)
  const intLength = head >= 97 && head <= 122 ? head - 97 + 2 : head >= 65 && head <= 90 ? 90 - head + 2 : 0
  if (!intLength || key.length < intLength || key === SMALLEST_KEY) return false
  return key.length === intLength || !key.endsWith('0')
}

/**
 * Whether a stored element (raw Y map JSON) can be rendered: a known type, string id, valid order key, finite geometry
 * and a `points` array where the type needs one. Anything else (a newer client's type, a corrupt peer) is
 * skipped by the store's reads and left untouched in Y.
 */
export function isRenderable(raw: Record<string, unknown>): boolean {
  if (typeof raw.type !== 'string' || !KNOWN_TYPES.has(raw.type)) return false
  if (typeof raw.id !== 'string' || !isOrderKey(raw.index)) return false
  if (!isFiniteNumber(raw.x) || !isFiniteNumber(raw.y) || !isFiniteNumber(raw.w) || !isFiniteNumber(raw.h)) return false
  if (!isFiniteNumber(raw.angle)) return false
  if (POINTS_TYPES.has(raw.type) && !Array.isArray(raw.points)) return false
  if (raw.pressures !== undefined && !Array.isArray(raw.pressures)) return false
  return true
}

/**
 * Fills fields missing from a stored element (e.g. an M0 board) from DEFAULT_STYLE + TYPE_DEFAULTS.
 * Present fields win; array defaults are fresh copies so callers never share them.
 */
export function normalizeElement(raw: Record<string, unknown>): SketchElement {
  const out: Record<string, unknown> = { ...DEFAULT_STYLE }
  const typeDefaults = TYPE_DEFAULTS[raw.type as ElementType] as Record<string, unknown> | undefined
  if (typeDefaults) {
    for (const [k, v] of Object.entries(typeDefaults)) out[k] = Array.isArray(v) ? [...v] : v
  }
  for (const [k, v] of Object.entries(raw)) {
    if (v !== undefined) out[k] = v
  }
  return out as unknown as SketchElement
}

const SHAPE_SET: ReadonlySet<string> = new Set<string>(SHAPE_TYPES)
const LINEAR_SET: ReadonlySet<string> = new Set<string>(LINEAR_TYPES)

export const isShape = (el: SketchElement): el is ShapeElement => SHAPE_SET.has(el.type)
export const isLinear = (el: SketchElement): el is LinearElement => LINEAR_SET.has(el.type)
export const isFreedraw = (el: SketchElement): el is FreedrawElement => el.type === 'freedraw'
export const isText = (el: SketchElement): el is TextElement => el.type === 'text'
