<script setup lang="ts">
/** A row page's icon before its title: an emoji, or an image when the icon is a URL. */
import { computed } from 'vue'
import { isImageIcon } from '../util'

const props = defineProps<{ icon: string }>()
const image = computed(() => isImageIcon(props.icon))
</script>

<template>
  <img v-if="image" :src="icon" alt="" class="me-db-row-icon is-image" decoding="async">
  <span v-else class="me-db-row-icon" aria-hidden="true">{{ icon }}</span>
</template>
