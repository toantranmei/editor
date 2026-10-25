<script setup lang="ts">
/**
 * Sketch benchmark page: /sketch-bench?n=5000 (mixed shapes), /sketch-bench?n=2000&kind=pen
 * (pen strokes, 200 points each) or /sketch-bench?n=1000&kind=sticky (sticky notes, plus n/2 arrows each bound
 * to a pair of neighbouring stickies). Fills an in-memory board and mounts the board fullscreen;
 * timings, the board element and the board instance are exposed on window.__sketchBench
 * (see scripts/bench-sketch.mjs).
 */
import type { BoardConnection } from '@toantranmei/sketch-block'
import { SketchBoard } from '@toantranmei/sketch-block/engine'
import { memory } from '@toantranmei/sketch-block/providers'
import { generateNKeysBetween } from 'fractional-indexing'
import * as Y from 'yjs'

const route = useRoute()
const n = Number(route.query.n ?? 1000)
const kind = route.query.kind === 'pen' ? 'pen' : route.query.kind === 'sticky' ? 'sticky' : 'shapes'

const TYPES = ['rectangle', 'ellipse', 'diamond'] as const
const FILLS = ['none', 'hachure', 'cross-hatch', 'solid'] as const
const COLORS = ['#a5d8ff', '#b2f2bb', '#ffec99', '#ffc9c9']
const CELL = 160
const PEN_POINTS = 200
const STICKY_COLORS = ['#fff3bf', '#ffe3e3', '#d3f9d8', '#d0ebff', '#f3d9fa', '#ffe8cc', '#e9ecef', '#c5f6fa']
/** Sticky side (the bench uses a smaller one than the default 200 so ~50 fit the view at zoom 1). */
const STICKY = 100
/** Gap between an arrow tip and the outline it is bound to (as the board leaves it). */
const BIND_GAP = 4

/** A wavy pen stroke of PEN_POINTS points, normalized to its box (local coords, w/h ≥ 0). */
function penStroke(i: number) {
  const raw = Array.from({ length: PEN_POINTS }, (_, j) => [j * 0.6, 30 * Math.sin(j / 12 + i) + 8 * Math.sin(j / 3)] as const)
  const minY = Math.min(...raw.map(p => p[1]))
  const points = raw.map(([x, y]) => [x, y - minY])
  return {
    w: Math.max(...points.map(p => p[0]!)),
    h: Math.max(...points.map(p => p[1]!)),
    points,
  }
}

declare global { interface Window { __sketchBench?: Record<string, unknown> } }

const connection = shallowRef<BoardConnection | null>(null)
const board = ref<{
  $el: HTMLElement
  selectAll: () => void
  select: (ids: Iterable<string>) => void
  toScreen: (p: { x: number, y: number }) => { x: number, y: number }
} | null>(null)
let mountStart = 0

onMounted(async () => {
  const conn = await memory().connect('bench')
  const t0 = performance.now()
  // Same layout as BoardStore, written in one transaction (BoardStore.create appends one by one).
  const elements = conn.doc.getMap<Y.Map<unknown>>('elements')
  const cols = Math.ceil(Math.sqrt(n))
  const keys = generateNKeysBetween(null, null, kind === 'sticky' ? n + Math.floor(n / 2) : n)
  const put = (el: Record<string, unknown>) => {
    const m = new Y.Map<unknown>()
    for (const [k, v] of Object.entries(el)) m.set(k, v)
    elements.set(el.id as string, m)
  }
  conn.doc.transact(() => {
    if (kind === 'sticky') {
      fillStickies(put, cols, keys)
      return
    }
    for (let i = 0; i < n; i++) {
      const fillStyle = FILLS[i % FILLS.length]!
      const shape = kind === 'pen'
        ? { type: 'freedraw', ...penStroke(i), pressures: [], highlighter: false }
        : { type: TYPES[i % TYPES.length]!, w: 80 + (i * 37) % 60, h: 60 + (i * 53) % 60 }
      const el = {
        id: `e${i}`,
        ...shape,
        x: (i % cols) * CELL,
        y: Math.floor(i / cols) * CELL,
        angle: 0,
        index: keys[i]!,
        stroke: '#1e1e1e',
        fill: fillStyle === 'none' || kind === 'pen' ? 'transparent' : COLORS[i % COLORS.length]!,
        fillStyle,
        strokeWidth: 2,
        strokeStyle: 'solid',
        roughness: 1,
        roundness: i % 2 ? 'round' : 'sharp',
        opacity: 1,
        seed: Math.floor(Math.random() * 2 ** 31),
        version: 1,
        locked: false,
      }
      put(el)
    }
  })
  const fillMs = performance.now() - t0
  mountStart = performance.now()
  window.__sketchBench = { n, kind, fillMs, mountStart }
  connection.value = markRaw(conn)
})

const common = (i: number) => ({
  angle: 0,
  strokeWidth: 2,
  strokeStyle: 'solid',
  roughness: 1,
  roundness: 'round',
  opacity: 1,
  seed: (i * 7919) % 2 ** 31,
  version: 1,
  locked: false,
  groupIds: [],
  frameId: null,
})

/**
 * n sticky notes on a grid (an even number of columns, so pairs share a row) and n/2 arrows, arrow k bound from
 * sticky 2k's right edge to sticky 2k+1's left edge (the fields `normalizeElement` gives these types).
 */
function fillStickies(put: (el: Record<string, unknown>) => void, cols: number, keys: string[]) {
  const evenCols = cols % 2 ? cols + 1 : cols
  const at = (i: number) => ({ x: (i % evenCols) * CELL, y: Math.floor(i / evenCols) * CELL })
  for (let i = 0; i < n; i++) {
    put({
      id: `e${i}`,
      type: 'sticky',
      ...at(i),
      w: STICKY,
      h: STICKY,
      index: keys[i]!,
      ...common(i),
      stroke: '#1e1e1e',
      fill: 'transparent',
      fillStyle: 'solid',
      text: `Note ${i}`,
      color: STICKY_COLORS[i % STICKY_COLORS.length]!,
      fontFamily: 'hand',
      textAlign: 'center',
    })
  }
  for (let k = 0; k < Math.floor(n / 2); k++) {
    const a = at(2 * k)
    const b = at(2 * k + 1)
    const x = a.x + STICKY + BIND_GAP
    const len = b.x - BIND_GAP - x
    put({
      id: `a${k}`,
      type: 'arrow',
      x,
      y: a.y + STICKY / 2,
      w: len,
      h: 0,
      index: keys[n + k]!,
      ...common(n + k),
      stroke: '#1e1e1e',
      fill: 'transparent',
      fillStyle: 'hachure',
      points: [[0, 0], [len, 0]],
      routing: 'straight',
      startArrowhead: 'none',
      endArrowhead: 'arrow',
      label: '',
      fontFamily: 'hand',
      fontSize: 20,
      textAlign: 'center',
      startBinding: { id: `e${2 * k}`, ax: 1, ay: 0.5 },
      endBinding: { id: `e${2 * k + 1}`, ax: 0, ay: 0.5 },
    })
  }
}

// The board paints its first static frame in the animation frame after mounting.
watch(board, (b) => {
  if (!b) return
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.__sketchBench = { ...window.__sketchBench, firstFrameAt: performance.now(), el: b.$el, board: b }
  }))
})
</script>

<template>
  <div class="h-screen w-screen overflow-hidden">
    <SketchBoard v-if="connection" ref="board" :connection="connection" />
  </div>
</template>
