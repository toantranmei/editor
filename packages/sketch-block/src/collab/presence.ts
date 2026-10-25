/**
 * Presence over a y-protocols `Awareness` (networked providers): the local state shape, validation of peers'
 * states, a throttled publisher and a remote state reader. Only types come from y-protocols, so nothing here
 * pulls it into a bundle; with no awareness the board never constructs any of this.
 */
import type { Awareness } from 'y-protocols/awareness'
import { cornersBox, elementCorners } from '../geometry/bounds'
import type { Box, Point } from '../geometry/math'
import type { Scene } from '../model/scene'
import { MAX_ZOOM, MIN_ZOOM } from '../viewport'

/** Minimum time between two publishes of the local state, ms. */
export const PRESENCE_THROTTLE_MS = 50
/** Default user colors; a guest gets one by hashing its client id. */
export const GUEST_COLORS = ['#e03131', '#2f9e44', '#1971c2', '#f08c00', '#9c36b5', '#0c8599'] as const
export const MAX_NAME_LENGTH = 40
export const MAX_LASER_POINTS = 200
export const MAX_SELECTION_IDS = 2000
/** Longest element id accepted in a peer's selection. */
const MAX_ID_LENGTH = 64

export interface PresenceUser { name: string; color: string }
/** `sketch.configure({ user })`: a fixed identity or a function returning one (called when a board opens). */
export type UserOption = PresenceUser | (() => PresenceUser)

/** A laser trail point (scene coords; `t` on the sender's clock); `start` begins a stroke. */
export interface PresenceLaserPoint { x: number; y: number; t: number; start?: boolean }

/**
 * The local awareness state. `viewport` is the scene point at the center of the view plus the zoom, so a
 * follower with another canvas size keeps the same center.
 */
export interface PresenceState {
  user: PresenceUser
  cursor: Point | null
  selection: string[]
  viewport: { x: number; y: number; zoom: number } | null
  laser: PresenceLaserPoint[]
}

/** A remote peer, sanitized; its laser `t` values are on our clock. */
export interface RemotePeer extends PresenceState {
  clientId: number
}

function hashId(id: number): number {
  // integer mix (Murmur3 finalizer) so neighbouring ids spread over the palette
  let h = id >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

export function guestColor(clientId: number): string {
  return GUEST_COLORS[hashId(clientId) % GUEST_COLORS.length]!
}

/** `Khách N` / `Guest N` with a palette color, both stable for a client id. */
export function defaultUser(clientId: number, locale: 'vi' | 'en'): PresenceUser {
  const n = (clientId >>> 0) % 1000
  return { name: `${locale === 'en' ? 'Guest' : 'Khách'} ${n}`, color: guestColor(clientId) }
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
// C0/C1 controls and bidi overrides / isolates: they would garble a name tag
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\u0000-\u001F\u007F-\u009F‎‏‪-‮⁦-⁩]/g

/** Zero-width and other invisible format characters (a name made only of these would render blank). */
const INVISIBLE_CHARS = /[\u200B-\u200D\u2060\uFEFF]/g

export function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return [...raw.slice(0, 400).replace(UNSAFE_CHARS, '').replace(INVISIBLE_CHARS, '').trim()].slice(0, MAX_NAME_LENGTH).join('').trim()
}

