<script lang="ts">
import {
  AlignLeft, ArrowUpRight, AtSign, Calendar, ChartColumn, ChartGantt, CircleChevronDown, CircleDot, CircleUser, Clock,
  Fingerprint, Grid3x3, Hash, Kanban, LayoutGrid, Link, List, Paperclip, Phone, Search, Sigma, SquareCheck, Table, Type, User,
} from '@lucide/vue'
import type { Component } from 'vue'
import type { PropType, ViewType } from '../types'

export const PROP_ICONS: Record<PropType, Component> = {
  title: Type, text: AlignLeft, number: Hash, select: CircleChevronDown, multi_select: List, status: CircleDot,
  date: Calendar, person: User, files: Paperclip, checkbox: SquareCheck, url: Link, email: AtSign, phone: Phone,
  relation: ArrowUpRight, rollup: Search, formula: Sigma, created_time: Clock, last_edited_time: Clock,
  created_by: CircleUser, last_edited_by: CircleUser, unique_id: Fingerprint,
}

export const VIEW_ICONS: Record<ViewType, Component> = {
  table: Table, board: Kanban, calendar: Calendar, timeline: ChartGantt, gallery: LayoutGrid, list: List,
  chart: ChartColumn, pivot: Grid3x3,
}
</script>

<script setup lang="ts">
defineProps<{ type?: PropType, view?: ViewType }>()
</script>

<template>
  <component :is="view ? VIEW_ICONS[view] : PROP_ICONS[type ?? 'text']" class="me-db-prop-icon" aria-hidden="true" />
</template>
