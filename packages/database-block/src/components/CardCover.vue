<script setup lang="ts">
/** The preview area at the top of a board / gallery card: an image, the start of the page's text, or empty. */
import { Image as ImageIcon } from '@lucide/vue'
import type { CardCover } from '../preview'

defineProps<{ cover: CardCover }>()
</script>

<template>
  <span class="me-db-cover" :class="{ 'is-text': cover.kind === 'text' }" :data-cover="cover.kind">
    <img v-if="cover.kind === 'image'" :src="cover.url" alt="" loading="lazy" decoding="async" class="me-db-cover-img">
    <span v-else-if="cover.kind === 'text'" class="me-db-cover-text">{{ cover.text }}</span>
    <ImageIcon v-else class="me-db-cover-empty" />
  </span>
</template>
