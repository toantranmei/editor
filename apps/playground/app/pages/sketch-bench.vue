<script setup lang="ts">
/**
 * Sketch benchmark page: /sketch-bench?n=5000
 * Fills an in-memory board with `n` mixed shapes and mounts the board fullscreen;
 * timings and the board element are exposed on window.__sketchBench (see scripts/bench-sketch.mjs).
 */
import type { BoardConnection } from '@toantranmei/sketch-block'
import { SketchBoard } from '@toantranmei/sketch-block/engine'
import { memory } from '@toantranmei/sketch-block/providers'
import { generateNKeysBetween } from 'fractional-indexing'
import * as Y from 'yjs'

const route = useRoute()
const n = Number(route.query.n ?? 1000)

const TYPES = ['rectangle', 'ellipse', 'diamond'] as const
const FILLS = ['none', 'hachure', 'cross-hatch', 'solid'] as const
const COLORS = ['#a5d8ff', '#b2f2bb', '#ffec99', '#ffc9c9']
const CELL = 160

declare global { interface Window { __sketchBench?: Record<string, unknown> } }

const connection = shallowRef<BoardConnection | null>(null)
const board = ref<{ $el: HTMLElement } | null>(null)
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
      const el = {
        id: `e${i}`,
        type: TYPES[i % TYPES.length]!,
        x: (i % cols) * CELL,
        y: Math.floor(i / cols) * CELL,
        w: 80 + (i * 37) % 60,
        h: 60 + (i * 53) % 60,
        angle: 0,
        index: keys[i]!,
        stroke: '#1e1e1e',
        fill: fillStyle === 'none' ? 'transparent' : COLORS[i % COLORS.length]!,
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
  window.__sketchBench = { n, fillMs, mountStart }
  connection.value = markRaw(conn)
})

// The board paints its first static frame in the animation frame after mounting.
watch(board, (b) => {
  if (!b) return
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.__sketchBench = { ...window.__sketchBench, firstFrameAt: performance.now(), el: b.$el }
  }))
})
</script>

<template>
  <div class="h-screen w-screen overflow-hidden">
    <SketchBoard v-if="connection" ref="board" :connection="connection" />
  </div>
</template>
