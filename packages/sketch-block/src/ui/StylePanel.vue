<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { sanitizeLink } from '../io/links'
import type { SketchMessages, StyleMessages } from '../messages'
import { type CurrentStyle, relevantStyleKeys, STYLE_SECTIONS, type StyleKey, type StyleSection } from '../model/style'
import { type ElementType, type SketchElement, STICKY_COLORS } from '../model/types'
import { displayColor, type Theme } from '../render/shapes'
import { FONT_FAMILIES } from '../text/fonts'
import { TOOL_ELEMENT_TYPES, type ToolName } from '../tools/controller'
import { type AlignMode, arrangeUnits, canGroup as groupable, type DistributeAxis } from '../geometry/align'
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalDistributeCenter,
  AlignStartHorizontal, AlignStartVertical, AlignVerticalDistributeCenter, BringToFront, Group, Lock, LockOpen, Palette, SendToBack, TextAlignCenter, TextAlignEnd, TextAlignStart, Ungroup,
} from './icons'
import { BG_COLORS, STROKE_COLORS } from './palette'

const props = withDefaults(defineProps<{
  /** Selected elements (empty = style for the next element of the active tool). */
  elements: readonly SketchElement[]
  tool: ToolName
  currentStyle: CurrentStyle
  messages: SketchMessages
  theme?: Theme
  readonly?: boolean
  /** Hide regardless of tool / selection (zen and view modes). */
  hidden?: boolean
}>(), { theme: 'light', readonly: false, hidden: false })

const emit = defineEmits<{
  apply: [patch: Partial<CurrentStyle>]
  layer: [to: 'front' | 'back']
  align: [mode: AlignMode]
  distribute: [axis: DistributeAxis]
  group: []
  ungroup: []
  lock: []
  /**
   * New link ('' = remove) of element `id`: the single selected element when the edit began, even if the selection
   * changed before the commit. Only allowed values are emitted.
   */
  link: [id: string, value: string]
}>()

/** Element type each drawing tool creates. */
const TOOL_TYPES = TOOL_ELEMENT_TYPES

const m = computed<StyleMessages>(() => props.messages.style)
const collapsed = ref(false)

const types = computed<Set<ElementType>>(() => {
  if (props.elements.length) return new Set(props.elements.map(el => el.type))
  const t = TOOL_TYPES[props.tool]
  return new Set(t ? [t] : [])
})

const visible = computed(() => !props.hidden && !props.readonly && types.value.size > 0)

const sections = computed<Set<StyleSection | 'layers'>>(() => {
  const out = new Set<StyleSection | 'layers'>()
  for (const s of STYLE_SECTIONS) if (s.types.some(t => types.value.has(t))) out.add(s.id)
  if (props.elements.length) out.add('layers')
  return out
})

/** Mixed marker: the selection holds several values for the key. */
const MIXED = Symbol('mixed')

/** The selection's common value for `key` (over the elements it applies to), else the current style's. */
function common<K extends StyleKey>(key: K): CurrentStyle[K] | typeof MIXED {
  let found = false
  let value: CurrentStyle[K] | undefined
  for (const el of props.elements) {
    if (!relevantStyleKeys(el.type).has(key)) continue
    const v = (el as unknown as CurrentStyle)[key]
    if (!found) {
      found = true
      value = v
    } else if (v !== value) {
      return MIXED
    }
  }
  return found ? value! : props.currentStyle[key]
}

const values = computed(() => {
  const out = {} as { [K in StyleKey]: CurrentStyle[K] | typeof MIXED }
  for (const s of STYLE_SECTIONS) for (const k of s.keys) (out as Record<string, unknown>)[k] = common(k)
  return out
})

const mixedSection = (id: StyleSection): boolean =>
  STYLE_SECTIONS.find(s => s.id === id)!.keys.some(k => values.value[k] === MIXED)

