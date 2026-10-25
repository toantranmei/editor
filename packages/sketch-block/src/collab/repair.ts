/**
 * Derived-data repair. A bound line's geometry (x/y/w/h/points/angle) and every element's `frameId` are derived
 * data, written by the client making the change. Concurrent edits can merge into states no single client wrote:
 * an arrow attached to neither of its moved targets, a child with the `frameId` of a frame a peer deleted. After
 * every transaction that did not come from this client's own edits (remote updates, provider loads, undo / redo),
 * the changed elements' derived data is recomputed from the doc and written where it differs.
 *
 * Convergence: the result is a pure function of the doc state (no local view state, sorted ids), so peers that see
 * the same state compute the same patches; a value is written only when it differs from the stored one (beyond float
 * noise), so a repair that reaches a peer that already has it produces no write and nothing ping-pongs. Repair
 * writes use REPAIR_ORIGIN: History tracks LOCAL_ORIGIN only, so they are never undone.
 */
import { affectedByChange, frameMembership } from '../elements/frame'
import { followBindings } from '../geometry/binding'
import type { Scene } from '../model/scene'
import { type BoardStore, LOCAL_ORIGIN } from '../model/store'
import { type ElementPatch, isLinear } from '../model/types'

/** Origin of repair writes (untracked by History, ignored by the repair observer itself). */
export const REPAIR_ORIGIN: unique symbol = Symbol('sketch-repair')

/** Numbers this close (relative to their size) are the same value: recomputing derived floats adds noise. */
const EPSILON = 1e-6

function near(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) <= EPSILON * Math.max(1, Math.abs(a), Math.abs(b))
  }
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => near(v, b[i]))
  if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null && !Array.isArray(a) && !Array.isArray(b)) {
    const ka = Object.keys(a)
    const kb = Object.keys(b)
    return ka.length === kb.length
      && ka.every(k => near((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  }
  return false
}

/** The keys of each patch whose value differs from the stored one; locked or missing elements are left out. */
function differing(store: BoardStore, patches: Record<string, ElementPatch>): Record<string, ElementPatch> {
  const out: Record<string, ElementPatch> = {}
  for (const id of Object.keys(patches).sort()) {
    const cur = store.get(id) as unknown as Record<string, unknown> | undefined
    // locked elements are never written (as everywhere)
    if (!cur || cur.locked) continue
    const patch: Record<string, unknown> = {}
    let any = false
    for (const [k, v] of Object.entries(patches[id]!)) {
      if (v === undefined || near(cur[k], v)) continue
      patch[k] = v
      any = true
    }
    if (any) out[id] = patch as ElementPatch
  }
  return out
}

/**
 * Bound-line follow patches for `ids`: lines are re-routed to their targets and never let go of one because they
 * moved (`detach` empty). A target that is gone makes the binding null; a target the doc holds but this client
 * cannot render (a newer client's type) leaves the line alone rather than unbinding it.
 */
function followPatches(store: BoardStore, scene: Scene, ids: readonly string[]): Record<string, ElementPatch> {
  const out = followBindings(store, scene, ids, {}, new Set())
  for (const lineId of Object.keys(out)) {
    const line = scene.get(lineId)
    if (!line || !isLinear(line)) continue
    const foreign = [line.startBinding, line.endBinding].some(b => b && !scene.get(b.id) && store.has(b.id))
    if (foreign) delete out[lineId]
  }
  return out
}

/** `frameId` patches for `ids`, the elements they affect, and the children of the frames among them (gone too). */
function frameIdPatches(scene: Scene, ids: readonly string[]): Record<string, ElementPatch> {
  const changed = new Set(ids)
  const candidates = new Set(affectedByChange(scene, ids))
  // children of a changed frame, including a deleted one (affectedByChange only sees frames that exist)
  for (const el of scene.elements) if (el.frameId && changed.has(el.frameId) && !el.locked) candidates.add(el.id)
  const out: Record<string, ElementPatch> = {}
  for (const id of [...candidates].sort()) {
    const el = scene.get(id)
    if (!el || el.locked) continue
    const next = frameMembership(scene, el)
    if (next !== el.frameId) out[id] = { frameId: next }
  }
  return out
}

/**
 * Repairs the derived data of `ids` now: bound lines follow (one REPAIR_ORIGIN transaction), then frame membership
 * of everything that changed, the lines it moved included (another), each written only where it differs.
 * Returns the number of transactions written (0 = already consistent).
 */
export function repair(store: BoardStore, scene: Scene, ids: Iterable<string>): number {
  const sorted = [...new Set(ids)].sort()
  if (!sorted.length) return 0
  let writes = 0
  const follow = differing(store, followPatches(store, scene, sorted))
  const followed = Object.keys(follow)
  if (followed.length) {
    store.updateMany(follow, REPAIR_ORIGIN)
    writes++
  }
  const members = differing(store, frameIdPatches(scene, [...new Set([...sorted, ...followed])].sort()))
  if (Object.keys(members).length) {
    store.updateMany(members, REPAIR_ORIGIN)
    writes++
  }
  return writes
}

export interface RepairOptions {
  /** False while this client must not write (read-only): changes are dropped, other peers repair them. */
  canWrite?: () => boolean
}

/**
 * Observes `store` and repairs the derived data of the elements changed by every transaction whose origin is
 * neither LOCAL_ORIGIN (our edits keep it consistent themselves) nor REPAIR_ORIGIN. Changes are batched and repaired
 * on the next microtask. Returns the uninstaller (pending repairs are dropped).
 */
export function installRepair(store: BoardStore, scene: Scene, opts: RepairOptions = {}): () => void {
  let pending = new Set<string>()
  let scheduled = false
  let active = true
  const run = (): void => {
    scheduled = false
    if (!active) return
    const ids = pending
    pending = new Set()
    if (opts.canWrite && !opts.canWrite()) return
    repair(store, scene, ids)
  }
  const off = store.onChange((ids, origin) => {
    if (origin === LOCAL_ORIGIN || origin === REPAIR_ORIGIN) return
    for (const id of ids) pending.add(id)
    if (scheduled) return
    scheduled = true
    queueMicrotask(run)
  })
  return () => {
    if (!active) return
    active = false
    off()
    pending.clear()
  }
}
