import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import type { DbContext } from './context'
import { RowStore } from './row-store'

/**
 * A `RowStore` for the current view: rebuilt when the view, its filter / sort / grouping or the search change,
 * refreshed (visible windows only) when the source's `version` changes.
 */
export function useRowStore(db: DbContext, opts: { grouped?: () => boolean } = {}) {
  const grouped = computed(() => (opts.grouped ? opts.grouped() : !!db.view.value?.config.group_by?.prop))
  const key = computed(() => {
    const v = db.view.value
    if (!v) return ''
    const c = v.config
    return JSON.stringify([v.id, c.filter, c.sorts, grouped.value ? c.group_by : null, db.query.value.search ?? ''])
  })
  const store = shallowRef<RowStore | null>(null)

  watch(key, () => {
    store.value?.destroy()
    const v = db.view.value
    if (!v) {
      store.value = null
      return
    }
    const g = grouped.value ? v.config.group_by : null
    store.value = new RowStore({
      source: db.source,
      viewId: v.id,
      query: db.query.value,
      grouping: g ? { hideEmpty: g.hide_empty, order: g.order } : null,
      pageSize: db.options.pageSize ?? 50,
      onError: db.report,
    })
  }, { immediate: true })

  watch(() => db.source.version.value, () => store.value?.refresh())
  onBeforeUnmount(() => store.value?.destroy())
  return store
}
