<script setup lang="ts">
import { computed } from 'vue'
import type { PresenceMessages } from '../messages'
import { X } from './icons'

export interface AvatarPeer { clientId: number; name: string; color: string }

const MAX_SHOWN = 5

const props = defineProps<{
  peers: AvatarPeer[]
  /** Client id being followed (null = none). */
  following: number | null
  messages: PresenceMessages
}>()

const emit = defineEmits<{
  follow: [clientId: number]
  stop: []
}>()

const shown = computed(() => props.peers.slice(0, MAX_SHOWN))
const extra = computed(() => props.peers.slice(MAX_SHOWN))
const followed = computed(() => props.peers.find(p => p.clientId === props.following) ?? null)

/** Up to two initials (first letters of the first and last words), upper case. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  const first = [...words[0]!][0] ?? ''
  const last = words.length > 1 ? [...words[words.length - 1]!][0] ?? '' : ''
  return (first + last).toLocaleUpperCase()
}

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m))
</script>

<template>
  <div class="me-sketch-presence">
    <div class="me-sketch-avatars" role="group" :aria-label="messages.people">
      <button
        v-for="p in shown"
        :key="p.clientId"
        type="button"
        class="me-sketch-avatar"
        :class="{ 'is-active': p.clientId === following }"
        :style="{ background: p.color }"
        :title="fill(messages.follow, { name: p.name })"
        :aria-label="fill(messages.follow, { name: p.name })"
        :aria-pressed="p.clientId === following"
        @click="emit('follow', p.clientId)"
      >
        {{ initials(p.name) }}
      </button>
      <span
        v-if="extra.length"
        class="me-sketch-avatars-more"
        :title="`${fill(messages.more, { n: extra.length })}: ${extra.map(p => p.name).join(', ')}`"
      >+{{ extra.length }}</span>
    </div>
    <div v-if="followed" class="me-sketch-following" role="status">
      <span class="me-sketch-following-dot" :style="{ background: followed.color }" aria-hidden="true" />
      <span>{{ fill(messages.following, { name: followed.name }) }}</span>
      <button
        type="button"
        class="me-tool-btn"
        :title="messages.stopFollowing"
        :aria-label="messages.stopFollowing"
        @click="emit('stop')"
      >
        <X />
      </button>
    </div>
  </div>
</template>
