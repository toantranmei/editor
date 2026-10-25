import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing'
import { nanoid } from 'nanoid'
import * as Y from 'yjs'
import { hasKind } from '../elements/kind'
import { type ElementInit, type ElementPatch, isOrderKey, isRenderable, normalizeElement, type SketchElement } from './types'

export const LOCAL_ORIGIN: unique symbol = Symbol('sketch-local')

/**
 * The element as a plain object, or undefined when it cannot be rendered (unknown type, malformed, or a type
 * whose element kind is not registered).
 */
function toPlain(m: Y.Map<unknown>): SketchElement | undefined {
  const raw = m.toJSON()
  return isRenderable(raw) && hasKind(raw.type as string) ? normalizeElement(raw) : undefined
}

export class BoardStore {
  readonly doc: Y.Doc
  private readonly elements: Y.Map<Y.Map<unknown>>
  /** Highest `index` currently in the doc (null = empty). Only valid while `topDirty` is false. */
  private topIndex: string | null = null
  private topDirty = true

  constructor(doc: Y.Doc) {
    this.doc = doc
    this.elements = doc.getMap('elements') as Y.Map<Y.Map<unknown>>
    // Local writes keep the cache current themselves; anything else (remote, undo/redo) invalidates it.
    this.elements.observeDeep((_events, tr) => {
      if (tr.origin !== LOCAL_ORIGIN) this.topDirty = true
    })
  }

  create(init: ElementInit): SketchElement {
    return this.createMany([init])[0]!
  }

  /**
   * Creates all elements in one transaction, stacked in order above the current top, or (`atBack`) below the
   * current bottom (still in their relative order).
   */
  createMany(inits: ElementInit[], opts: { atBack?: boolean } = {}): SketchElement[] {
    const out: SketchElement[] = []
    if (!inits.length) return out
    this.doc.transact(() => {
      let top = this.top()
      const backKeys = opts.atBack ? generateNKeysBetween(null, this.bottom(), inits.length) : null
      for (const [i, init] of inits.entries()) {
        const { id: givenId, seed, ...rest } = init
        const index = backKeys ? backKeys[i]! : generateKeyBetween(top, null)
        const created: Record<string, unknown> = {
          ...rest,
          id: givenId ?? nanoid(10),
          index,
          seed: seed ?? Math.floor(Math.random() * 2 ** 31),
          version: 1,
        }
        const m = new Y.Map<unknown>()
        for (const [k, v] of Object.entries(created)) if (v !== undefined) m.set(k, v)
        this.elements.set(created.id as string, m)
        // what a read returns: defaults filled in for props the init left out
        out.push(normalizeElement(created))
        if (top === null || index > top) top = index
      }
      this.topIndex = top
    }, LOCAL_ORIGIN)
    return out
  }

  /** Highest valid index in the doc; recomputed by an O(n) scan of `index` values only when dirty. */
  private top(): string | null {
    if (this.topDirty) {
      let top: string | null = null
      this.elements.forEach(m => {
        const i = m.get('index')
        // an invalid key (corrupt / foreign element) would make fractional-indexing throw: ignore it
        if (typeof i === 'string' && (top === null || i > top) && isOrderKey(i)) top = i
      })
      this.topIndex = top
      this.topDirty = false
    }
    return this.topIndex
  }

  /** Lowest valid index in the doc (null = empty); an O(n) scan. */
  private bottom(): string | null {
    let bottom: string | null = null
    this.elements.forEach(m => {
      const i = m.get('index')
      if (typeof i === 'string' && (bottom === null || i < bottom) && isOrderKey(i)) bottom = i
    })
    return bottom
  }

  update(id: string, patch: ElementPatch): void {
    this.doc.transact(() => this.applyPatch(id, patch), LOCAL_ORIGIN)
  }

  updateMany(patches: Record<string, ElementPatch>): void {
    this.doc.transact(() => {
      for (const [id, patch] of Object.entries(patches)) this.applyPatch(id, patch)
    }, LOCAL_ORIGIN)
  }

  private applyPatch(id: string, patch: ElementPatch): void {
    const m = this.elements.get(id)
    if (!m) return
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) m.set(k, v)
    }
    // Moving above the top raises it; any other index change may lower it, so rescan lazily.
    if (patch.index !== undefined) {
      if (!this.topDirty && this.topIndex !== null && patch.index > this.topIndex) this.topIndex = patch.index
      else this.topDirty = true
    }
    m.set('version', ((m.get('version') as number) ?? 0) + 1)
  }

  /** Removes `ids`, applying `patches` to the remaining elements in the same transaction. */
  remove(ids: string[], patches: Record<string, ElementPatch> = {}): void {
    this.doc.transact(() => {
      for (const [id, patch] of Object.entries(patches)) this.applyPatch(id, patch)
      for (const id of ids) if (this.elements.has(id)) this.elements.delete(id)
    }, LOCAL_ORIGIN)
  }

  /** The element, or undefined when missing or not renderable. */
  get(id: string): SketchElement | undefined {
    const m = this.elements.get(id)
    return m ? toPlain(m) : undefined
  }

  /** Renderable elements in z-order; unknown / malformed ones are skipped (and left in Y untouched). */
  all(): SketchElement[] {
    const out: SketchElement[] = []
    this.elements.forEach(m => {
      const el = toPlain(m)
      if (el) out.push(el)
    })
    return out.sort((a, b) => (a.index < b.index ? -1 : a.index > b.index ? 1 : a.id < b.id ? -1 : 1))
  }

  reorder(id: string, to: 'front' | 'back'): void {
    const all = this.all()
    if (!all.some(e => e.id === id)) return
    const edge = to === 'front' ? all[all.length - 1] : all[0]
    if (!edge || edge.id === id) return
    const index = to === 'front'
      ? generateKeyBetween(edge.index, null)
      : generateKeyBetween(null, edge.index)
    this.doc.transact(() => this.applyPatch(id, { index }), LOCAL_ORIGIN)
  }

  /**
   * Moves `ids` above (front) or below (back) every other element, keeping their relative z-order, in one
   * transaction. Unknown ids are ignored; ids that already form the top (front) / bottom (back) run are left
   * as they are.
   */
  reorderMany(ids: string[], to: 'front' | 'back'): void {
    const all = this.all()
    const wanted = new Set(ids)
    const moving = all.filter(e => wanted.has(e.id))
    if (!moving.length || moving.length === all.length) return
    // already the top / bottom run: nothing to move (and no empty undo step)
    const edge = to === 'front' ? all.slice(all.length - moving.length) : all.slice(0, moving.length)
    if (edge.every(e => wanted.has(e.id))) return
    const keys = to === 'front'
      ? generateNKeysBetween(all[all.length - 1]!.index, null, moving.length)
      : generateNKeysBetween(null, all[0]!.index, moving.length)
    this.doc.transact(() => {
      moving.forEach((el, i) => this.applyPatch(el.id, { index: keys[i]! }))
    }, LOCAL_ORIGIN)
  }

  onChange(cb: (changedIds: Set<string>) => void): () => void {
    const handler = (events: Y.YEvent<any>[]) => {
      const ids = new Set<string>()
      for (const ev of events) {
        if (ev.path.length > 0) {
          ids.add(String(ev.path[0]))
        } else {
          for (const k of (ev as Y.YMapEvent<unknown>).keysChanged) ids.add(k)
        }
      }
      if (ids.size) cb(ids)
    }
    this.elements.observeDeep(handler)
    return () => this.elements.unobserveDeep(handler)
  }
}
