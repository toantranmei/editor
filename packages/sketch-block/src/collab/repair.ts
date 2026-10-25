/**
 * Derived-data repair. A bound line's geometry (x/y/w/h/points/angle) and every element's `frameId` are derived
 * data, written by the client making the change. Concurrent edits can merge into states no single client wrote:
 * an arrow attached to neither of its moved targets, a child with the `frameId` of a frame a peer deleted. After
 * every transaction that did not come from this client's own edits (remote updates, provider loads, undo / redo),
 * the changed elements' derived data is recomputed from the doc and written where it differs.
 *
 * Convergence: the result is a pure function of the doc state (no local view state, sorted ids), so peers that see
 * the same state compute the same patches; a value is written only when it differs from the stored one (beyond float
 * noise), so a repair that reaches a peer that already has it produces no write and nothing ping-pongs. Frame
 * membership has hysteresis (an element within MEMBERSHIP_EPSILON of a frame edge keeps its `frameId`), so float noise
 * at the edge cannot flip it back and forth, and a per-id circuit breaker stops repairing an id that keeps coming back
 * (peers running different versions of the math). Repair writes use REPAIR_ORIGIN: History tracks LOCAL_ORIGIN only,
 * so they are never undone.
 */
import { affectedByChange, frameMembership } from '../elements/frame'
import { elementCorners } from '../geometry/bounds'
import { followBindings } from '../geometry/binding'
import type { Scene } from '../model/scene'
import { type BoardStore, LOCAL_ORIGIN } from '../model/store'
import { type ElementPatch, isFrame, isLinear, type SketchElement } from '../model/types'

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

/** Membership hysteresis, scene units: within this of a frame's edge, an element keeps its current `frameId`. */
export const MEMBERSHIP_EPSILON = 0.5

/** Circuit breaker: an id repaired this many times within BREAKER_WINDOW_MS is no longer repaired (a loop). */
export const BREAKER_MAX = 3
export const BREAKER_WINDOW_MS = 2000

/**
 * The keys of each patch whose value differs from the stored one; locked or missing elements are left out, and so
 * are ids `skip` refuses.
 */
function differing(
  store: BoardStore, patches: Record<string, ElementPatch>, skip?: (id: string) => boolean,
): Record<string, ElementPatch> {
  const out: Record<string, ElementPatch> = {}
  for (const id of Object.keys(patches).sort()) {
    if (skip?.(id)) continue
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

/**
 * Whether `el`'s corners all lie within `margin` of frame `f`'s box: a positive margin grows the box, a negative one
 * shrinks it.
 */
function cornersWithin(el: SketchElement, f: SketchElement, margin: number): boolean {
  return elementCorners(el).every(c => c.x >= f.x - margin && c.x <= f.x + f.w + margin
    && c.y >= f.y - margin && c.y <= f.y + f.h + margin)
}

/**
 * Whether `el` should keep its current `frameId` although the exact membership test says `next`: it is within
 * MEMBERSHIP_EPSILON of a frame edge, where peers' float noise (or slightly different versions of the math) could
 * disagree and rewrite each other forever. Still a pure function of the doc state.
 */
function keepMembership(scene: Scene, el: SketchElement, next: string | null): boolean {
  const current = el.frameId ? scene.get(el.frameId) : null
  if (el.frameId && (!current || !isFrame(current))) return false // a frame that is gone: always cleared
  // a member stays one while it is inside the frame's box grown by ε
  if (current && cornersWithin(el, current, MEMBERSHIP_EPSILON)) return true
  // a non-member joins only once it is inside the new frame's box shrunk by ε
  const target = next ? scene.get(next) : null
  return !current && !!target && !cornersWithin(el, target, -MEMBERSHIP_EPSILON)
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
    if (next !== el.frameId && !keepMembership(scene, el, next)) out[id] = { frameId: next }
  }
  return out
}

/**
 * Repairs the derived data of `ids` now: bound lines follow (one REPAIR_ORIGIN transaction), then frame membership
 * of everything that changed, the lines it moved included (another), each written only where it differs.
 * Returns the number of transactions written (0 = already consistent).
 */
export function repair(store: BoardStore, scene: Scene, ids: Iterable<string>): number {
  return repairIds(store, scene, ids).writes
}

/** `repair`, also returning the ids written; ids `skip` refuses are never written. */
function repairIds(
  store: BoardStore, scene: Scene, ids: Iterable<string>, skip?: (id: string) => boolean,
): { writes: number; written: string[] } {
  const sorted = [...new Set(ids)].sort()
  if (!sorted.length) return { writes: 0, written: [] }
  let writes = 0
  const follow = differing(store, followPatches(store, scene, sorted), skip)
  const followed = Object.keys(follow)
  if (followed.length) {
    store.updateMany(follow, REPAIR_ORIGIN)
    writes++
  }
  const members = differing(store, frameIdPatches(scene, [...new Set([...sorted, ...followed])].sort()), skip)
  const joined = Object.keys(members)
  if (joined.length) {
    store.updateMany(members, REPAIR_ORIGIN)
    writes++
  }
  return { writes, written: [...new Set([...followed, ...joined])] }
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
  // circuit breaker: when each repair of an id is answered by a change that needs it again (peers disagreeing on
  // the math, or on the version of it), stop repairing that id for a while instead of ping-ponging forever
  const history = new Map<string, number[]>()
  let warned = false
  const recent = (id: string, now: number): number[] => {
    const times = (history.get(id) ?? []).filter(t => now - t < BREAKER_WINDOW_MS)
    if (times.length) history.set(id, times)
    else history.delete(id)
    return times
  }
  const run = (): void => {
    scheduled = false
    if (!active) return
    const ids = pending
    pending = new Set()
    if (opts.canWrite && !opts.canWrite()) return
    const now = Date.now()
    const tripped: string[] = []
    const skip = (id: string) => {
      if (recent(id, now).length < BREAKER_MAX) return false
      tripped.push(id)
      return true
    }
    const { written } = repairIds(store, scene, ids, skip)
    for (const id of written) history.set(id, [...recent(id, now), now])
    if (tripped.length && !warned) {
      warned = true
      console.warn(`[sketch] repair loop: skipping ${tripped.length} element(s) repaired ${BREAKER_MAX} times within ${BREAKER_WINDOW_MS} ms`, tripped)
    }
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
    history.clear()
  }
}
