<script setup lang="ts">
/**
 * Notion-style floating outline: short bars on the right edge, one per heading
 * (longer for higher levels, darker for the section in view). Hover to see the full
 * table of contents; click an entry to scroll to it.
 */
import type { Editor } from '@tiptap/vue-3'
import { TextSelection } from '@tiptap/pm/state'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useScope } from '../composables/useScope'

const props = defineProps<{ editor: Editor, minHeadings: number, root: HTMLElement | null }>()
const scope = useScope(() => props.editor)
/** Only show while the editor is on screen (several editors on a page don't stack outlines). */
const onScreen = ref(true)
let observer: IntersectionObserver | null = null
watch(() => props.root, (root) => {
  observer?.disconnect()
  if (!root || typeof IntersectionObserver === 'undefined') return
  observer = new IntersectionObserver((list) => {
    onScreen.value = list.at(-1)?.isIntersecting ?? true
  })
  observer.observe(root)
}, { immediate: true })

interface Entry { pos: number, level: number, text: string }
const entries = shallowRef<Entry[]>([])
const active = ref(-1)
const open = ref(false)
const m = computed(() => props.editor.storage.meiConfig.messages.toc)

function collect() {
  const list: Entry[] = []
  props.editor.state.doc.forEach((node, offset) => {
    if (node.type.name === 'heading') list.push({ pos: offset, level: node.attrs.level, text: node.textContent })
    else if (node.type.name === 'details' && node.attrs.level) list.push({ pos: offset, level: node.attrs.level, text: node.firstChild?.textContent ?? '' })
  })
  entries.value = list
  updateActive()
}

// Recollect at most once per frame while typing.
let pending = 0
function schedule() {
  if (pending) return
  pending = requestAnimationFrame(() => {
    pending = 0
    collect()
  })
}

/** The last heading whose top is above ~a quarter of the viewport. */
function updateActive() {
  const { view } = props.editor
  const line = window.innerHeight * 0.25
  let current = entries.value.length ? 0 : -1
  entries.value.forEach((e, i) => {
    const dom = view.nodeDOM(e.pos)
    if (dom instanceof HTMLElement && dom.getBoundingClientRect().top <= line) current = i
  })
  active.value = current
}
let scrollFrame = 0
function onScroll() {
  cancelAnimationFrame(scrollFrame)
  scrollFrame = requestAnimationFrame(updateActive)
}

function go(e: Entry) {
  const { view } = props.editor
  ;(view.nodeDOM(e.pos) as HTMLElement | null)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(e.pos + 1))))
  view.focus()
  open.value = false
}

const minLevel = computed(() => Math.min(...entries.value.map(e => e.level), 4))
const visible = computed(() => onScreen.value && entries.value.length >= props.minHeadings)

let closeTimer: ReturnType<typeof setTimeout> | undefined
function enter() {
  clearTimeout(closeTimer)
  open.value = true
}
function leave() {
  clearTimeout(closeTimer)
  closeTimer = setTimeout(() => (open.value = false), 150)
}

onMounted(() => {
  collect()
  props.editor.on('update', schedule)
  window.addEventListener('scroll', onScroll, { passive: true, capture: true })
  window.addEventListener('resize', onScroll, { passive: true })
})
onBeforeUnmount(() => {
  observer?.disconnect()
  props.editor.off('update', schedule)
  window.removeEventListener('scroll', onScroll, { capture: true })
  window.removeEventListener('resize', onScroll)
  cancelAnimationFrame(pending)
  cancelAnimationFrame(scrollFrame)
  clearTimeout(closeTimer)
})
</script>

<template>
  <!-- Fixed to the viewport's right edge (not the editor's), above full-width blocks. -->
  <Teleport to="body">
    <nav v-if="visible" v-bind="scope" class="me-outline" :aria-label="m.title" @mouseenter="enter" @mouseleave="leave">
      <div class="me-outline-bars" :class="{ 'is-hidden': open }">
        <span
          v-for="(e, i) in entries"
          :key="e.pos"
          class="me-outline-bar"
          :class="{ 'is-active': i === active }"
          :data-depth="e.level - minLevel"
        />
      </div>
      <div v-if="open" class="me-popover me-outline-panel">
        <button
          v-for="(e, i) in entries"
          :key="e.pos"
          type="button"
          class="me-outline-item"
          :class="{ 'is-active': i === active }"
          :data-depth="e.level - minLevel"
          @click="go(e)"
        >
          {{ e.text || m.untitled }}
        </button>
      </div>
    </nav>
  </Teleport>
</template>
