import type { DatabaseSource } from './types'

type Factory = (databaseId: string) => DatabaseSource | Promise<DatabaseSource>

/** One source per (factory, database id): several blocks showing the same database share it. */
const cache = new WeakMap<Factory, Map<string, Promise<DatabaseSource>>>()

export function resolveSource(factory: Factory, databaseId: string): Promise<DatabaseSource> {
  let byId = cache.get(factory)
  if (!byId) cache.set(factory, (byId = new Map()))
  let p = byId.get(databaseId)
  if (!p) {
    p = Promise.resolve().then(() => factory(databaseId))
    // A failed lookup isn't cached, so the next mount retries.
    p.catch(() => byId!.delete(databaseId))
    byId.set(databaseId, p)
  }
  return p
}
