/** Databases just created from the slash menu: their view focuses the title once, like Notion. */
const pending = new Set<string>()

export function markNewDatabase(databaseId: string) {
  pending.add(databaseId)
}

/** True (once) when `databaseId` was just created here. */
export function takeNewDatabase(databaseId: string) {
  return pending.delete(databaseId)
}