const isActive = (key: StyleKey, v: unknown): boolean => {
  const cur = values.value[key]
  return typeof cur === 'string' && typeof v === 'string' ? cur.toLowerCase() === v.toLowerCase() : cur === v
}

function apply<K extends StyleKey>(key: K, v: CurrentStyle[K]): void {
  emit('apply', { [key]: v } as Partial<CurrentStyle>)
}

// ---------- colors ----------
type ColorKey = 'stroke' | 'fill' | 'color'
/** Swatches per color key (sticky colors are pastel in both themes: never theme-mapped). */
const PALETTES: Record<ColorKey, readonly string[]> = { stroke: STROKE_COLORS, fill: BG_COLORS, color: STICKY_COLORS }
const swatchStyle = (c: string) => (c === 'transparent' ? undefined : { background: displayColor(c, props.theme) })
const isPalette = (key: ColorKey, c: unknown): boolean =>
  typeof c === 'string' && PALETTES[key].some(p => p === c.toLowerCase())
/** `<input type="color">` value: the current hex (the palette's first color when mixed / transparent). */
function pickerValue(key: ColorKey): string {
  const v = values.value[key]
  return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : PALETTES[key][0]!
}
function onPicker(key: ColorKey, e: Event): void {
  apply(key, (e.target as HTMLInputElement).value)
}
const colorRows = computed(() => [
  { id: 'stickyColor' as const, key: 'color' as const, colors: STICKY_COLORS, label: m.value.stickyColor },
  { id: 'stroke' as const, key: 'stroke' as const, colors: STROKE_COLORS, label: m.value.stroke },
  { id: 'background' as const, key: 'fill' as const, colors: BG_COLORS, label: m.value.background },
].filter(r => sections.value.has(r.id)))

/** Some type in the selection (or the tool's) has a font size (sticky text is auto-fit). */
const hasFontSize = computed(() => [...types.value].some(t => relevantStyleKeys(t).has('fontSize')))

// ---------- option rows (glyphs are 20×20 inline SVG paths, drawn in currentColor) ----------
interface Path { d: string; fill?: boolean; width?: number; dash?: string }
interface Option<V> { value: V; label: string; paths?: Path[]; text?: string; font?: string }

const line = (d: string, extra: Omit<Path, 'd'> = {}): Path => ({ d, ...extra })

const fillStyles = computed<Option<CurrentStyle['fillStyle']>[]>(() => [
  { value: 'hachure', label: m.value.hachure, paths: [line('M4 4h12v12H4z'), line('M4 10l6-6M4 16l12-12M10 16l6-6')] },
  { value: 'cross-hatch', label: m.value.crossHatch, paths: [line('M4 4h12v12H4z'), line('M4 10l6-6M4 16l12-12M10 16l6-6M10 4l6 6M4 4l12 12M4 10l6 6')] },
  { value: 'solid', label: m.value.solid, paths: [line('M4 4h12v12H4z', { fill: true })] },
])
const strokeWidths = computed<Option<CurrentStyle['strokeWidth']>[]>(() => [
  { value: 1, label: m.value.thin, paths: [line('M3 10h14', { width: 1 })] },
  { value: 2, label: m.value.bold, paths: [line('M3 10h14', { width: 2 })] },
  { value: 4, label: m.value.extraBold, paths: [line('M3 10h14', { width: 4 })] },
])
const strokeStyles = computed<Option<CurrentStyle['strokeStyle']>[]>(() => [
  { value: 'solid', label: m.value.solid, paths: [line('M3 10h14')] },
  { value: 'dashed', label: m.value.dashed, paths: [line('M3 10h14', { dash: '4 3' })] },
  { value: 'dotted', label: m.value.dotted, paths: [line('M3 10h14', { dash: '1 3' })] },
])
const sloppiness = computed<Option<CurrentStyle['roughness']>[]>(() => [
  { value: 0, label: m.value.architect, paths: [line('M3 14c4-8 10-8 14 0')] },
  { value: 1, label: m.value.artist, paths: [line('M3 14c3-9 9-7 14 0M4 13c4-7 9-6 12 1')] },
  { value: 2, label: m.value.cartoonist, paths: [line('M3 15c2-10 7-9 9-3s4 3 5 0M4 12c3-6 6-5 8 0')] },
])
const edges = computed<Option<CurrentStyle['roundness']>[]>(() => [
  { value: 'sharp', label: m.value.sharp, paths: [line('M4 16V4h12')] },
  { value: 'round', label: m.value.round, paths: [line('M4 16v-6a6 6 0 0 1 6-6h6')] },
])
const HEADS: Record<CurrentStyle['endArrowhead'], Path[]> = {
  none: [line('M3 10h14')],
  arrow: [line('M3 10h14M12 5l5 5-5 5')],
  triangle: [line('M3 10h9'), line('M11 5l6 5-6 5z', { fill: true })],
  dot: [line('M3 10h10'), line('M13 10a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0', { fill: true })],
  bar: [line('M3 10h14M17 5v10')],
}
const heads = computed<Option<CurrentStyle['endArrowhead']>[]>(() =>
  (Object.keys(HEADS) as CurrentStyle['endArrowhead'][]).map(v => ({ value: v, label: m.value[v], paths: HEADS[v] })))
