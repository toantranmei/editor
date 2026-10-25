<script setup lang="ts">
import { type Component, computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { type ShapeOutline, shapeOutline } from '../elements/outlines'
import type { SketchMessages } from '../messages'
import { SHAPE_TYPES, type ShapeType } from '../model/types'
import type { ToolName } from '../tools/controller'
import {
  Circle, Diamond, Eraser, Frame, Hand, Highlighter, ImagePlus, Lasso, Lock, LockOpen, Minus, MousePointer2,
  MoveUpRight, Pencil, Pipette, Shapes, Square, StickyNote, Type, Wand2,
} from './icons'

const props = withDefaults(defineProps<{
  tool: ToolName
  locked: boolean
  readonly: boolean
  /** View mode: only the hand tool. */
  viewMode?: boolean
  /** Shape last chosen from the shapes popover (the shapes button shows it); null = none yet. */
  lastShape?: ShapeType | null
  messages: SketchMessages
}>(), { viewMode: false, lastShape: null })

const emit = defineEmits<{
  select: [tool: ToolName]
  toggleLock: []
  /** A shape chosen from the shapes popover (the board takes focus back: the popover is gone). */
  pickShape: [shape: ShapeType]
  /** The image button: open the file picker. */
  insertImage: []
}>()

/**
 * `badge` is the letter shortcut named in the tooltip ('' = no key). `shapes` opens the shapes popover and
 * `image` the file picker; the rest select their tool.
 */
type ItemName = ToolName | 'shapes' | 'image'
interface Item { name: ItemName; icon: Component; badge: string }

/** Shapes with a button of their own; the shapes popover lists all of them. */
const DIRECT_SHAPES: ReadonlySet<string> = new Set(['rectangle', 'diamond', 'ellipse'])
const SHAPE_SET: ReadonlySet<string> = new Set(SHAPE_TYPES)

const GROUPS: Item[][] = [
  [
    { name: 'hand', icon: Hand, badge: 'H' },
    { name: 'select', icon: MousePointer2, badge: 'V' },
    { name: 'lasso', icon: Lasso, badge: '' },
  ],
  [
    { name: 'rectangle', icon: Square, badge: 'R' },
    { name: 'diamond', icon: Diamond, badge: 'D' },
    { name: 'ellipse', icon: Circle, badge: 'O' },
    { name: 'shapes', icon: Shapes, badge: '' },
    { name: 'arrow', icon: MoveUpRight, badge: 'A' },
    { name: 'line', icon: Minus, badge: 'L' },
  ],
  [
    { name: 'pen', icon: Pencil, badge: 'P' },
    { name: 'highlighter', icon: Highlighter, badge: 'M' },
    { name: 'text', icon: Type, badge: 'T' },
    { name: 'sticky', icon: StickyNote, badge: 'S' },
    { name: 'frame', icon: Frame, badge: 'F' },
    { name: 'image', icon: ImagePlus, badge: '' },
  ],
  [
    { name: 'eraser', icon: Eraser, badge: 'E' },
    { name: 'laser', icon: Wand2, badge: 'K' },
    { name: 'eyedropper', icon: Pipette, badge: 'I' },
  ],
]

/** Read-only: hand and select (no lock); view mode: hand only. */
const groups = computed(() => {
  if (props.viewMode) return [GROUPS[0]!.filter(i => i.name === 'hand')]
  if (props.readonly) return [GROUPS[0]!.filter(i => i.name === 'hand' || i.name === 'select')]
  return GROUPS
})
const showLock = computed(() => !props.readonly && !props.viewMode)

function title(name: ItemName): string {
  if (name === 'shapes') return props.messages.shapes
  if (name === 'image') return props.messages.insertImage
  return props.messages.tools[name]
}

/** The shapes button is active while a shape without a button of its own is the tool. */
function isActive(name: ItemName): boolean {
  if (name === 'shapes') return SHAPE_SET.has(props.tool) && !DIRECT_SHAPES.has(props.tool)
  return name !== 'image' && props.tool === name
}

/** The tooltip without its "(K)" key hint, for the popover cells. */
const shapeName = (s: ShapeType): string => props.messages.tools[s].replace(/ \([A-Z]\)$/, '')

// ---------- shape previews: outlines in a 20×16 box, centered in a 24×24 view box ----------
const PREVIEW_W = 20
const PREVIEW_H = 16

interface Preview { polygon?: string; d?: string; detail?: string }

function toPreview(o: ShapeOutline): Preview {
  if (o.kind === 'polygon') return { polygon: o.points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ') }
  return { d: o.d, detail: o.detail }
}

const PREVIEWS = Object.fromEntries(
  SHAPE_TYPES.map(s => [s, toPreview(shapeOutline(s, PREVIEW_W, PREVIEW_H))]),
) as Record<ShapeType, Preview>
const PREVIEW_TRANSFORM = `translate(${(24 - PREVIEW_W) / 2} ${(24 - PREVIEW_H) / 2})`
/** Preview icon on the shapes button: the last shape, unless it has a button of its own (then the generic icon). */
const buttonShape = computed(() => (props.lastShape && !DIRECT_SHAPES.has(props.lastShape) ? props.lastShape : null))

// ---------- shapes popover ----------
const open = ref(false)
const wrap = shallowRef<HTMLElement | null>(null)
const popover = shallowRef<HTMLElement | null>(null)

function onDocPointerDown(e: PointerEvent): void {
  if (e.target instanceof Node && wrap.value?.contains(e.target)) return
  open.value = false
}

watch(open, (on) => {
  if (!on) {
    document.removeEventListener('pointerdown', onDocPointerDown, true)
    return
  }
  document.addEventListener('pointerdown', onDocPointerDown, true)
  // focus the last chosen shape's cell (else the first)
  void nextTick(() => {
    const cell = popover.value?.querySelector<HTMLButtonElement>(`[data-shape="${props.lastShape ?? SHAPE_TYPES[0]}"]`)
    cell?.focus({ preventScroll: true })
  })
})
// read-only / view mode hide the shapes button: close the popover with it
watch(groups, () => (open.value = false))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocPointerDown, true))

