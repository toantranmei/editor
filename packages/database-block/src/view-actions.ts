/** View actions shared by the tab menu and the title "⋯" menu. */
import type { DbContext } from './context'
import { fmt } from './messages'
import type { View, ViewType } from './types'
import { byPosition, clone, positionAfter, uuidv7 } from './util'

/** The "Add a new view" grid, in Notion's order (Pivot, ours, last). */
export const VIEW_TYPES: ViewType[] = ['table', 'board', 'gallery', 'list', 'chart', 'dashboard', 'timeline', 'feed', 'calendar', 'form', 'pivot']

const last = (db: DbContext) => [...db.source.views.value].sort(byPosition).pop()

/** Adds a copy of `v` after the last tab; returns it. */
export function duplicateView(db: DbContext, v: View): View {
  const copy: View = { ...clone(v), id: uuidv7(), name: fmt(db.m.value.copyOf, { name: v.name }), position: positionAfter(last(db)?.position) }
  db.source.upsertView(copy)
  return copy
}

/** Copies the view's link (`options.viewUrl`) to the clipboard. */
export async function copyViewLink(db: DbContext, v: View) {
  const url = db.options.viewUrl?.(db.databaseId, v.id)
  if (!url) return
  try {
    await navigator.clipboard.writeText(url)
  }
  catch (error) {
    db.report(error)
  }
}