const routings = computed<Option<CurrentStyle['routing']>[]>(() => [
  { value: 'straight', label: m.value.straight, paths: [line('M3 17L17 3')] },
  { value: 'elbow', label: m.value.elbow, paths: [line('M3 17v-7h14V3')] },
  { value: 'curved', label: m.value.curved, paths: [line('M3 17C3 8 17 12 17 3')] },
])
const families = computed<Option<CurrentStyle['fontFamily']>[]>(() => [
  { value: 'hand', label: m.value.fontHand, text: 'Aa', font: FONT_FAMILIES.hand },
  { value: 'normal', label: m.value.fontNormal, text: 'Aa', font: FONT_FAMILIES.normal },
  { value: 'code', label: m.value.fontCode, text: 'Aa', font: FONT_FAMILIES.code },
])
const sizes = computed<Option<CurrentStyle['fontSize']>[]>(() => [
  { value: 16, label: m.value.small, text: 'S' },
  { value: 20, label: m.value.medium, text: 'M' },
  { value: 28, label: m.value.large, text: 'L' },
  { value: 36, label: m.value.extraLarge, text: 'XL' },
])
const aligns = computed(() => [
  { value: 'left' as const, label: m.value.alignLeft, icon: TextAlignStart },
  { value: 'center' as const, label: m.value.alignCenter, icon: TextAlignCenter },
  { value: 'right' as const, label: m.value.alignRight, icon: TextAlignEnd },
])

/** Option rows per section, in panel order (colors, font, arrowheads, opacity and layers are laid out apart). */
const optionRows = computed(() => [
  { id: 'fillStyle' as const, key: 'fillStyle' as const, label: m.value.fillStyle, options: fillStyles.value },
  { id: 'strokeWidth' as const, key: 'strokeWidth' as const, label: m.value.strokeWidth, options: strokeWidths.value },
  { id: 'strokeStyle' as const, key: 'strokeStyle' as const, label: m.value.strokeStyle, options: strokeStyles.value },
  { id: 'sloppiness' as const, key: 'roughness' as const, label: m.value.sloppiness, options: sloppiness.value },
  { id: 'edges' as const, key: 'roundness' as const, label: m.value.edges, options: edges.value },
].filter(r => sections.value.has(r.id)) as { id: StyleSection; key: StyleKey; label: string; options: Option<unknown>[] }[])

const opacityPct = computed(() => {
  const v = values.value.opacity
  return v === MIXED ? null : Math.round(v * 100)
})
function onOpacity(e: Event): void {
  apply('opacity', Number((e.target as HTMLInputElement).value) / 100)
}

