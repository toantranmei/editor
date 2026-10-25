<script setup lang="ts">
/**
 * Collaboration page: /sketch-collab?board=<id>[&name=<name>] mounts board <id> fullscreen through the playground
 * sync server (`pnpm sync`, ws://localhost:1234). Open it in two browsers to see live edits and cursors.
 * window.__sketchCollab exposes the elements, the remote presence states and the connection status for
 * scripts/e2e-sketch-collab.mjs.
 */
import { createBoardSession, SketchBoard, type BoardSession } from '@toantranmei/sketch-block/engine'
import { websocket, type BoardConnection, type ConnectionStatusValue } from '@toantranmei/sketch-block/providers'

declare global {
  interface Window {
    __sketchCollab?: {
      getElements(): readonly unknown[]
      /** Awareness states of the other clients (client id → state). */
      presence(): Array<{ clientId: number } & Record<string, unknown>>
      status(): ConnectionStatusValue | null
      toScreen(p: { x: number, y: number }): { x: number, y: number }
    }
  }
}

const route = useRoute()
const boardId = typeof route.query.board === 'string' && route.query.board ? route.query.board : 'playground'
const name = typeof route.query.name === 'string' && route.query.name ? route.query.name : undefined

const connection = shallowRef<BoardConnection | null>(null)
const session = shallowRef<BoardSession | null>(null)
const status = ref<ConnectionStatusValue | null>(null)
const error = ref('')
const board = ref<{
  getElements(): readonly unknown[]
  toScreen(p: { x: number, y: number }): { x: number, y: number }
} | null>(null)
let offStatus: (() => void) | null = null

useHead({ title: `Sketch collab · ${boardId}` })

onMounted(async () => {
  try {
    // no offline cache: both browsers must see exactly what the server has
    const conn = await websocket({ url: 'ws://localhost:1234', offline: false }).connect(boardId)
    status.value = conn.status?.get() ?? null
    offStatus = conn.status?.on(s => (status.value = s)) ?? null
    connection.value = markRaw(conn)
    session.value = markRaw(createBoardSession(conn))
  }
  catch (err) {
    console.error(err)
    error.value = String(err)
  }
})

watch(board, (b) => {
  if (!b) return
  window.__sketchCollab = {
    getElements: () => b.getElements(),
    presence: () => {
      const awareness = connection.value?.awareness
      if (!awareness) return []
      return [...awareness.getStates()]
        .filter(([id]) => id !== awareness.clientID)
        .map(([clientId, state]) => ({ clientId, ...state }))
    },
    status: () => status.value,
    toScreen: p => b.toScreen(p),
  }
})

onBeforeUnmount(() => {
  offStatus?.()
  const sess = session.value
  const conn = connection.value
  session.value = null
  connection.value = null
  nextTick(() => {
    sess?.destroy()
    conn?.destroy()
  })
})
</script>

<template>
  <div class="relative h-screen w-screen overflow-hidden">
    <p class="absolute right-3 bottom-2 z-10 text-xs text-neutral-500" data-testid="collab-status">
      {{ boardId }} · {{ status ?? '…' }}
    </p>
    <p v-if="error" class="p-4 text-red-600">
      {{ error }}
    </p>
    <SketchBoard
      v-if="connection && session"
      ref="board"
      :connection="connection"
      :session="session"
      :user="name ? { name, color: '#1971c2' } : null"
    />
  </div>
</template>
