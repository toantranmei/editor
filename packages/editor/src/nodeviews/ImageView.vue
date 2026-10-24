<script setup lang="ts">
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import {
  AlignCenter, AlignLeft, AlignRight, Captions, Check, Copy, Crop, Download, Ellipsis, ExternalLink,
  Image as ImageIcon, Link as LinkIcon, RefreshCw, Trash, Upload, ZoomIn,
} from '@lucide/vue'
import { computed, nextTick, ref } from 'vue'
import ImageCropper, { type ImageCrop } from '../components/ImageCropper.vue'
import ImageLightbox from '../components/ImageLightbox.vue'
import { useClickOutside } from '../composables/useClickOutside'
import { useEditable } from '../composables/useEditable'
import { useScope } from '../composables/useScope'

const props = defineProps(nodeViewProps)
const editable = useEditable(props.editor)

const config = computed(() => props.editor.storage.meiConfig)
const m = computed(() => config.value.messages.image)
const tab = ref<'upload' | 'link'>('upload')
const link = ref('')
const error = ref('')
const uploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const figure = ref<HTMLElement | null>(null)
const scope = useScope(() => props.editor)

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
    // A new image starts uncropped.
    props.updateAttributes({ src, alt: file.name, crop: null })
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
    // Centered images grow on both sides, aligned ones on one.
    const factor = align.value === 'center' ? 2 : 1
    const delta = ((ev.clientX - startX) * side * factor / total) * 100
    props.updateAttributes({ width: Math.round(Math.min(100, Math.max(15, startWidth + delta))) })
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

// --- Toolbar (like Notion's image menu) ---------------------------------------------
type Align = 'left' | 'center' | 'right'
const align = computed(() => (props.node.attrs.align ?? 'center') as Align)
const ALIGN_ICONS = { left: AlignLeft, center: AlignCenter, right: AlignRight }
const crop = computed(() => props.node.attrs.crop as ImageCrop | null)
const captionShown = computed(() => props.node.attrs.showCaption ?? !!props.node.attrs.caption)
const isRemote = computed(() => /^https?:/i.test(props.node.attrs.src ?? ''))

const menu = ref<'align' | 'more' | null>(null)
const toolbar = ref<HTMLElement | null>(null)
useClickOutside(toolbar, computed(() => menu.value !== null), () => (menu.value = null))
const captionInput = ref<HTMLInputElement | null>(null)
const cropping = ref(false)
const viewing = ref(false)
const copied = ref(false)

function setAlign(value: Align) {
  props.updateAttributes({ align: value })
  menu.value = null
}
function toggleCaption() {
  const show = !captionShown.value
  props.updateAttributes({ showCaption: show })
  if (show) nextTick(() => captionInput.value?.focus())
}
function finishCrop(value: ImageCrop | null) {
  props.updateAttributes({ crop: value })
  cropping.value = false
}

