import { type RotBox, boxCenter } from './bounds'
import { type Point, rotatePoint } from './math'

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | 'rotate'

const ROTATE_OFFSET_PX = 24

export function handlePositions(box: RotBox, zoom: number): Record<Handle, Point> {
  const { x, y, w, h } = box
  const mx = x + w / 2
  const my = y + h / 2
  const raw: Record<Handle, Point> = {
    nw: { x, y }, n: { x: mx, y }, ne: { x: x + w, y },
    w: { x, y: my }, e: { x: x + w, y: my },
    sw: { x, y: y + h }, s: { x: mx, y: y + h }, se: { x: x + w, y: y + h },
    rotate: { x: mx, y: y - ROTATE_OFFSET_PX / zoom },
  }
  const c = boxCenter(box)
  const out = {} as Record<Handle, Point>
  for (const k of Object.keys(raw) as Handle[]) out[k] = rotatePoint(raw[k], c, box.angle)
  return out
}

interface Axis { min: number; len: number }

export function resizeBox(
  start: RotBox,
  handle: Exclude<Handle, 'rotate'>,
  pointer: Point,
  opts: { keepRatio: boolean; fromCenter: boolean },
): { x: number; y: number; w: number; h: number } {
  const c = boxCenter(start)
  const q = rotatePoint(pointer, c, -start.angle)
  const fx = handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0
  const fy = handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0

  // per-axis raw size + placement info
  const axis = (flag: number, s0: number, len0: number, v: number) => {
    const center = s0 + len0 / 2
    if (flag === 0) return { len: len0, centered: true, anchor: center, dir: 1, center }
    if (opts.fromCenter) return { len: 2 * Math.abs(v - center), centered: true, anchor: center, dir: 1, center }
    const anchor = flag > 0 ? s0 : s0 + len0
    const d = v - anchor
    return { len: Math.abs(d), centered: false, anchor, dir: d === 0 ? flag : Math.sign(d), center }
  }
  const ax = axis(fx, start.x, start.w, q.x)
  const ay = axis(fy, start.y, start.h, q.y)

  if (opts.keepRatio && start.w > 0 && start.h > 0) {
    let s: number
    if (fx !== 0 && fy !== 0) s = Math.max(ax.len / start.w, ay.len / start.h)
    else if (fx !== 0) s = ax.len / start.w
    else s = ay.len / start.h
    ax.len = start.w * s
    ay.len = start.h * s
    // the axis not driven by the handle stays centered
    if (fx === 0) ax.centered = true
    if (fy === 0) ay.centered = true
  }

  const place = (a: typeof ax): Axis => ({
    len: a.len,
    min: a.centered ? a.center - a.len / 2 : a.dir > 0 ? a.anchor : a.anchor - a.len,
  })
  const px = place(ax)
  const py = place(ay)

  // local box is expressed in the start frame (unrotated around the start center);
  // move its center into the world and recenter x,y for the new size.
  const localCenter = { x: px.min + px.len / 2, y: py.min + py.len / 2 }
  const wc = rotatePoint(localCenter, c, start.angle)
  return { x: wc.x - px.len / 2, y: wc.y - py.len / 2, w: px.len, h: py.len }
}

const SNAP = Math.PI / 12
const TAU = Math.PI * 2

/** 0 when the pointer is straight above the center, clockwise positive; [0, 2π). */
export function rotateAngle(center: Point, pointer: Point, snap: boolean): number {
  let a = Math.atan2(pointer.x - center.x, -(pointer.y - center.y))
  if (snap) a = Math.round(a / SNAP) * SNAP
  a %= TAU
  if (a < 0) a += TAU
  if (a >= TAU - 1e-9) a = 0
  return a
}

/** `p` with the segment `anchor → p` snapped to the nearest 15° (length kept). */
export function snapSegment(anchor: Point, p: Point): Point {
  const dx = p.x - anchor.x
  const dy = p.y - anchor.y
  const len = Math.hypot(dx, dy)
  if (len === 0) return p
  const a = Math.round(Math.atan2(dy, dx) / SNAP) * SNAP
  return { x: anchor.x + len * Math.cos(a), y: anchor.y + len * Math.sin(a) }
}
