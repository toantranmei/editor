import type { SketchElement } from '../model/types'

/** The element's outermost group (the last of its `groupIds`), or null when it is in none. */
export function outermostGroup(el: Pick<SketchElement, 'groupIds'>): string | null {
  const g = el.groupIds
  return g.length ? g[g.length - 1]! : null
}

/**
 * `ids` plus every member of each one's outermost group (what a click, marquee or lasso selects: groups are picked
 * whole). `elements` is the scene's elements; `get` looks one up by id.
 */
export function expandToGroups(
  elements: readonly SketchElement[], get: (id: string) => SketchElement | undefined, ids: Iterable<string>,
): Set<string> {
  const out = new Set<string>()
  const groups = new Set<string>()
  for (const id of ids) {
    out.add(id)
    const el = get(id)
    const g = el ? outermostGroup(el) : null
    if (g) groups.add(g)
  }
  if (!groups.size) return out
  for (const el of elements) {
    if (el.groupIds.some(g => groups.has(g))) out.add(el.id)
  }
  return out
}
