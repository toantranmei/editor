import * as Y from 'yjs'

export const RELAY_ORIGIN = 'relay'

/**
 * Two Y.Docs wired together like two peers behind a server. Every update a doc emits (except the ones the relay
 * applied itself) is forwarded to the other doc with origin `'relay'`. In `auto` mode forwarding is immediate; in
 * `manual` mode updates queue per direction until flushed (latency, offline, interleavings).
 */
export interface Relay {
  readonly a: Y.Doc
  readonly b: Y.Doc
  /** Switches mode; going back to `auto` delivers everything queued. */
  setMode(mode: 'auto' | 'manual'): void
  /** Delivers queued updates (both directions, or one: `'ab'` = a's updates to b). */
  flush(dir?: 'ab' | 'ba'): void
  /** Queued update counts per direction. */
  pending(): { ab: number; ba: number }
  destroy(): void
}

export function createRelay(opts: { mode?: 'auto' | 'manual'; a?: Y.Doc; b?: Y.Doc } = {}): Relay {
  const a = opts.a ?? new Y.Doc()
  const b = opts.b ?? new Y.Doc()
  let mode = opts.mode ?? 'auto'
  const queues = { ab: [] as Uint8Array[], ba: [] as Uint8Array[] }

  const deliver = (dir: 'ab' | 'ba') => {
    const target = dir === 'ab' ? b : a
    // an update applied here may make the target emit more (e.g. a repair write): it queues / forwards on its own
    while (queues[dir].length) Y.applyUpdate(target, queues[dir].shift()!, RELAY_ORIGIN)
  }
  const forward = (dir: 'ab' | 'ba') => (update: Uint8Array, origin: unknown) => {
    if (origin === RELAY_ORIGIN) return
    queues[dir].push(update)
    if (mode === 'auto') deliver(dir)
  }
  const onA = forward('ab')
  const onB = forward('ba')
  a.on('update', onA)
  b.on('update', onB)

  const flush = (dir?: 'ab' | 'ba') => {
    if (dir) return deliver(dir)
    // until both are quiet (a delivery can trigger writes the other way)
    while (queues.ab.length || queues.ba.length) {
      deliver('ab')
      deliver('ba')
    }
  }

  return {
    a,
    b,
    setMode(next) {
      mode = next
      if (mode === 'auto') flush()
    },
    flush,
    pending: () => ({ ab: queues.ab.length, ba: queues.ba.length }),
    destroy() {
      a.off('update', onA)
      b.off('update', onB)
    },
  }
}
