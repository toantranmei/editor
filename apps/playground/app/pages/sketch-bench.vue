<script setup lang="ts">
/**
 * Sketch benchmark page: /sketch-bench?n=5000 (mixed shapes) or /sketch-bench?n=2000&kind=pen
 * (pen strokes, 200 points each). Fills an in-memory board and mounts the board fullscreen;
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
const kind = route.query.kind === 'pen' ? 'pen' : 'shapes'

const TYPES = ['rectangle', 'ellipse', 'diamond'] as const
const FILLS = ['none', 'hachure', 'cross-hatch', 'solid'] as const
const COLORS = ['#a5d8ff', '#b2f2bb', '#ffec99', '#ffc9c9']
const CELL = 160
const PEN_POINTS = 200

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
const board = ref<{ $el: HTMLElement, selectAll: () => void, toScreen: (p: { x: number, y: number }) => { x: number, y: number } } | null>(null)
let mountStart = 0

onMounted(async () => {
  const conn = await memory().connect('bench')
  const t0 = performance.now()
  // Same layout as BoardStore, written in one transaction (BoardStore.create appends one by one).
  const elements = conn.doc.getMap<Y.Map<unknown>>('elements')
  const cols = Math.ceil(Math.sqrt(n))
  const keys = generateNKeysBetween(null, null, n)
  conn.doc.transact(() => {
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
      const m = new Y.Map<unknown>()
      for (const [k, v] of Object.entries(el)) m.set(k, v)
      elements.set(el.id, m)
    }
  })
  const fillMs = performance.now() - t0
  mountStart = performance.now()
  window.__sketchBench = { n, kind, fillMs, mountStart }
  connection.value = markRaw(conn)
})

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