/** Saves the original file; cross-origin links that refuse fetch open in a new tab. */
async function download() {
  const src = props.node.attrs.src as string
  const name = (props.node.attrs.alt as string) || 'image'
  const save = (href: string) => {
    const a = document.createElement('a')
    a.href = href
    a.download = name
    a.click()
  }
  if (!isRemote.value) return save(src)
  try {
    const blob = await (await fetch(src)).blob()
    const url = URL.createObjectURL(blob)
    save(url)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  catch {
    window.open(src, '_blank', 'noopener')
  }
}

async function copyLink() {
  await navigator.clipboard?.writeText(props.node.attrs.src)
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
  menu.value = null
}
function replace() {
  menu.value = null
  fileInput.value?.click()
}
function openOriginal() {
  menu.value = null
  window.open(props.node.attrs.src, '_blank', 'noopener')
}
function remove() {
  menu.value = null
  props.deleteNode()
}

// Cropped view: the frame takes the crop's aspect ratio and the image is offset inside it.
const cropStyle = computed(() => {
  const c = crop.value
  if (!c) return undefined
  return {
    width: `${100 / c.w}%`,
    left: `${(-c.x / c.w) * 100}%`,
    top: `${(-c.y / c.h) * 100}%`,
  }
})
</script>

<template>
  <NodeViewWrapper class="me-media" :class="{ 'is-readonly-empty': !editable && !node.attrs.src }">
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

    <figure
      v-else
      ref="figure"
      class="me-figure"
      :class="`me-figure--${align}`"
      :style="{ width: `${node.attrs.width}%` }"
    >
      <ImageCropper
        v-if="cropping"
        :src="node.attrs.src"
        :alt="node.attrs.alt"
        :crop="crop"
        :messages="m"
        @done="finishCrop"
        @cancel="cropping = false"
      />
      <div
        v-else
        class="me-figure-frame"
        :class="{ 'is-selected': selected, 'is-menu-open': menu !== null }"
      >
        <!-- Only this layer clips (for crops), so the toolbar's menus can overflow the frame. -->
        <div class="me-figure-media" :class="{ 'is-cropped': !!crop }" :style="crop ? { aspectRatio: String(crop.ratio) } : undefined">
          <img :src="node.attrs.src" :alt="node.attrs.alt || ''" class="me-figure-img" :style="cropStyle" draggable="false" @dblclick="viewing = true">
        </div>

        <div ref="toolbar" class="me-popover me-toolbar me-image-toolbar" contenteditable="false" @mousedown.stop>
          <template v-if="editable">
            <div class="me-image-menu-anchor">
              <button type="button" class="me-tool-btn" :title="m.align" @click="menu = menu === 'align' ? null : 'align'">
                <component :is="ALIGN_ICONS[align]" />
              </button>
              <div v-if="menu === 'align'" class="me-popover me-menu me-image-menu">
                <button v-for="a in (['left', 'center', 'right'] as const)" :key="a" type="button" class="me-menu-item" @click="setAlign(a)">
                  <span class="me-menu-icon"><component :is="ALIGN_ICONS[a]" /></span>
                  <span class="me-menu-title me-menu-text">{{ m.alignments[a] }}</span>
                  <Check v-if="align === a" class="me-menu-check" />
                </button>
              </div>
            </div>
            <button type="button" class="me-tool-btn" :class="{ 'is-active': captionShown }" :title="m.captionToggle" @click="toggleCaption">
              <Captions />
            </button>
            <button type="button" class="me-tool-btn" :class="{ 'is-active': !!crop }" :title="m.crop" @click="cropping = true">
              <Crop />
            </button>
          </template>
          <button type="button" class="me-tool-btn" :title="m.zoom" @click="viewing = true">
            <ZoomIn />
          </button>
          <button type="button" class="me-tool-btn" :title="m.download" @click="download">
            <Download />
          </button>
          <div class="me-image-menu-anchor">
            <button type="button" class="me-tool-btn" :title="m.more" @click="menu = menu === 'more' ? null : 'more'">
              <Ellipsis />
            </button>
            <div v-if="menu === 'more'" class="me-popover me-menu me-image-menu">
              <button v-if="editable" type="button" class="me-menu-item" @click="replace">
                <span class="me-menu-icon"><RefreshCw /></span>
                <span class="me-menu-title me-menu-text">{{ m.replace }}</span>
              </button>
              <button v-if="isRemote" type="button" class="me-menu-item" @click="copyLink">
                <span class="me-menu-icon"><component :is="copied ? Check : Copy" /></span>
                <span class="me-menu-title me-menu-text">{{ copied ? m.linkCopied : m.copyLink }}</span>
              </button>
              <button v-if="isRemote" type="button" class="me-menu-item" @click="openOriginal">
                <span class="me-menu-icon"><ExternalLink /></span>
                <span class="me-menu-title me-menu-text">{{ m.original }}</span>
              </button>
              <button v-if="editable" type="button" class="me-menu-item is-danger" @click="remove">
                <span class="me-menu-icon"><Trash /></span>
                <span class="me-menu-title me-menu-text">{{ m.delete }}</span>
              </button>
            </div>
          </div>
        </div>

        <template v-if="editable">
          <span class="me-resize-handle me-resize-handle--left" @pointerdown="startResize($event, -1)" />
          <span class="me-resize-handle me-resize-handle--right" @pointerdown="startResize($event, 1)" />
        </template>
      </div>
      <input
        v-if="captionShown && !cropping"
        ref="captionInput"
        class="me-caption"
        :value="node.attrs.caption"
        :readonly="!editable"
        :placeholder="editable ? m.caption : ''"
        @input="updateAttributes({ caption: ($event.target as HTMLInputElement).value })"
        @keydown.stop
      >
      <input ref="fileInput" type="file" accept="image/*" hidden @change="onFileChange">
      <p v-if="error" class="me-error">
        {{ error }}
      </p>
    </figure>

    <ImageLightbox
      v-if="viewing"
      :src="node.attrs.src"
      :alt="node.attrs.alt"
      :messages="m"
      :scope="scope"
      @close="viewing = false"
      @download="download"
    />
  </NodeViewWrapper>
</template>
