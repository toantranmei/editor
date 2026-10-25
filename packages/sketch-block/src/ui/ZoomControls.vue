<script setup lang="ts">
import type { SketchMessages } from '../messages'
import { Grid3x3, Magnet, Minus, Plus, Redo2, Scan, Undo2 } from './icons'

defineProps<{
  zoom: number
  canUndo: boolean
  canRedo: boolean
  readonly: boolean
  grid: boolean
  objectSnap: boolean
  messages: SketchMessages
}>()

const emit = defineEmits<{
  undo: []
  redo: []
  zoomIn: []
  zoomOut: []
  reset: []
  fit: []
  toggleGrid: []
  toggleSnap: []
}>()
</script>

<template>
  <div class="me-sketch-zoom">
    <template v-if="!readonly">
      <button
        type="button" class="me-tool-btn" data-action="undo"
        :title="messages.undo" :aria-label="messages.undo" :disabled="!canUndo"
        @click="emit('undo')"
      >
        <Undo2 />
      </button>
      <button
        type="button" class="me-tool-btn" data-action="redo"
        :title="messages.redo" :aria-label="messages.redo" :disabled="!canRedo"
        @click="emit('redo')"
      >
        <Redo2 />
      </button>
      <span class="me-toolbar-divider" aria-hidden="true" />
    </template>
    <button
      type="button" class="me-tool-btn" data-action="zoom-out"
      :title="messages.zoomOut" :aria-label="messages.zoomOut"
      @click="emit('zoomOut')"
    >
      <Minus />
    </button>
    <button
      type="button" class="me-tool-btn me-sketch-zoom-pct" data-action="reset"
      :title="messages.resetZoom"
      @click="emit('reset')"
    >
      {{ Math.round(zoom * 100) }}%
    </button>
    <button
      type="button" class="me-tool-btn" data-action="zoom-in"
      :title="messages.zoomIn" :aria-label="messages.zoomIn"
      @click="emit('zoomIn')"
    >
      <Plus />
    </button>
    <button
      type="button" class="me-tool-btn" data-action="fit"
      :title="messages.fit" :aria-label="messages.fit"
      @click="emit('fit')"
    >
      <Scan />
    </button>
    <span class="me-toolbar-divider" aria-hidden="true" />
    <button
      type="button" class="me-tool-btn" :class="{ 'is-active': grid }" data-action="grid"
      :title="messages.grid" :aria-label="messages.grid" :aria-pressed="grid"
      @click="emit('toggleGrid')"
    >
      <Grid3x3 />
    </button>
    <button
      v-if="!readonly"
      type="button" class="me-tool-btn" :class="{ 'is-active': objectSnap }" data-action="snap"
      :title="messages.objectSnap" :aria-label="messages.objectSnap" :aria-pressed="objectSnap"
      @click="emit('toggleSnap')"
    >
      <Magnet />
    </button>
  </div>
</template>
