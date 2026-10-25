import { outermostGroup } from '../elements/group'
import type { SketchElement } from '../model/types'
import { cornersBox as cornerBox } from './bounds'
import type { Box } from './math'

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'
export type DistributeAxis = 'h' | 'v'

/** What align / distribute move as one: an element, or every given member of one outermost group. */
interface Unit { els: SketchElement[]; box: Box }

function union(a: Box, b: Box): Box {
  return {
    minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY),
  }
}

/** `els` split into units (elements sharing an outermost group form one), each with its union box. */
function unitsOf(els: readonly SketchElement[]): Unit[] {
  const units: Unit[] = []
  const byGroup = new Map<string, Unit>()
  for (const el of els) {
    const box = cornerBox(el)
    const g = outermostGroup(el)
    const unit = g ? byGroup.get(g) : undefined
    if (unit) {
      unit.els.push(el)
      unit.box = union(unit.box, box)
      continue
    }
    const next = { els: [el], box }
    units.push(next)
    if (g) byGroup.set(g, next)
  }
  return units
}

/** Number of units align / distribute would move: unlocked elements, each outermost group counting once. */
export function arrangeUnits(els: readonly SketchElement[]): number {
  return unitsOf(els.filter(el => !el.locked)).length
}

/** Grouping applies: at least 2 unlocked elements that do not already share one outermost group. */
export function canGroup(els: readonly SketchElement[]): boolean {
  const open = els.filter(el => !el.locked)
  if (open.length < 2) return false
  const outer = outermostGroup(open[0]!)
  return !outer || !open.every(el => outermostGroup(el) === outer)
}

/** Adds `{x, y}` patches moving every element of `unit` by (dx, dy); nothing when it does not move. */
function moveUnit(out: Record<string, { x: number; y: number }>, unit: Unit, dx: number, dy: number): void {
  if (!dx && !dy) return
  for (const el of unit.els) out[el.id] = { x: el.x + dx, y: el.y + dy }
}

/**
 * Patches aligning `els` (groups move as one unit) to the edge / center of their union box, measured on each
 * unit's AABB of `elementCorners`. Only the elements that move get a patch.
 */
export function alignPatches(els: readonly SketchElement[], mode: AlignMode): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {}
  const units = unitsOf(els)
  if (units.length < 2) return out
  const all = units.map(u => u.box).reduce(union)
  for (const u of units) {
    const b = u.box
    let dx = 0
    let dy = 0
    switch (mode) {
      case 'left': dx = all.minX - b.minX; break
      case 'right': dx = all.maxX - b.maxX; break
      case 'hcenter': dx = (all.minX + all.maxX) / 2 - (b.minX + b.maxX) / 2; break
      case 'top': dy = all.minY - b.minY; break
      case 'bottom': dy = all.maxY - b.maxY; break
      case 'vcenter': dy = (all.minY + all.maxY) / 2 - (b.minY + b.maxY) / 2; break
    }
    moveUnit(out, u, dx, dy)
  }
  return out
}

/**
 * Patches spacing `els` (groups move as one unit; at least 3 units) with equal gaps between their AABBs along
 * `axis`. Units are ordered by center; the first and last stay in place.
 */
export function distributePatches(els: readonly SketchElement[], axis: DistributeAxis): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {}
  const units = unitsOf(els)
  if (units.length < 3) return out
  const lo = (b: Box) => (axis === 'h' ? b.minX : b.minY)
  const hi = (b: Box) => (axis === 'h' ? b.maxX : b.maxY)
  units.sort((a, b) => (lo(a.box) + hi(a.box)) - (lo(b.box) + hi(b.box)))
  const first = units[0]!.box
  const last = units[units.length - 1]!.box
  const sizes = units.reduce((s, u) => s + hi(u.box) - lo(u.box), 0)
  const gap = (hi(last) - lo(first) - sizes) / (units.length - 1)
  let at = hi(first) + gap
  for (let i = 1; i < units.length - 1; i++) {
    const u = units[i]!
    const d = at - lo(u.box)
    if (axis === 'h') moveUnit(out, u, d, 0)
    else moveUnit(out, u, 0, d)
    at += hi(u.box) - lo(u.box) + gap
  }
  return out
}
