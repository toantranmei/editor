<script setup lang="ts">
import type { Editor as CoreEditor } from '@tiptap/core'
import type { Editor } from '@tiptap/vue-3'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import { type EditorState, NodeSelection } from '@tiptap/pm/state'
import { CellSelection } from '@tiptap/pm/tables'
import { Baseline, Bold, Check, ChevronDown, Code, Italic, Link, Strikethrough, Underline, Unlink } from '@lucide/vue'
import { computed, nextTick, ref } from 'vue'
import { blockTitle, turnIntoBlocks } from '../block-items'
import type { ColorName } from '../colors'
import { useScope } from '../composables/useScope'
import { readTokenPx } from '../theme/read'
import { pushRecentColor, recent } from '../recent'
import { blocksIn, currentRange, isBlockSelection, rangeColors, turnBlocksInto } from '../block-ops'
import ColorList from './ColorList.vue'

const props = defineProps<{ editor: Editor }>()

const panel = ref<'turn' | 'color' | 'link' | null>(null)
const linkUrl = ref('')
const linkInput = ref<HTMLInputElement | null>(null)
const m = computed(() => props.editor.storage.meiConfig.messages)
const scope = useScope(() => props.editor)
const offset = readTokenPx(props.editor.view.dom, 'popover.offset')

const shouldShow = ({ editor, state, from, to }: { editor: CoreEditor, state: EditorState, from: number, to: number }) => {
  if (!editor.isEditable || from === to) return false
  // Whole-block selections use the ⋮⋮ menu instead, like Notion.
  // Whole cells use the table toolbar.
  if (state.selection instanceof NodeSelection || state.selection instanceof CellSelection || isBlockSelection(state)) return false
  if (editor.isActive('codeBlock')) return false
  return state.doc.textBetween(from, to).length > 0
}

const targets = computed(() => turnIntoBlocks(props.editor))
const current = computed(() => {
  const range = currentRange(props.editor.state)
  const first = range && blocksIn(props.editor.state.doc, range)[0]
  return first ? targets.value.find(b => b.matches?.(first.node)) : undefined
})

const marks = computed(() => [
  { name: 'bold', icon: Bold, title: `${m.value.format.bold} (⌘B)`, run: () => props.editor.chain().focus().toggleBold().run() },
  { name: 'italic', icon: Italic, title: `${m.value.format.italic} (⌘I)`, run: () => props.editor.chain().focus().toggleItalic().run() },
  { name: 'underline', icon: Underline, title: `${m.value.format.underline} (⌘U)`, run: () => props.editor.chain().focus().toggleUnderline().run() },
  { name: 'strike', icon: Strikethrough, title: `${m.value.format.strike} (⌘⇧S)`, run: () => props.editor.chain().focus().toggleStrike().run() },
  { name: 'code', icon: Code, title: `${m.value.format.code} (⌘E)`, run: () => props.editor.chain().focus().toggleCode().run() },
])

function toggle(p: typeof panel.value) {
  panel.value = panel.value === p ? null : p
  if (p === 'link' && panel.value === 'link') {
    linkUrl.value = props.editor.getAttributes('link').href ?? ''
    nextTick(() => linkInput.value?.focus())
  }
}

function turnInto(id: string) {
  const range = currentRange(props.editor.state)
  const target = targets.value.find(b => b.id === id)
  if (range && target) turnBlocksInto(props.editor, range, target)
  panel.value = null
}

function applyLink(href = linkUrl.value.trim()) {
  const chain = props.editor.chain().focus().extendMarkRange('link')
  if (!href) chain.unsetLink().run()
  else chain.setLink({ href: /^[a-z]+:/i.test(href) ? href : `https://${href}` }).run()
  panel.value = null
}

function setColor(kind: 'text' | 'bg', color: ColorName) {
  if (color !== 'default') pushRecentColor({ kind, color })
  const chain = props.editor.chain().focus()
  ;(kind === 'text' ? chain.setTextColor(color) : chain.setBgColor(color)).run()
  panel.value = null
}

// Colors of the selected text, to tick them in the menu.
const selectionColors = computed(() => {
  const { from, to } = props.editor.state.selection
  return rangeColors(props.editor.state, { from, to, depth: 0 })
})
const activeTextColor = computed(() => props.editor.getAttributes('textColor').color as string | undefined)
</script>

<template>
  <BubbleMenu
    :editor="editor"
    :should-show="shouldShow"
    :options="{ placement: 'top-start', offset, onHide: () => (panel = null) }"
    plugin-key="formatMenu"
  >
    <div v-bind="scope" class="me-popover me-toolbar" @mousedown="panel !== 'link' && $event.preventDefault()">
      <template v-if="current">
        <button type="button" class="me-tool-btn" @click="toggle('turn')">
          {{ blockTitle(m, current) }} <ChevronDown class="me-chevron" />
        </button>
        <span class="me-toolbar-divider" />
      </template>

      <button
        v-for="mark in marks"
        :key="mark.name"
        type="button"
        class="me-tool-btn"
        :class="{ 'is-active': editor.isActive(mark.name) }"
        :title="mark.title"
        @click="mark.run"
      >
        <component :is="mark.icon" />
      </button>

      <span class="me-toolbar-divider" />
      <button type="button" class="me-tool-btn" :class="{ 'is-active': editor.isActive('link') }" :title="m.format.link" @click="toggle('link')">
        <Link />
      </button>
      <button type="button" class="me-tool-btn" :title="m.format.color" @click="toggle('color')">
        <Baseline class="me-swatch--text" :data-color="activeTextColor" />
        <ChevronDown class="me-chevron" />
      </button>

      <div v-if="panel === 'turn'" class="me-popover me-toolbar-panel me-menu">
        <button v-for="b in targets" :key="b.id" type="button" class="me-menu-item" @click="turnInto(b.id)">
          <span class="me-menu-icon"><component :is="b.icon" /></span>
          <span class="me-menu-title me-menu-text">{{ blockTitle(m, b) }}</span>
          <Check v-if="current?.id === b.id" class="me-menu-check" />
        </button>
      </div>

      <form v-if="panel === 'link'" class="me-popover me-toolbar-panel me-link-form" @submit.prevent="applyLink()">
        <input ref="linkInput" v-model="linkUrl" class="me-input" :placeholder="m.format.linkPlaceholder" @keydown.esc="panel = null">
        <button type="submit" class="me-btn me-btn--primary">
          {{ m.format.apply }}
        </button>
        <button v-if="editor.isActive('link')" type="button" class="me-btn" :title="m.format.removeLink" @click="applyLink('')">
          <Unlink />
        </button>
      </form>

      <div v-if="panel === 'color'" class="me-popover me-toolbar-panel me-toolbar-panel--end me-menu">
        <ColorList :messages="m" :recent="recent.colors" :current="selectionColors" @pick="setColor" />
      </div>
    </div>
  </BubbleMenu>
</template>
