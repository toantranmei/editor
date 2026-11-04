import type { DraftStore, FilterGroup, Sort, ViewDraft } from './types'

/** localStorage key of a viewer's draft of a view: `mei-db-draft:<user>:<database>:<view>`. */
export const draftKey = (databaseId: string, viewId: string, userId?: string | null) => `mei-db-draft:${userId || 'anon'}:${databaseId}:${viewId}`

/** A stored draft as `ViewDraft`, or null when it isn't one (old format, hand-edited storage). */
export function parseDraft(value: unknown): ViewDraft | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  const out: ViewDraft = {}
  if ('filter' in v) {
    const f = v.filter
    if (f === null) out.filter = null
    else if (f && typeof f === 'object' && (Array.isArray((f as { and?: unknown }).and) || Array.isArray((f as { or?: unknown }).or))) out.filter = f as FilterGroup
  }
  if (Array.isArray(v.sorts)) out.sorts = (v.sorts as Sort[]).filter(s => s && typeof s.prop === 'string' && (s.dir === 'asc' || s.dir === 'desc'))
  return 'filter' in out || out.sorts ? out : null
}

/**
 * The default `draftStore`: each viewer's unsaved filter / sorts in `localStorage` (per user, database and view),
 * so they survive reloads. Storage errors (private mode, quota, no `window`) are ignored: drafts stay in memory.
 */
export function localDraftStore(userId?: string | null): DraftStore {
  const storage = (): Storage | null => {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage
    }
    catch {
      return null
    }
  }
  return {
    get(viewId, databaseId = '') {
      try {
        const raw = storage()?.getItem(draftKey(databaseId, viewId, userId))
        return raw ? parseDraft(JSON.parse(raw)) : null
      }
      catch {
        return null
      }
    },
    set(viewId, draft, databaseId = '') {
      try {
        const s = storage()
        if (!s) return
        const key = draftKey(databaseId, viewId, userId)
        if (draft) s.setItem(key, JSON.stringify(draft))
        else s.removeItem(key)
      }
      catch {
        // Quota / disabled storage: the draft only lives in this session.
      }
    },
  }
}
