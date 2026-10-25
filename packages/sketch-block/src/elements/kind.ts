import type { Point } from '../geometry/math'
import { type ElementPatch, type ElementType, LINEAR_TYPES, SHAPE_TYPES, type SketchElement } from '../model/types'
import type { Theme } from '../render/shapes'
import { freedrawKind } from './freedraw'
import { imageKind } from './image'
import { linearKind } from './linear'
import { shapeKind } from './shape'
import { stickyKind } from './sticky'
import { textKind } from './text'

/** Per-type behaviour. Renderer, SVG export, hit-testing, bounds and resize only talk to this. */
export interface ElementKind<E extends SketchElement = SketchElement> {
  /** Scene units beyond the box that ink can reach. */
  visualPad(el: E): number
  /** Changes iff the unrotated rendering changes (not x, y, angle, index, version, locked). */
  shapeKey(el: E): string
  /**
   * The shape key also depends on state outside the element (an image's load state), so `shapeKeyOf` must not
   * memoize it per element snapshot.
   */
  volatileKey?: boolean
  /** Local frame, box (0,0)–(w,h), full fidelity. */
  draw(ctx: CanvasRenderingContext2D, el: E, theme: Theme): void
  /** Centered frame (origin at the box center), cheap plain paths for low zoom. */
  drawLod(ctx: CanvasRenderingContext2D, el: E, theme: Theme, zoom: number): void
  /** Markup in the local frame (no wrapping <g>). */
  svg(el: E, theme: Theme): string
  /** `local` is the point in the element's unrotated local frame (0,0)–(w,h); `tol` in scene units. */
  hit(el: E, local: Point, tol: number): boolean
  resize(el: E, next: { x: number; y: number; w: number; h: number }): ElementPatch
}

const registry = new Map<ElementType, ElementKind>()

let builtinsRegistered = false

/**
 * Built-in kinds are registered on first lookup, not at module init, so this module and the kind
 * modules (which import helpers from here) can load in any order.
 */
function registerBuiltins(): void {
  if (builtinsRegistered) return
  builtinsRegistered = true
  for (const t of SHAPE_TYPES) {
    if (!registry.has(t)) registry.set(t, shapeKind as ElementKind)
  }
  if (!registry.has('text')) registry.set('text', textKind as ElementKind)
  if (!registry.has('sticky')) registry.set('sticky', stickyKind as ElementKind)
  if (!registry.has('image')) registry.set('image', imageKind as ElementKind)
  if (!registry.has('freedraw')) registry.set('freedraw', freedrawKind as ElementKind)
  for (const t of LINEAR_TYPES) {
    if (!registry.has(t)) registry.set(t, linearKind as ElementKind)
  }
}

export function registerKind(type: ElementType, kind: ElementKind): void {
  registerBuiltins()
  registry.set(type, kind)
}

/** Whether `type` has a registered kind (types without one are hidden by the store and skipped on paste). */
export function hasKind(type: string): type is ElementType {
  registerBuiltins()
  return registry.has(type as ElementType)
}

export function kindOf(el: SketchElement): ElementKind {
  registerBuiltins()
  const kind = registry.get(el.type)
  if (!kind) throw new Error(`sketch-block: no element kind registered for type "${el.type}"`)
  return kind
}

const shapeKeys = new WeakMap<SketchElement, string>()

/**
 * `kindOf(el).shapeKey(el)`, memoized per element object (elements are immutable snapshots), except for kinds
 * whose key is volatile (they memoize their own static part).
 */
export function shapeKeyOf(el: SketchElement): string {
  const kind = kindOf(el)
  if (kind.volatileKey) return kind.shapeKey(el)
  let k = shapeKeys.get(el)
  if (k === undefined) shapeKeys.set(el, (k = kind.shapeKey(el)))
  return k
}

const arrayHashes = new WeakMap<readonly unknown[], string>()

/**
 * `hashString(JSON.stringify(arr))`, memoized per array identity. Stored arrays (`points`, `pressures`) are
 * written whole and never mutated, and Y hands back the same array on every `toJSON` snapshot, so a moved
 * element's new snapshot reuses the hash instead of re-serializing thousands of points.
 */
export function hashArray(arr: readonly unknown[]): string {
  let h = arrayHashes.get(arr)
  if (h === undefined) arrayHashes.set(arr, (h = hashString(JSON.stringify(arr))))
  return h
}

/** cyrb53: fast 53-bit string hash, base36 (no ':' so it is safe inside cache keys). */
export function hashString(s: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}
