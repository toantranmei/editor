/** Shape element types: the single source for every shape list (kinds, clipboard, style panel, tools). */
export const SHAPE_TYPES = [
  'rectangle', 'ellipse', 'diamond', 'triangle', 'pentagon', 'hexagon', 'star', 'parallelogram', 'trapezoid',
  'cylinder', 'cloud', 'callout', 'document', 'stadium', 'blockArrow',
] as const
/** Line-like element types (points + arrowheads). */
export const LINEAR_TYPES = ['line', 'arrow'] as const
/** Every element type the board knows how to render; the single source for every element-type list. */
export const ELEMENT_TYPES = [...SHAPE_TYPES, ...LINEAR_TYPES, 'freedraw', 'text', 'sticky', 'image', 'frame'] as const

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
  /** Nested groups, innermost first. */
  groupIds: string[]
  /** The frame containing this element (null = none). */
  frameId: string | null
}

/** An arrow endpoint attached to an element; (ax, ay) is the anchor in the target's unrotated unit box (0..1). */
export interface Binding {
  id: string
  ax: number
  ay: number
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

export interface LinearElement extends CommonProps, TextStyle {
  type: LinearType
  label: string
  startBinding: Binding | null
  endBinding: Binding | null
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

/** A sticky note: filled with `color`, text auto-fit (no fontSize); `stroke` is unused. */
export interface StickyElement extends CommonProps, Omit<TextStyle, 'fontSize'> {
  type: 'sticky'
  text: string
  color: string
}

export interface ImageCrop {
  x: number
  y: number
  w: number
  h: number
}

export interface ImageElement extends CommonProps {
  type: 'image'
  src: string
  naturalW: number
  naturalH: number
  crop: ImageCrop | null
}

export interface FrameElement extends CommonProps {
  type: 'frame'
  name: string
}

export type SketchElement =
  | ShapeElement | LinearElement | FreedrawElement | TextElement | StickyElement | ImageElement | FrameElement

/** Every prop of every element type (minus `type`), for patches that may target any element. */
export type AllProps =
  & Omit<ShapeElement, 'type'>
  & Omit<LinearElement, 'type'>
  & Omit<FreedrawElement, 'type'>
  & Omit<TextElement, 'type'>
  & Omit<StickyElement, 'type'>
  & Omit<ImageElement, 'type'>
  & Omit<FrameElement, 'type'>

export type ElementPatch = Partial<Omit<AllProps, 'id' | 'version'>>

/** Props an init may leave out; `normalizeElement` fills them in on read. */
type DefaultedProp = 'groupIds' | 'frameId' | 'label' | 'startBinding' | 'endBinding'

export type ElementInit =
  & DistributiveOmit<SketchElement, 'id' | 'index' | 'seed' | 'version' | DefaultedProp>
  & { id?: string; seed?: number } & Partial<Pick<AllProps, DefaultedProp>>

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
        : T extends 'sticky' ? StickyElement
          : T extends 'image' ? ImageElement
            : T extends 'frame' ? FrameElement
              : TextElement

/** Sticky note colors (the first is the default). */
export const STICKY_COLORS = ['#fff3bf', '#ffe3e3', '#d3f9d8', '#d0ebff', '#f3d9fa', '#ffe8cc', '#e9ecef', '#c5f6fa'] as const
/** Default sticky width and height, scene units. */
export const STICKY_SIZE = 200

const SHAPE_DEFAULTS = { label: '' } as const
const LINEAR_DEFAULTS = {
  routing: 'straight', startArrowhead: 'none', label: '', startBinding: null, endBinding: null,
} as const
/** Defaults every element type shares (beyond DEFAULT_STYLE). */
const COMMON_DEFAULTS: Pick<CommonProps, 'groupIds' | 'frameId'> = { groupIds: [], frameId: null }

/** Type-specific defaults filled in when a stored element lacks the field. */
export const TYPE_DEFAULTS: { [T in ElementType]: Partial<ElementOf<T>> } = {
  ...Object.fromEntries(SHAPE_TYPES.map(t => [t, SHAPE_DEFAULTS])) as { [T in ShapeType]: Partial<ShapeElement> },
  line: { ...LINEAR_DEFAULTS, endArrowhead: 'none' },
  arrow: { ...LINEAR_DEFAULTS, endArrowhead: 'arrow' },
  freedraw: { highlighter: false, pressures: [] },
  text: { text: '', autoSize: true },
  sticky: { text: '', color: STICKY_COLORS[0] },
  image: { src: '', naturalW: 0, naturalH: 0, crop: null },
  frame: { name: '' },
}

/** A default sticky note (STICKY_SIZE square, first palette color) with its top-left corner at (x, y). */
export function stickyInit(x: number, y: number, over: Partial<Omit<StickyElement, 'type' | 'id' | 'index' | 'version'>> = {}): ElementInit {
  return {
    ...DEFAULT_STYLE,
    type: 'sticky', x, y, w: STICKY_SIZE, h: STICKY_SIZE, angle: 0, locked: false, text: '', color: STICKY_COLORS[0],
    ...over,
  }
}

/** Raster data URLs an image may use (SVG and other types can carry script or are not images). */
const IMAGE_DATA_RE = /^data:image\/(?:png|jpeg|webp|gif)[;,]/i
const IMAGE_URL_RE = /^https?:\/\//i
const IMAGE_BLOB_RE = /^blob:/i

/**
 * Whether `src` may be used as an image source: an http(s) URL, a png / jpeg / webp / gif data URL, or (when
 * `allowBlob`) a blob: URL. Anything else (`javascript:`, `file:`, SVG data, leading spaces...) is refused.
 * blob: URLs only live as long as the page that made them, so pasted ones are refused (`allowBlob` false).
 */
export function isImageSrc(src: unknown, allowBlob = true): src is string {
  if (typeof src !== 'string') return false
  return IMAGE_URL_RE.test(src) || IMAGE_DATA_RE.test(src) || (allowBlob && IMAGE_BLOB_RE.test(src))
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

const isFinitePair = (p: unknown): boolean => Array.isArray(p) && p.length >= 2 && isFiniteNumber(p[0]) && isFiniteNumber(p[1])
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
/** Anchors may sit a little outside the target's unit box (a bound tip is pushed off the outline). */
const BINDING_MIN = -0.5
const BINDING_MAX = 1.5
const isAnchorCoord = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= BINDING_MIN && v <= BINDING_MAX

/**
 * A stored / pasted binding as a clean `Binding` (only id, ax, ay), or null when it is not one: an object with a
 * string `id` and finite `ax` / `ay` in [-0.5, 1.5].
 */
export function cleanBinding(v: unknown): Binding | null {
  if (!isRecord(v) || typeof v.id !== 'string' || !isAnchorCoord(v.ax) || !isAnchorCoord(v.ay)) return null
  return { id: v.id, ax: v.ax, ay: v.ay }
}
const isCropValue = (v: unknown): boolean =>
  v === null || (isRecord(v) && isFiniteNumber(v.x) && isFiniteNumber(v.y) && isFiniteNumber(v.w) && isFiniteNumber(v.h))
const isStringArray = (v: unknown): boolean => Array.isArray(v) && v.every(s => typeof s === 'string')

/** Optional stored props: when present they must pass the check (absent ones are defaulted on read). */
/** A stored image's `src` (URL or data URL) longer than this is not rendered. */
export const MAX_IMAGE_SRC_CHARS = 6_000_000
const HEX6 = /^#[0-9a-f]{6}$/i

const OPTIONAL_CHECKS: Record<string, (v: unknown) => boolean> = {
  pressures: Array.isArray,
  text: v => typeof v === 'string',
  label: v => typeof v === 'string',
  name: v => typeof v === 'string',
  src: v => typeof v === 'string',
  color: v => typeof v === 'string',
  naturalW: isFiniteNumber,
  naturalH: isFiniteNumber,
  crop: isCropValue,
  groupIds: isStringArray,
  frameId: v => v === null || typeof v === 'string',
  // bindings are not checked here: a malformed one is normalized to null on read (the line stays visible)
}

/**
 * Whether a stored element (raw Y map JSON) is structurally sound: a known type, string id, valid order key, finite
 * geometry, a `points` array of finite [x, y] pairs where the type needs one, an allowed `src` for an image
 * (see `isImageSrc`), and well-typed optional props.
 * Anything else (a newer client's type, a corrupt peer) is skipped by the store's reads and left untouched in Y.
 * (The store additionally hides types whose element kind is not registered yet.)
 */
export function isRenderable(raw: Record<string, unknown>): boolean {
  if (typeof raw.type !== 'string' || !KNOWN_TYPES.has(raw.type)) return false
  if (typeof raw.id !== 'string' || !isOrderKey(raw.index)) return false
  if (!isFiniteNumber(raw.x) || !isFiniteNumber(raw.y) || !isFiniteNumber(raw.w) || !isFiniteNumber(raw.h)) return false
  if (!isFiniteNumber(raw.angle)) return false
  if (POINTS_TYPES.has(raw.type) && !(Array.isArray(raw.points) && raw.points.every(isFinitePair))) return false
  // an image needs a src with an allowed scheme (never `javascript:` and the like), of a sane length
  if (raw.type === 'image' && !(isImageSrc(raw.src) && raw.src.length <= MAX_IMAGE_SRC_CHARS)) return false
  // a sticky's fill is a 6-digit hex color (drawn as is, also into SVG)
  if (raw.type === 'sticky' && raw.color !== undefined && !(typeof raw.color === 'string' && HEX6.test(raw.color))) return false
  for (const [k, ok] of Object.entries(OPTIONAL_CHECKS)) {
    if (raw[k] !== undefined && !ok(raw[k])) return false
  }
  return true
}

/**
 * Fills fields missing from a stored element (e.g. an M0 board) from DEFAULT_STYLE + TYPE_DEFAULTS.
 * Present fields win; array defaults are fresh copies so callers never share them.
 */
export function normalizeElement(raw: Record<string, unknown>): SketchElement {
  const out: Record<string, unknown> = { ...DEFAULT_STYLE }
  const typeDefaults = TYPE_DEFAULTS[raw.type as ElementType] as Record<string, unknown> | undefined
  for (const defaults of [COMMON_DEFAULTS, typeDefaults ?? {}] as Record<string, unknown>[]) {
    for (const [k, v] of Object.entries(defaults)) out[k] = Array.isArray(v) ? [...v] : v
  }
  for (const [k, v] of Object.entries(raw)) {
    if (v !== undefined) out[k] = v
  }
  if (LINEAR_SET.has(raw.type as string)) {
    out.startBinding = cleanBinding(out.startBinding)
    out.endBinding = cleanBinding(out.endBinding)
  }
  return out as unknown as SketchElement
}

const SHAPE_SET: ReadonlySet<string> = new Set<string>(SHAPE_TYPES)
const LINEAR_SET: ReadonlySet<string> = new Set<string>(LINEAR_TYPES)

export const isShape = (el: SketchElement): el is ShapeElement => SHAPE_SET.has(el.type)
export const isLinear = (el: SketchElement): el is LinearElement => LINEAR_SET.has(el.type)
export const isFreedraw = (el: SketchElement): el is FreedrawElement => el.type === 'freedraw'
export const isText = (el: SketchElement): el is TextElement => el.type === 'text'
export const isSticky = (el: SketchElement): el is StickyElement => el.type === 'sticky'
export const isImage = (el: SketchElement): el is ImageElement => el.type === 'image'
export const isFrame = (el: SketchElement): el is FrameElement => el.type === 'frame'
/** Elements an arrow endpoint can bind to: shapes, sticky notes, text and images (not frames, lines or ink). */
export const isBindable = (el: SketchElement): el is ShapeElement | StickyElement | TextElement | ImageElement =>
  isShape(el) || isSticky(el) || isText(el) || isImage(el)
