<script setup lang="ts">
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useEditable } from '../composables/useEditable'
import { handleAnchorRect } from '../handle-anchor'
import { PALETTE_NAMES } from '../theme/tokens'
import { useClickOutside } from '../composables/useClickOutside'

const props = defineProps(nodeViewProps)
const editable = useEditable(props.editor)

const ICONS = ['💡', '⚠️', '❗', '✅', 'ℹ️', '📌', '🔥', '📝', '🚀', '❓', '⭐', '🎯']
const open = ref(false)
const pickerEl = ref<HTMLElement | null>(null)
useClickOutside(pickerEl, open, () => (open.value = false))

const m = computed(() => props.editor.storage.meiConfig.messages)

// Keep the icon centered on the first line of the content, whatever block it is
// (text, heading, list, code…), measured the same way as the block handle.
const root = ref<{ $el: HTMLElement } | null>(null)
const iconEl = ref<HTMLElement | null>(null)
const iconOffset = ref(0)
function alignIcon() {
  const content = root.value?.$el.querySelector<HTMLElement>('.me-callout-content')
  const first = content?.firstElementChild
  if (!content || !(first instanceof HTMLElement) || !iconEl.value) return
  const line = handleAnchorRect(first)
  const center = line.top + line.height / 2 - content.getBoundingClientRect().top
  iconOffset.value = Math.round(center - iconEl.value.offsetHeight / 2)
}
let observer: ResizeObserver | null = null
onMounted(() => {
  alignIcon()
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => alignIcon())
    const content = root.value?.$el.querySelector('.me-callout-content')
    if (content) observer.observe(content)
  }
})
watch(() => props.node, () => nextTick(alignIcon))
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <NodeViewWrapper ref="root" class="me-callout" :data-color="node.attrs.color">
    <div ref="pickerEl" class="me-callout-icon-wrap" contenteditable="false" :style="{ marginTop: `${iconOffset}px` }">
      <button ref="iconEl" type="button" class="me-callout-icon" :title="m.callout.change" :disabled="!editable" @click="open = !open">
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