// ---------- arrange ----------
// buttons appear only where they act: units are unlocked elements, an outermost group counting once
const units = computed(() => arrangeUnits(props.elements))
const canGroup = computed(() => groupable(props.elements))
// lucide's "vertical" icons align along x (a vertical guide line), the "horizontal" ones along y
const alignModes = computed(() => [
  { value: 'left' as const, label: m.value.alignElLeft, icon: AlignStartVertical },
  { value: 'hcenter' as const, label: m.value.alignElHCenter, icon: AlignCenterVertical },
  { value: 'right' as const, label: m.value.alignElRight, icon: AlignEndVertical },
  { value: 'top' as const, label: m.value.alignElTop, icon: AlignStartHorizontal },
  { value: 'vcenter' as const, label: m.value.alignElVCenter, icon: AlignCenterHorizontal },
  { value: 'bottom' as const, label: m.value.alignElBottom, icon: AlignEndHorizontal },
])
const distributeAxes = computed(() => [
  { value: 'h' as const, label: m.value.distributeH, icon: AlignHorizontalDistributeCenter },
  { value: 'v' as const, label: m.value.distributeV, icon: AlignVerticalDistributeCenter },
])
const canUngroup = computed(() => props.elements.some(el => !el.locked && el.groupIds.length > 0))
const allLocked = computed(() => props.elements.length > 0 && props.elements.every(el => el.locked))

// ---------- link (single selection) ----------
const linkTarget = computed(() => (props.elements.length === 1 ? props.elements[0]! : null))
const linkDraft = ref('')
const linkInvalid = ref(false)
/** The edit in progress: the element it targets and its link when the edit began (null = not editing). */
let linkEdit: { id: string; original: string } | null = null

/** Focus / first keystroke: the edit targets the element selected now. */
function startLinkEdit(): void {
  const el = linkTarget.value
  if (el && !linkEdit) linkEdit = { id: el.id, original: el.link ?? '' }
}

// the field follows the selected element (and remote / undo changes of its link) unless that element is being edited
watch(() => [linkTarget.value?.id, linkTarget.value?.link] as const, ([id]) => {
  // the selection moved on mid-edit: the draft still goes to the element it was typed for
  if (linkEdit && linkEdit.id !== id) commitLink(true)
  if (linkEdit) return
  linkDraft.value = linkTarget.value?.link ?? ''
  linkInvalid.value = false
}, { immediate: true })

/**
 * Blur / Enter: an allowed link (or '' to remove it) is emitted for the edited element; anything else shows the
 * hint and is not saved (the edit stays open to fix it). `flush` (the selection changed): an invalid draft is dropped.
 */
function commitLink(flush = false): void {
  const edit = linkEdit
  if (!edit) return
  const raw = linkDraft.value.trim()
  if (raw && !sanitizeLink(raw)) {
    if (flush) {
      linkEdit = null
      linkInvalid.value = false
    } else {
      linkInvalid.value = true
    }
    return
  }
  linkEdit = null
  linkInvalid.value = false
  if (raw !== edit.original) emit('link', edit.id, raw)
}

function onLinkKey(e: KeyboardEvent): void {
  if (e.isComposing || e.keyCode === 229) return
  if (e.key === 'Enter') {
    e.preventDefault()
    commitLink()
  } else if (e.key === 'Escape') {
    // back to the stored value
    e.preventDefault()
    linkEdit = null
    linkDraft.value = linkTarget.value?.link ?? ''
    linkInvalid.value = false
    ;(e.target as HTMLInputElement).blur()
  }
}
</script>

