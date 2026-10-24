<script setup lang="ts">
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { AudioLines, Download, File as FileIcon, Film, Link as LinkIcon, Upload } from '@lucide/vue'
import { computed, ref } from 'vue'
import { useEditable } from '../composables/useEditable'
import type { FileBlockOptions, FileKind } from '../extensions/file-block'

const props = defineProps(nodeViewProps)
const editable = useEditable(props.editor)

const options = computed(() => props.extension.options as FileBlockOptions)
const kind = computed(() => (props.node.attrs.kind ?? 'file') as FileKind)
const m = computed(() => props.editor.storage.meiConfig.messages.file)
const tab = ref<'upload' | 'link'>('upload')
const link = ref('')
const error = ref('')
const uploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

// Only web, data and blob URLs: pasted content could carry `javascript:` links.
const safeSrc = computed(() => {
  const src = String(props.node.attrs.src ?? '')
  return /^(https?:|data:|blob:)/i.test(src) ? src : null
})
const accept = computed(() => ({ file: '', audio: 'audio/*', video: 'video/*' })[kind.value])
const icon = computed(() => ({ file: FileIcon, audio: AudioLines, video: Film })[kind.value])
const title = computed(() => ({ file: m.value.chooseFile, audio: m.value.chooseAudio, video: m.value.chooseVideo })[kind.value])

const readAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(reader.result as string)
  reader.onerror = () => reject(reader.error)
  reader.readAsDataURL(file)
})

async function handleFile(file: File) {
  error.value = ''
  if (kind.value !== 'file' && !file.type.startsWith(`${kind.value}/`)) return (error.value = m.value.wrongType)
  if (file.size > options.value.maxSize * 1024 * 1024) return (error.value = m.value.tooLarge(options.value.maxSize))
  uploading.value = true
  try {
    const src = options.value.upload ? await options.value.upload(file, kind.value) : await readAsDataUrl(file)
    props.updateAttributes({ src, name: file.name, size: file.size, mime: file.type })
  }
  catch {
    error.value = m.value.uploadFailed
  }
  finally {
    uploading.value = false
  }
}

function onDrop(e: DragEvent) {
  const file = e.dataTransfer?.files?.[0]
  if (!file) return
  e.preventDefault()
  e.stopPropagation()
  handleFile(file)
}

function submitLink() {
  try {
    const url = new URL(link.value.trim())
    if (!/^https?:$/.test(url.protocol)) throw new Error('protocol')
    props.updateAttributes({ src: url.toString(), name: decodeURIComponent(url.pathname.split('/').pop() || url.hostname) })
  }
  catch {
    error.value = m.value.invalidLink
  }
}

const sizeLabel = computed(() => {
  const bytes = Number(props.node.attrs.size)
  if (!bytes) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`
})
</script>

<template>
  <NodeViewWrapper class="me-media" :class="{ 'is-readonly-empty': !editable && !node.attrs.src }">
    <div v-if="!node.attrs.src" class="me-media-empty" contenteditable="false" @dragover.prevent @drop="onDrop">
      <div class="me-tabs">
        <button v-for="t in (['upload', 'link'] as const)" :key="t" type="button" class="me-tab" :class="{ 'is-active': tab === t }" @click="tab = t">
          <component :is="t === 'upload' ? Upload : LinkIcon" />
          {{ t === 'upload' ? m.upload : m.link }}
        </button>
      </div>
      <div v-if="tab === 'upload'" class="me-media-body">
        <button type="button" class="me-btn" :disabled="uploading" @click="fileInput?.click()">
          <component :is="icon" /> {{ uploading ? m.uploading : title }}
        </button>
        <p class="me-hint">
          {{ m.dropHint(options.maxSize) }}
        </p>
        <input ref="fileInput" type="file" :accept="accept" hidden @change="($event.target as HTMLInputElement).files?.[0] && handleFile(($event.target as HTMLInputElement).files![0]!)">
      </div>
      <form v-else class="me-inline-form" @submit.prevent="submitLink">
        <input v-model="link" class="me-input" placeholder="https://..." @keydown.stop>
        <button type="submit" class="me-btn me-btn--primary">
          {{ m.embed }}
        </button>
      </form>
      <p v-if="error" class="me-error">
        {{ error }}
      </p>
    </div>

    <div v-else class="me-file" :class="[`me-file--${kind}`, { 'is-selected': selected }]" contenteditable="false">
      <audio v-if="kind === 'audio' && safeSrc" class="me-file-player" :src="safeSrc" controls preload="metadata" />
      <video v-else-if="kind === 'video' && safeSrc" class="me-file-player" :src="safeSrc" controls preload="metadata" />
      <div class="me-file-row">
        <component :is="icon" class="me-file-icon" />
        <span class="me-file-name">{{ node.attrs.name || node.attrs.src }}</span>
        <span v-if="sizeLabel" class="me-file-size">{{ sizeLabel }}</span>
        <a v-if="safeSrc" class="me-tool-btn" :href="safeSrc" :download="node.attrs.name || true" target="_blank" rel="noopener noreferrer" :title="m.download">
          <Download />
        </a>
      </div>
    </div>
  </NodeViewWrapper>
</template>
