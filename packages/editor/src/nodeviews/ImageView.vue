<script setup lang="ts">
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { Image as ImageIcon, Link as LinkIcon, Upload } from '@lucide/vue'
import { computed, ref } from 'vue'

const props = defineProps(nodeViewProps)

const config = computed(() => props.editor.storage.meiConfig)
const m = computed(() => config.value.messages.image)
const tab = ref<'upload' | 'link'>('upload')
const link = ref('')
const error = ref('')
const uploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const figure = ref<HTMLElement | null>(null)

const readAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(reader.result as string)
  reader.onerror = () => reject(reader.error)
  reader.readAsDataURL(file)
})

async function handleFile(file: File) {
  error.value = ''
  const maxMb = config.value.maxImageSize
  if (!file.type.startsWith('image/')) return (error.value = m.value.notImage)
  if (file.size > maxMb * 1024 * 1024) return (error.value = m.value.tooLarge(maxMb))

  uploading.value = true
  try {
    const upload = config.value.uploadImage
    const src = upload ? await upload(file) : await readAsDataUrl(file)
    props.updateAttributes({ src, alt: file.name })
  }
  catch {
    error.value = m.value.uploadFailed
  }
  finally {
    uploading.value = false
  }
}

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) handleFile(file)
}

function onDrop(e: DragEvent) {
  const file = e.dataTransfer?.files?.[0]
  if (!file) return
  e.preventDefault()
  e.stopPropagation()
  handleFile(file)
}

function submitLink() {
  error.value = ''
  try {
    const url = new URL(link.value.trim())
    if (!/^https?:$/.test(url.protocol)) throw new Error('bad protocol')
    props.updateAttributes({ src: url.toString() })
  }
  catch {
    error.value = m.value.invalidLink
  }
}

// Resize from either side; the image stays centered so both sides move.
function startResize(e: PointerEvent, side: 1 | -1) {
  const parent = figure.value?.parentElement
  if (!parent) return
  e.preventDefault()
  const startX = e.clientX
  const startWidth = props.node.attrs.width as number
  const total = parent.getBoundingClientRect().width
  const move = (ev: PointerEvent) => {
    const delta = ((ev.clientX - startX) * side * 2 / total) * 100
    props.updateAttributes({ width: Math.round(Math.min(100, Math.max(15, startWidth + delta))) })
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}
</script>

<template>
  <NodeViewWrapper class="me-media">
    <div v-if="!node.attrs.src" class="me-media-empty" contenteditable="false" @dragover.prevent @drop="onDrop">
      <div class="me-tabs">
        <button
          v-for="t in (['upload', 'link'] as const)"
          :key="t"
          type="button"
          class="me-tab"
          :class="{ 'is-active': tab === t }"
          @click="tab = t"
        >
          <component :is="t === 'upload' ? Upload : LinkIcon" />
          {{ t === 'upload' ? m.upload : m.link }}
        </button>
      </div>
      <div v-if="tab === 'upload'" class="me-media-body">
        <button type="button" class="me-btn" :disabled="uploading" @click="fileInput?.click()">
          <ImageIcon /> {{ uploading ? m.uploading : m.choose }}
        </button>
        <p class="me-hint">
          {{ m.dropHint(config.maxImageSize) }}
        </p>
        <input ref="fileInput" type="file" accept="image/*" hidden @change="onFileChange">
      </div>
      <form v-else class="me-inline-form" @submit.prevent="submitLink">
        <input v-model="link" class="me-input" placeholder="https://..." @keydown.stop>
        <button type="submit" class="me-btn me-btn--primary">
          {{ m.insert }}
        </button>
      </form>
      <p v-if="error" class="me-error">
        {{ error }}
      </p>
    </div>

    <figure v-else ref="figure" class="me-figure" :style="{ width: `${node.attrs.width}%` }">
      <div class="me-figure-frame" :class="{ 'is-selected': selected }">
        <img :src="node.attrs.src" :alt="node.attrs.alt || ''" class="me-figure-img" draggable="false">
        <template v-if="editor.isEditable">
          <span class="me-resize-handle me-resize-handle--left" @pointerdown="startResize($event, -1)" />
          <span class="me-resize-handle me-resize-handle--right" @pointerdown="startResize($event, 1)" />
        </template>
      </div>
      <input
        class="me-caption"
        :value="node.attrs.caption"
        :readonly="!editor.isEditable"
        :placeholder="editor.isEditable ? m.caption : ''"
        @input="updateAttributes({ caption: ($event.target as HTMLInputElement).value })"
        @keydown.stop
      >
    </figure>
  </NodeViewWrapper>
</template>