<template>
  <div v-if="visible" class="me-sketch-style" :class="{ 'is-collapsed': collapsed }" @pointerdown.stop>
    <button
      type="button"
      class="me-tool-btn me-sketch-style-toggle"
      :title="collapsed ? m.expand : m.collapse"
      :aria-label="collapsed ? m.expand : m.collapse"
      :aria-expanded="!collapsed"
      @click="collapsed = !collapsed"
    >
      <Palette />
      <span v-if="!collapsed">{{ m.panel }}</span>
    </button>
    <div v-if="!collapsed" class="me-sketch-style-body">
      <!-- colors: first rows -->
      <section
        v-for="row in colorRows"
        :key="row.id"
        class="me-sketch-style-section"
        :class="{ 'is-mixed': mixedSection(row.id) }"
        :data-section="row.id"
      >
        <h3 class="me-sketch-style-label">
          {{ row.label }}<span v-if="mixedSection(row.id)" class="me-sketch-style-mixed"> · {{ m.mixed }}</span>
        </h3>
        <div class="me-sketch-style-row">
          <button
            v-for="c in row.colors"
            :key="c"
            type="button"
            class="me-sketch-swatch"
            :class="{ 'is-active': isActive(row.key, c), 'is-transparent': c === 'transparent' }"
            :style="swatchStyle(c)"
            :data-value="c"
            :title="c === 'transparent' ? m.transparent : c"
            :aria-label="c === 'transparent' ? m.transparent : c"
            :aria-pressed="isActive(row.key, c)"
            @click="apply(row.key, c)"
          />
          <input
            type="color"
            class="me-sketch-color-input"
            :class="{ 'is-active': values[row.key] !== MIXED && !isPalette(row.key, values[row.key]) }"
            :value="pickerValue(row.key)"
            :title="m.customColor"
            :aria-label="`${row.label}: ${m.customColor}`"
            @change="onPicker(row.key, $event)"
          >
        </div>
      </section>

      <section
        v-for="row in optionRows"
        :key="row.id"
        class="me-sketch-style-section"
        :class="{ 'is-mixed': mixedSection(row.id) }"
        :data-section="row.id"
      >
        <h3 class="me-sketch-style-label">
          {{ row.label }}<span v-if="mixedSection(row.id)" class="me-sketch-style-mixed"> · {{ m.mixed }}</span>
        </h3>
        <div class="me-sketch-style-row">
          <button
            v-for="o in row.options"
            :key="String(o.value)"
            type="button"
            class="me-tool-btn me-sketch-style-opt"
            :class="{ 'is-active': isActive(row.key, o.value) }"
            :data-value="String(o.value)"
            :title="o.label"
            :aria-label="o.label"
            :aria-pressed="isActive(row.key, o.value)"
            @click="apply(row.key, o.value as never)"
          >
            <svg viewBox="0 0 20 20" class="me-sketch-glyph" aria-hidden="true">
              <path
                v-for="(p, i) in o.paths" :key="i" :d="p.d" :fill="p.fill ? 'currentColor' : 'none'"
                stroke="currentColor" :stroke-width="p.width ?? 1.5" :stroke-dasharray="p.dash"
                stroke-linecap="round" stroke-linejoin="round"
              />
            </svg>
          </button>
        </div>
      </section>

      <section
        v-if="sections.has('arrowheads')"
        class="me-sketch-style-section"
        :class="{ 'is-mixed': mixedSection('arrowheads') }"
        data-section="arrowheads"
      >
        <h3 class="me-sketch-style-label">
          {{ m.arrowheads }}<span v-if="mixedSection('arrowheads')" class="me-sketch-style-mixed"> · {{ m.mixed }}</span>
        </h3>
        <div
          v-for="side in (['start', 'end'] as const)"
          :key="side"
          class="me-sketch-style-row"
          role="group"
          :aria-label="side === 'start' ? m.startArrowhead : m.endArrowhead"
        >
          <button
            v-for="o in heads"
            :key="o.value"
            type="button"
            class="me-tool-btn me-sketch-style-opt"
            :class="{ 'is-active': isActive(side === 'start' ? 'startArrowhead' : 'endArrowhead', o.value) }"
            :data-start="side === 'start' ? o.value : undefined"
            :data-end="side === 'end' ? o.value : undefined"
            :title="`${side === 'start' ? m.startArrowhead : m.endArrowhead}: ${o.label}`"
            :aria-label="`${side === 'start' ? m.startArrowhead : m.endArrowhead}: ${o.label}`"
            @click="apply(side === 'start' ? 'startArrowhead' : 'endArrowhead', o.value)"
          >
            <svg viewBox="0 0 20 20" class="me-sketch-glyph" aria-hidden="true">
              <g :transform="side === 'start' ? 'translate(20 0) scale(-1 1)' : undefined">
                <path
                  v-for="(p, i) in o.paths" :key="i" :d="p.d" :fill="p.fill ? 'currentColor' : 'none'"
                  stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
                />
              </g>
            </svg>
          </button>
        </div>
        <div class="me-sketch-style-row" role="group" :aria-label="m.routing">
          <button
            v-for="o in routings"
            :key="o.value"
            type="button"
            class="me-tool-btn me-sketch-style-opt"
            :class="{ 'is-active': isActive('routing', o.value) }"
            :data-routing="o.value"
            :title="`${m.routing}: ${o.label}`"
            :aria-label="`${m.routing}: ${o.label}`"
            @click="apply('routing', o.value)"
          >
            <svg viewBox="0 0 20 20" class="me-sketch-glyph" aria-hidden="true">
              <path
                v-for="(p, i) in o.paths" :key="i" :d="p.d" fill="none"
                stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
              />
            </svg>
          </button>
        </div>
      </section>

      <section
        v-if="sections.has('font')"
        class="me-sketch-style-section"
        :class="{ 'is-mixed': mixedSection('font') }"
        data-section="font"
      >
        <h3 class="me-sketch-style-label">
          {{ m.font }}<span v-if="mixedSection('font')" class="me-sketch-style-mixed"> · {{ m.mixed }}</span>
        </h3>
        <div class="me-sketch-style-row" role="group" :aria-label="m.font">
          <button
            v-for="o in families"
            :key="o.value"
            type="button"
            class="me-tool-btn me-sketch-style-opt"
            :class="{ 'is-active': isActive('fontFamily', o.value) }"
            :data-family="o.value"
            :style="{ fontFamily: o.font }"
            :title="o.label"
            :aria-label="o.label"
            @click="apply('fontFamily', o.value)"
          >
            {{ o.text }}
          </button>
        </div>
        <div v-if="hasFontSize" class="me-sketch-style-row" role="group" :aria-label="m.fontSize">
          <button
            v-for="o in sizes"
            :key="o.value"
            type="button"
            class="me-tool-btn me-sketch-style-opt"
            :class="{ 'is-active': isActive('fontSize', o.value) }"
            :data-size="o.value"
            :title="o.label"
            :aria-label="`${m.fontSize}: ${o.label}`"
            @click="apply('fontSize', o.value)"
          >
            {{ o.text }}
          </button>
        </div>
        <div class="me-sketch-style-row" role="group" :aria-label="m.textAlign">
          <button
            v-for="o in aligns"
            :key="o.value"
            type="button"
            class="me-tool-btn me-sketch-style-opt"
            :class="{ 'is-active': isActive('textAlign', o.value) }"
            :data-align="o.value"
            :title="o.label"
            :aria-label="`${m.textAlign}: ${o.label}`"
            @click="apply('textAlign', o.value)"
          >
            <component :is="o.icon" />
          </button>
        </div>
      </section>

      <section
        v-if="sections.has('opacity')"
        class="me-sketch-style-section"
        :class="{ 'is-mixed': mixedSection('opacity') }"
        data-section="opacity"
      >
        <h3 class="me-sketch-style-label">
          {{ m.opacity }}
          <span class="me-sketch-style-mixed">· {{ opacityPct === null ? m.mixed : `${opacityPct}%` }}</span>
        </h3>
        <input
          type="range"
          class="me-sketch-style-range"
          min="0" max="100" step="10"
          :value="opacityPct ?? 100"
          :aria-label="m.opacity"
          @change="onOpacity"
        >
      </section>

      <section v-if="sections.has('layers')" class="me-sketch-style-section" data-section="layers">
        <h3 class="me-sketch-style-label">
          {{ m.layers }}
        </h3>
        <div class="me-sketch-style-row">
          <button
            type="button" class="me-tool-btn me-sketch-style-opt" data-layer="back"
            :title="m.sendToBack" :aria-label="m.sendToBack"
            @click="emit('layer', 'back')"
          >
            <SendToBack />
          </button>
          <button
            type="button" class="me-tool-btn me-sketch-style-opt" data-layer="front"
            :title="m.bringToFront" :aria-label="m.bringToFront"
            @click="emit('layer', 'front')"
          >
            <BringToFront />
          </button>
        </div>
      </section>

      <section v-if="linkTarget" class="me-sketch-style-section" data-section="link">
        <h3 class="me-sketch-style-label">
          {{ m.link }}
        </h3>
        <input
          v-model="linkDraft"
          type="url"
          class="me-sketch-link-input"
          :class="{ 'is-invalid': linkInvalid }"
          :placeholder="m.linkPlaceholder"
          :aria-label="m.link"
          :aria-invalid="linkInvalid"
          :disabled="linkTarget.locked"
          spellcheck="false"
          autocomplete="off"
          maxlength="2048"
          @focus="startLinkEdit"
          @input="startLinkEdit"
          @keydown.stop="onLinkKey"
          @blur="commitLink()"
        >
        <p v-if="linkInvalid" class="me-sketch-link-hint" role="alert">
          {{ m.linkInvalid }}
        </p>
      </section>

      <section v-if="elements.length" class="me-sketch-style-section" data-section="arrange">
        <h3 class="me-sketch-style-label">
          {{ m.arrange }}
        </h3>
        <div v-if="units >= 2" class="me-sketch-style-row" role="group" :aria-label="m.arrange">
          <button
            v-for="o in alignModes"
            :key="o.value"
            type="button" class="me-tool-btn me-sketch-style-opt"
            :data-align-mode="o.value"
            :title="o.label" :aria-label="o.label"
            @click="emit('align', o.value)"
          >
            <component :is="o.icon" />
          </button>
        </div>
        <div v-if="units >= 3" class="me-sketch-style-row">
          <button
            v-for="o in distributeAxes"
            :key="o.value"
            type="button" class="me-tool-btn me-sketch-style-opt"
            :data-distribute="o.value"
            :title="o.label" :aria-label="o.label"
            @click="emit('distribute', o.value)"
          >
            <component :is="o.icon" />
          </button>
        </div>
        <div class="me-sketch-style-row">
          <button
            v-if="canGroup"
            type="button" class="me-tool-btn me-sketch-style-opt" data-arrange="group"
            :title="m.group" :aria-label="m.group"
            @click="emit('group')"
          >
            <Group />
          </button>
          <button
            v-if="canUngroup"
            type="button" class="me-tool-btn me-sketch-style-opt" data-arrange="ungroup"
            :title="m.ungroup" :aria-label="m.ungroup"
            @click="emit('ungroup')"
          >
            <Ungroup />
          </button>
          <button
            type="button" class="me-tool-btn me-sketch-style-opt" data-arrange="lock"
            :class="{ 'is-active': allLocked }"
            :title="m.lock" :aria-label="m.lock"
            :aria-pressed="allLocked"
            @click="emit('lock')"
          >
            <Lock v-if="allLocked" />
            <LockOpen v-else />
          </button>
        </div>
      </section>
    </div>
  </div>
</template>