export function sanitizeColor(raw: unknown): string | null {
  return typeof raw === 'string' && HEX_COLOR.test(raw) ? raw.toLowerCase() : null
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** The local identity: the `user` option (a function is called; failures fall back), else a guest. */
export function resolveUser(option: UserOption | null | undefined, clientId: number, locale: 'vi' | 'en'): PresenceUser {
  const guest = defaultUser(clientId, locale)
  let raw: unknown = option
  if (typeof option === 'function') {
    try {
      raw = option()
    } catch {
      raw = null
    }
  }
  if (!isObj(raw)) return guest
  return { name: sanitizeName(raw.name) || guest.name, color: sanitizeColor(raw.color) ?? guest.color }
}

/**
 * Validates and clamps a peer's awareness state: null unless it is an object with a `user` object. Names are cut
 * to 40 characters without control characters (empty when invalid), colors must be hex (else the client's guest
 * color), the cursor and viewport must be finite (the zoom is clamped), at most 2000 string selection ids and the
 * newest 200 valid laser points are kept.
 */
export function sanitizePresence(raw: unknown, clientId = 0): PresenceState | null {
  if (!isObj(raw) || !isObj(raw.user)) return null
  const user = { name: sanitizeName(raw.user.name), color: sanitizeColor(raw.user.color) ?? guestColor(clientId) }
  const c = raw.cursor
  const cursor = isObj(c) && isNum(c.x) && isNum(c.y) ? { x: c.x, y: c.y } : null
  const selection: string[] = []
  if (Array.isArray(raw.selection)) {
    const src = raw.selection
    for (let i = 0; i < src.length && selection.length < MAX_SELECTION_IDS; i++) {
      const id = src[i]
      if (typeof id === 'string' && id.length > 0 && id.length <= MAX_ID_LENGTH) selection.push(id)
    }
  }
  const v = raw.viewport
  const viewport = isObj(v) && isNum(v.x) && isNum(v.y) && isNum(v.zoom) && v.zoom > 0
    ? { x: v.x, y: v.y, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom)) }
    : null
  const laser: PresenceLaserPoint[] = []
  if (Array.isArray(raw.laser)) {
    const src = raw.laser
    // newest points last: walk back from the end
    for (let i = src.length - 1; i >= 0 && laser.length < MAX_LASER_POINTS; i--) {
      const p = src[i]
      if (!isObj(p) || !isNum(p.x) || !isNum(p.y) || !isNum(p.t)) continue
      laser.push(p.start === true ? { x: p.x, y: p.y, t: p.t, start: true } : { x: p.x, y: p.y, t: p.t })
    }
    laser.reverse()
  }
  return { user, cursor, selection, viewport, laser }
}

type Timers = { set: (fn: () => void, ms: number) => unknown; clear: (h: unknown) => void }
const defaultTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: h => clearTimeout(h as ReturnType<typeof setTimeout>),
}

/**
 * Publishes the local state: the identity at once, later changes merged and sent by one trailing timer at most
 * every 50 ms. `destroy` clears the local state (only if this publisher set it).
 */
export class PresencePublisher {
  private pending: Partial<PresenceState> | null = null
  private timer: unknown = null
  private published = false
  private destroyed = false

  constructor(
    private readonly awareness: Awareness,
    private readonly user: PresenceUser,
    private readonly timers: Timers = defaultTimers,
  ) {
    this.write({ user, cursor: null, selection: [], viewport: null, laser: [] })
  }

  set(patch: Partial<PresenceState>): void {
    if (this.destroyed) return
    this.pending = this.pending ? Object.assign(this.pending, patch) : { ...patch }
    if (this.timer === null) this.timer = this.timers.set(() => this.flush(), PRESENCE_THROTTLE_MS)
  }

  /** Sends pending changes now. */
  flush(): void {
    if (this.timer !== null) this.timers.clear(this.timer)
    this.timer = null
    const patch = this.pending
    this.pending = null
    if (patch && !this.destroyed) this.write(patch)
  }

  destroy(): void {
    if (this.destroyed) return
    if (this.timer !== null) this.timers.clear(this.timer)
    this.timer = null
    this.pending = null
    this.destroyed = true
    if (this.published) this.awareness.setLocalState(null)
  }

  private write(patch: Partial<PresenceState>): void {
    // one update for all changed fields; fields the app set itself are kept. A state that lost our identity
    // (cleared or replaced by someone else) gets it back: peers ignore a state without `user`.
    const cur = this.awareness.getLocalState()
    const base = cur && isObj(cur.user) ? cur : { ...(cur ?? {}), user: this.user }
    this.awareness.setLocalState({ ...base, ...patch })
    this.published = true
  }
}

interface ReaderOptions {
  /** Our clock (the one the laser fade uses), ms. */
  now: () => number
  locale: () => 'vi' | 'en'
  /** A remote peer appeared, changed or left. */
  onChange: () => void
}

