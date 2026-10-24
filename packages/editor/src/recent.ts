import { ref } from 'vue'
import type { ColorName } from './colors'

/** Recently used colors and blocks, shared by all editors and kept in localStorage. */
export interface RecentColor { kind: 'text' | 'bg', color: ColorName }

const KEY = 'mei-editor:recent'
const MAX = 5

function load(): { colors: RecentColor[], blocks: string[] } {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return { colors: Array.isArray(raw.colors) ? raw.colors : [], blocks: Array.isArray(raw.blocks) ? raw.blocks : [] }
  }
  catch {
    return { colors: [], blocks: [] }
  }
}

export const recent = ref(typeof window === 'undefined' ? { colors: [], blocks: [] } : load())

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(recent.value))
  }
  catch {}
}

export function pushRecentColor(entry: RecentColor) {
  const rest = recent.value.colors.filter(c => !(c.kind === entry.kind && c.color === entry.color))
  recent.value = { ...recent.value, colors: [entry, ...rest].slice(0, MAX) }
  save()
}

export function pushRecentBlock(id: string) {
  recent.value = { ...recent.value, blocks: [id, ...recent.value.blocks.filter(b => b !== id)].slice(0, MAX) }
  save()
}
