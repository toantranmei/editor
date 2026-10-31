<script lang="ts">
import { Maximize2, PanelRight, SquareSquare } from '@lucide/vue'
import type { Component } from 'vue'
import type { OpenMode } from '../types'

/** Lucide icon per "Open pages in" mode. */
export const OPEN_MODE_ICONS: Record<OpenMode, Component> = { side_peek: PanelRight, center_peek: SquareSquare, full_page: Maximize2 }
</script>

<script setup lang="ts">
defineProps<{ mode: OpenMode }>()
</script>

<template>
  <component :is="OPEN_MODE_ICONS[mode] ?? PanelRight" aria-hidden="true" />
</template>
