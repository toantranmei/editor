/**
 * Card previews (board / gallery "Card preview"): a `files` property's first image, or the row page's cover /
 * content read with the optional `source.rowPreview`, batched for the cards being rendered and re-read when the
 * source's `version` changes (the old previews stay on screen until then).
 */
import { computed, shallowReactive, shallowRef, watch } from 'vue'
import type { DbContext } from './context'
import type { CardPreview, Prop, Row, RowPreview } from './types'
import { cellValue, coverImage } from './util'

export const PAGE_COVER = 'page_cover'
export const PAGE_CONTENT = 'page_content'

/** What a card shows above its title. */
export type CardCover = { kind: 'image', url: string } | { kind: 'text', text: string } | { kind: 'empty' }

/** Most ids per `rowPreview` call. */
const BATCH = 100

export function useCardPreview(db: DbContext, preview: () => CardPreview | undefined) {
  /** The `files` property used as preview (a property id wins over the page_* names). */
  const fileProp = computed<Prop | undefined>(() => {
    const id = preview()
    return id ? db.props.value.find(p => p.id === id && p.type === 'files') : undefined
  })
  const mode = computed<'files' | 'page_cover' | 'page_content' | null>(() => {
    const id = preview()
    if (!id) return null
    if (fileProp.value) return 'files'
    if (id === PAGE_COVER) return 'page_cover'
    if (id === PAGE_CONTENT) return 'page_content'
    return null
  })
  const cache = shallowReactive(new Map<string, RowPreview | null>())
  /** Bumped when the data changes: rows rendered again ask again. */
  const generation = shallowRef(0)
  let asked = new Set<string>()
  let queue = new Set<string>()
  let scheduled = false

  async function flush() {
    scheduled = false
    const ids = [...queue]
    queue = new Set()
    const read = db.source.rowPreview
    if (!read || !ids.length) return
    for (let i = 0; i < ids.length; i += BATCH) {
      const chunk = ids.slice(i, i + BATCH)
      try {
        const out = await read(chunk)
        for (const id of chunk) cache.set(id, out[id] ?? null)
      }
      catch (error) {
        db.report(error)
      }
    }
  }
  watch(() => db.source.version.value, () => {
    asked = new Set()
    generation.value++
  })
  watch(mode, () => {
    asked = new Set()
    cache.clear()
  })

  /** Preview of a page (`page_cover` / `page_content`), asked for the first time it is rendered. */
  function pageOf(id: string): RowPreview | undefined {
    void generation.value
    if (!db.source.rowPreview) return undefined
    if (!asked.has(id)) {
      asked.add(id)
      queue.add(id)
      if (!scheduled) {
        scheduled = true
        queueMicrotask(() => void flush())
      }
    }
    return cache.get(id) ?? undefined
  }

  /** The card's preview, `null` when the view has none. */
  function coverOf(row: Row): CardCover | null {
    switch (mode.value) {
      case 'files': {
        const url = coverImage(cellValue(row, fileProp.value!))
        return url ? { kind: 'image', url } : { kind: 'empty' }
      }
      case 'page_cover': {
        const url = pageOf(row.id)?.cover
        return url ? { kind: 'image', url } : { kind: 'empty' }
      }
      case 'page_content': {
        const p = pageOf(row.id)
        if (p?.image) return { kind: 'image', url: p.image }
        if (p?.text?.trim()) return { kind: 'text', text: p.text.trim() }
        return { kind: 'empty' }
      }
      default:
        return null
    }
  }
  return { mode, fileProp, coverOf }
}
