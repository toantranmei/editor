/**
 * Sub-items of list and board views (`config.sub_items`: a relation to this database pointing at the parent row).
 * The view's rows are the parents (the context's query keeps rows without a parent) unless the display is `flat`;
 * the sub-items come from one index read (every row that has a parent, in the view's sort order), kept in sync
 * with the source's `version`. The view's filter applies to the parents only, like the table's sub-items.
 */
import { computed, shallowRef, watch } from 'vue'
import { type DbContext, subItemsOf } from './context'
import type { Row } from './types'

/** Rows read for the index, at most (the index stops there). */
const INDEX_LIMIT = 2000
const PAGE = 500

export function useSubItems(db: DbContext) {
  const setting = computed(() => subItemsOf(db.view.value, db.props.value))
  const prop = computed(() => setting.value?.prop)
  const nested = computed(() => !!setting.value?.nested)
  /** Parent id → its sub-items. */
  const index = shallowRef(new Map<string, Row[]>())
  let generation = 0

  async function load() {
    const p = prop.value
    const v = db.view.value
    const gen = ++generation
    if (!p || !v || !nested.value) {
      index.value = new Map()
      return
    }
    try {
      const rows: Row[] = []
      for (let offset = 0; offset < INDEX_LIMIT; offset += PAGE) {
        const page = await db.source.rows(v.id, { offset, limit: PAGE }, { filter: { and: [{ prop: p.id, op: 'is_not_empty' }] }, sorts: v.config.sorts ?? [] })
        rows.push(...page.rows)
        if (gen !== generation) return
        if (offset + PAGE >= page.total) break
      }
      const map = new Map<string, Row[]>()
      for (const r of rows) {
        const parent = parentOf(r)
        if (!parent) continue
        let list = map.get(parent)
        if (!list) map.set(parent, (list = []))
        list.push(r)
      }
      index.value = map
    }
    catch (error) {
      if (gen === generation) db.report(error)
    }
  }
  watch(() => [prop.value?.id, nested.value, db.view.value?.id, JSON.stringify(db.view.value?.config.sorts ?? [])], load, { immediate: true })
  watch(() => db.source.version.value, () => void load())

  /** The parent row id of a row (first id of the parent relation), or null. */
  function parentOf(row: Row): string | null {
    const p = prop.value
    const v = p ? row.values[p.id] : undefined
    return Array.isArray(v) && v.length ? String(v[0]) : null
  }
  /** Title of a row's parent (flat display), when known. */
  function parentTitle(row: Row): string | null {
    const id = parentOf(row)
    if (!id) return null
    void db.valueCtx.value
    return db.names.rows.get(id) ?? null
  }
  const childrenOf = (id: string): Row[] => index.value.get(id) ?? []

  return { prop, nested, index, childrenOf, parentOf, parentTitle, reload: load }
}
