import type { ConnectionStatus, ConnectionStatusValue } from './types'

/** A tiny observable status value; `set` notifies only on change. */
export function createStatus(initial: ConnectionStatusValue): ConnectionStatus & {
  set(next: ConnectionStatusValue): void
  clear(): void
} {
  let value = initial
  const listeners = new Set<(s: ConnectionStatusValue) => void>()
  return {
    get: () => value,
    on(cb) {
      listeners.add(cb)
      return () => { listeners.delete(cb) }
    },
    set(next) {
      if (next === value) return
      value = next
      for (const cb of [...listeners]) {
        try {
          cb(next)
        } catch (err) {
          console.error(err)
        }
      }
    },
    clear() { listeners.clear() },
  }
}
