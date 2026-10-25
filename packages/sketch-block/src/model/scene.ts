import RBush from 'rbush'
import { type Box, elementBounds, hitElement, type Point } from '../geometry'
import type { BoardStore } from './store'
import type { SketchElement } from './types'

interface Item { minX: number; minY: number; maxX: number; maxY: number; id: string }

const byZ = (a: SketchElement, b: SketchElement) =>
  a.index < b.index ? -1 : a.index > b.index ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0

/** Immutable-ish snapshot of the board with a spatial index. Owns element identity stability. */
export class Scene {
  elements: readonly SketchElement[] = []
  private readonly map = new Map<string, SketchElement>()
  private readonly tree = new RBush<Item>()
  private readonly items = new Map<string, Item>()
  private readonly order = new Map<string, number>()
  private readonly listeners = new Set<(ids: Set<string>) => void>()
  private readonly off: () => void

  constructor(private readonly store: BoardStore) {
    const all = store.all()
    const items: Item[] = []
    for (const el of all) {
      this.map.set(el.id, el)
      const item = this.makeItem(el)
      this.items.set(el.id, item)
      items.push(item)
    }
    this.tree.load(items)
    this.setElements(all)
    this.off = store.onChange(ids => this.apply(ids))
  }

  get(id: string): SketchElement | undefined {
    return this.map.get(id)
  }

  queryBox(box: Box): SketchElement[] {
    const hits = this.tree.search(box)
    hits.sort((a, b) => this.order.get(a.id)! - this.order.get(b.id)!)
    return hits.map(h => this.map.get(h.id)!)
  }

  hitTest(p: Point, tolerance: number): SketchElement | undefined {
    const hits = this.tree.search({
      minX: p.x - tolerance, minY: p.y - tolerance, maxX: p.x + tolerance, maxY: p.y + tolerance,
    })
    hits.sort((a, b) => this.order.get(b.id)! - this.order.get(a.id)!)
    for (const h of hits) {
      const el = this.map.get(h.id)!
      if (hitElement(el, p, tolerance)) return el
    }
    return undefined
  }

  contentBounds(): Box | null {
    if (!this.elements.length) return null
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const it of this.items.values()) {
      if (it.minX < minX) minX = it.minX
      if (it.minY < minY) minY = it.minY
      if (it.maxX > maxX) maxX = it.maxX
      if (it.maxY > maxY) maxY = it.maxY
    }
    return { minX, minY, maxX, maxY }
  }

  onChange(cb: (changedIds: Set<string>) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  destroy(): void {
    this.off()
    this.listeners.clear()
  }

  private makeItem(el: SketchElement): Item {
    return { ...elementBounds(el), id: el.id }
  }

  private setElements(arr: SketchElement[]): void {
    this.elements = arr
    this.order.clear()
    arr.forEach((el, i) => this.order.set(el.id, i))
  }

  private apply(ids: Set<string>): void {
    let resort = false
    for (const id of ids) {
      const oldItem = this.items.get(id)
      const old = this.map.get(id)
      if (oldItem) {
        this.tree.remove(oldItem)
        this.items.delete(id)
      }
      const next = this.store.get(id)
      if (next) {
        const item = this.makeItem(next)
        this.tree.insert(item)
        this.items.set(id, item)
        this.map.set(id, next)
        if (!old || old.index !== next.index) resort = true
      } else {
        this.map.delete(id)
        if (old) resort = true
      }
    }
    if (resort) {
      this.setElements([...this.map.values()].sort(byZ))
    } else {
      this.setElements(this.elements.map(el => this.map.get(el.id)!))
    }
    for (const cb of [...this.listeners]) cb(ids)
  }
}