interface PeerEntry {
  peer: RemotePeer
  /** Newest raw laser time last seen (re-timing happens only when it moves). */
  laserT: number
  offset: number
}

/** Remote peers of an awareness (ours excluded), sanitized when they change. */
export class PresenceReader {
  private readonly entries = new Map<number, PeerEntry>()
  private list: RemotePeer[] | null = null
  private readonly onAwareness = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
  ): void => {
    let changed = false
    const self = this.awareness.clientID
    for (const id of removed) {
      if (id !== self && this.entries.delete(id)) changed = true
    }
    for (const id of [...added, ...updated]) {
      if (id === self) continue
      this.read(id)
      changed = true
    }
    if (!changed) return
    this.list = null
    this.opts.onChange()
  }

  constructor(private readonly awareness: Awareness, private readonly opts: ReaderOptions) {
    for (const id of awareness.getStates().keys()) if (id !== awareness.clientID) this.read(id)
    awareness.on('change', this.onAwareness)
  }

  peers(): RemotePeer[] {
    return (this.list ??= [...this.entries.values()].map(e => e.peer))
  }

  get(clientId: number): RemotePeer | undefined {
    return this.entries.get(clientId)?.peer
  }

  destroy(): void {
    this.awareness.off('change', this.onAwareness)
    this.entries.clear()
    this.list = null
  }

  private read(id: number): void {
    const state = sanitizePresence(this.awareness.getStates().get(id), id)
    if (!state) {
      this.entries.delete(id)
      return
    }
    if (!state.user.name) state.user.name = defaultUser(id, this.opts.locale()).name
    const prev = this.entries.get(id)
    const newest = state.laser.length ? state.laser[state.laser.length - 1]!.t : -Infinity
    let offset = prev?.offset ?? 0
    // the sender's clock is not ours: its newest point counts as "now" when it arrives
    if (state.laser.length && newest !== prev?.laserT) offset = this.opts.now() - newest
    const laser = state.laser.map(p => ({ ...p, t: p.t + offset }))
    // an unchanged selection keeps its array, so per-peer caches keyed on it (selection boxes) stay valid
    const selection = prev && sameIds(prev.peer.selection, state.selection) ? prev.peer.selection : state.selection
    this.entries.set(id, { peer: { ...state, selection, laser, clientId: id }, laserT: newest, offset })
  }
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

const overlaps = (a: Box, b: Box): boolean =>
  a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY

/**
 * Remote peers' selection outlines (element corners), memoized per peer on the identity of its selection array
 * and of the scene's elements array (the scene replaces it on every change), then culled to the visible box.
 */
export class RemoteSelectionBoxes {
  /** Recomputations so far (for tests). */
  computed = 0
  private readonly cache = new Map<number, {
    selection: readonly string[]
    elements: unknown
    boxes: Array<{ corners: Point[]; box: Box }>
  }>()

  get size(): number {
    return this.cache.size
  }

  /** Outlines of the peer's selected elements we have, intersecting `view` (all of them when null). */
  boxes(peer: { clientId: number; selection: readonly string[] }, scene: Scene, view: Box | null): Point[][] {
    let hit = this.cache.get(peer.clientId)
    if (!hit || hit.selection !== peer.selection || hit.elements !== scene.elements) {
      const boxes: Array<{ corners: Point[]; box: Box }> = []
      for (const id of peer.selection) {
        const el = scene.get(id)
        if (el) boxes.push({ corners: elementCorners(el), box: cornersBox(el) })
      }
      hit = { selection: peer.selection, elements: scene.elements, boxes }
      this.cache.set(peer.clientId, hit)
      this.computed++
    }
    const out: Point[][] = []
    for (const b of hit.boxes) if (!view || overlaps(b.box, view)) out.push(b.corners)
    return out
  }

  /** Forgets the peers not in `clientIds` (they left). */
  retain(clientIds: Iterable<number>): void {
    const keep = new Set(clientIds)
    for (const id of [...this.cache.keys()]) if (!keep.has(id)) this.cache.delete(id)
  }
}