function onItem(name: ItemName): void {
  if (name === 'shapes') {
    open.value = !open.value
    return
  }
  open.value = false
  if (name === 'image') emit('insertImage')
  else emit('select', name)
}

function pick(shape: ShapeType): void {
  open.value = false
  emit('pickShape', shape)
}

/** Focus moving out of the popover (Tab, a click elsewhere) closes it. */
function onFocusOut(e: FocusEvent): void {
  const next = e.relatedTarget
  if (next instanceof Node && popover.value?.contains(next)) return
  open.value = false
}

/** Escape closes an open popover; the board does not see it (it would switch tools or leave). */
function onKeydown(e: KeyboardEvent): void {
  if (!open.value || e.key !== 'Escape') return
  e.preventDefault()
  e.stopPropagation()
  open.value = false
  wrap.value?.querySelector<HTMLButtonElement>('[data-tool="shapes"]')?.focus({ preventScroll: true })
}
</script>

<template>
  <div ref="wrap" class="me-sketch-toolbar-wrap" @keydown="onKeydown">
    <div class="me-sketch-toolbar" role="toolbar" :aria-label="messages.toolbar">
      <template v-if="showLock">
        <button
          type="button"
          class="me-tool-btn me-sketch-tool"
          data-tool="lock"
          :class="{ 'is-active': locked }"
          :title="messages.tools.lock"
          :aria-label="messages.tools.lock"
          :aria-pressed="locked"
          @click="emit('toggleLock')"
        >
          <Lock v-if="locked" />
          <LockOpen v-else />
          <span class="me-sketch-badge" aria-hidden="true">Q</span>
        </button>
        <span class="me-toolbar-divider" aria-hidden="true" />
      </template>
      <template v-for="(group, gi) in groups" :key="gi">
        <span v-if="gi > 0" class="me-toolbar-divider" aria-hidden="true" />
        <button
          v-for="item in group"
          :key="item.name"
          type="button"
          class="me-tool-btn me-sketch-tool"
          :data-tool="item.name"
          :data-shape="item.name === 'shapes' && lastShape ? lastShape : undefined"
          :class="{ 'is-active': isActive(item.name) }"
          :title="title(item.name)"
          :aria-label="title(item.name)"
          :aria-pressed="item.name === 'image' || item.name === 'shapes' ? undefined : isActive(item.name)"
          :aria-haspopup="item.name === 'shapes' ? 'true' : undefined"
          :aria-expanded="item.name === 'shapes' ? open : undefined"
          @click="onItem(item.name)"
        >
          <svg v-if="item.name === 'shapes' && buttonShape" class="me-sketch-shape-icon" viewBox="0 0 24 24" aria-hidden="true">
            <g :transform="PREVIEW_TRANSFORM">
              <polygon v-if="PREVIEWS[buttonShape].polygon" :points="PREVIEWS[buttonShape].polygon" />
              <path v-else :d="PREVIEWS[buttonShape].d" />
              <path v-if="PREVIEWS[buttonShape].detail" :d="PREVIEWS[buttonShape].detail" />
            </g>
          </svg>
          <component :is="item.icon" v-else />
          <span v-if="item.badge" class="me-sketch-badge" aria-hidden="true">{{ item.badge }}</span>
        </button>
      </template>
    </div>
    <div v-if="open" ref="popover" class="me-sketch-shapes" role="group" :aria-label="messages.shapes" @focusout="onFocusOut">
      <p class="me-sketch-shapes-title" aria-hidden="true">
        {{ messages.shapes }}
      </p>
      <div class="me-sketch-shapes-grid">
        <button
          v-for="s in SHAPE_TYPES"
          :key="s"
          type="button"
          class="me-tool-btn me-sketch-shape-cell"
          :class="{ 'is-active': tool === s }"
          :data-shape="s"
          :title="messages.tools[s]"
          :aria-pressed="tool === s"
          @click="pick(s)"
        >
          <svg class="me-sketch-shape-icon" viewBox="0 0 24 24" aria-hidden="true">
            <g :transform="PREVIEW_TRANSFORM">
              <polygon v-if="PREVIEWS[s].polygon" :points="PREVIEWS[s].polygon" />
              <path v-else :d="PREVIEWS[s].d" />
              <path v-if="PREVIEWS[s].detail" :d="PREVIEWS[s].detail" />
            </g>
          </svg>
          <span class="me-sketch-shape-name">{{ shapeName(s) }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
