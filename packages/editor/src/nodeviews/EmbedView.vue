<script setup lang="ts">
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { computed, ref } from 'vue'
import { toEmbedUrl } from '../extensions/embed'

const props = defineProps(nodeViewProps)

const m = computed(() => props.editor.storage.meiConfig.messages.embed)
const link = ref('')
const error = ref('')
const resizing = ref(false)
const safeSrc = computed(() => (props.node.attrs.src ? toEmbedUrl(props.node.attrs.src) : null))

function submit() {
  const src = toEmbedUrl(link.value)
  if (!src) {
    error.value = m.value.invalid
    return
  }
  props.updateAttributes({ src })
}

function startResize(e: PointerEvent) {
  e.preventDefault()
  resizing.value = true
  const startY = e.clientY
  const startH = props.node.attrs.height as number
  const move = (ev: PointerEvent) => {
    props.updateAttributes({ height: Math.round(Math.min(1200, Math.max(160, startH + ev.clientY - startY))) })
  }
  const up = () => {
    resizing.value = false
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}
</script>

<template>
  <NodeViewWrapper class="me-media">
    <form v-if="!safeSrc" class="me-media-empty" contenteditable="false" @submit.prevent="submit">
      <div class="me-hint">
        {{ m.hint }}
      </div>
      <div class="me-inline-form">
        <input v-model="link" class="me-input" :placeholder="m.placeholder" @keydown.stop>
        <button type="submit" class="me-btn me-btn--primary">
          {{ m.submit }}
        </button>
      </div>
      <p v-if="error" class="me-error">
        {{ error }}
      </p>
    </form>
    <div v-else class="me-embed" :class="{ 'is-selected': selected }" contenteditable="false">
      <iframe
        :src="safeSrc"
        :height="node.attrs.height"
        class="me-embed-frame"
        allowfullscreen
        sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
      />
      <!-- Iframes swallow pointer events; cover them while resizing. -->
      <div v-if="resizing" class="me-embed-overlay" />
      <span v-if="editor.isEditable" class="me-embed-resize" @pointerdown="startResize" />
    </div>
  </NodeViewWrapper>
</template>
