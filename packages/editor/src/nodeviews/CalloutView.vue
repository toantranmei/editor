<script setup lang="ts">
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { computed, ref } from 'vue'
import { PALETTE_NAMES } from '../theme/tokens'
import { useClickOutside } from '../composables/useClickOutside'

const props = defineProps(nodeViewProps)

const ICONS = ['💡', '⚠️', '❗', '✅', 'ℹ️', '📌', '🔥', '📝', '🚀', '❓', '⭐', '🎯']
const open = ref(false)
const pickerEl = ref<HTMLElement | null>(null)
useClickOutside(pickerEl, open, () => (open.value = false))

const m = computed(() => props.editor.storage.meiConfig.messages)
</script>

<template>
  <NodeViewWrapper class="me-callout" :data-color="node.attrs.color">
    <div ref="pickerEl" class="me-callout-icon-wrap" contenteditable="false">
      <button type="button" class="me-callout-icon" :title="m.callout.change" :disabled="!editor.isEditable" @click="open = !open">
        {{ node.attrs.icon }}
      </button>
      <div v-if="open" class="me-popover me-callout-picker">
        <div class="me-menu-label">
          {{ m.callout.icon }}
        </div>
        <div class="me-emoji-grid">
          <button v-for="icon in ICONS" :key="icon" type="button" class="me-emoji" @click="updateAttributes({ icon }); open = false">
            {{ icon }}
          </button>
        </div>
        <div class="me-menu-label">
          {{ m.callout.background }}
        </div>
        <div class="me-swatch-grid">
          <button
            v-for="c in PALETTE_NAMES"
            :key="c"
            type="button"
            class="me-swatch-btn"
            :class="{ 'is-active': node.attrs.color === c }"
            :data-color="c"
            :title="m.colors[c]"
            @click="updateAttributes({ color: c })"
          />
        </div>
      </div>
    </div>
    <NodeViewContent class="me-callout-content" />
  </NodeViewWrapper>
</template>
