import { generateKeyBetween } from 'fractional-indexing'
import { nanoid } from 'nanoid'
import * as Y from 'yjs'
import type { ElementPatch, SketchElement } from './types'

export const LOCAL_ORIGIN: unique symbol = Symbol('sketch-local')

type CreateInit = Omit<SketchElement, 'id' | 'index' | 'seed' | 'version'> & Partial<Pick<SketchElement, 'id'>>

function toPlain(m: Y.Map<unknown>): SketchElement {
  return m.toJSON() as SketchElement
}

export class BoardStore {
  readonly doc: Y.Doc
  private readonly elements: Y.Map<Y.Map<unknown>>

  constructor(doc: Y.Doc) {
    this.doc = doc
    this.elements = doc.getMap('elements') as Y.Map<Y.Map<unknown>>
  }

  create(init: CreateInit): SketchElement {
    const { id: givenId, ...rest } = init
    const id = givenId ?? nanoid(10)
    let created!: SketchElement
    this.doc.transact(() => {
      const all = this.all()
      const last = all.length ? all[all.length - 1]!.index : null
      created = {
        ...rest,
        id,
        index: generateKeyBetween(last, null),
        seed: Math.floor(Math.random() * 2 ** 31),
        version: 1,
      } as SketchElement
      const m = new Y.Map<unknown>()
      for (const [k, v] of Object.entries(created)) m.set(k, v)
      this.elements.set(id, m)
    }, LOCAL_ORIGIN)
    return created
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
    m.set('version', ((m.get('version') as number) ?? 0) + 1)
  }

  remove(ids: string[]): void {
    this.doc.transact(() => {
      for (const id of ids) if (this.elements.has(id)) this.elements.delete(id)
    }, LOCAL_ORIGIN)
  }

  get(id: string): SketchElement | undefined {
    const m = this.elements.get(id)
    return m ? toPlain(m) : undefined
  }

  all(): SketchElement[] {
    const out: SketchElement[] = []
    this.elements.forEach(m => out.push(toPlain(m)))
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
