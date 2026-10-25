import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { BoardStore } from '../src/model/store'
import { DEFAULT_STYLE } from '../src/model/types'
import { http, indexeddb } from '../src/providers'

const init = (x = 0) => ({
  type: 'rectangle' as const, x, y: 0, w: 100, h: 50, angle: 0, locked: false, ...DEFAULT_STYLE, label: '',
})

/** In-memory server: one merged Yjs state per board; `fail` makes the next N saves reject. */
function fakeServer() {
  const boards = new Map<string, Uint8Array>()
  const saves: { id: string, update: Uint8Array }[] = []
  let fail = 0
  return {
    boards,
    saves,
    failNext(n: number) { fail = n },
    load: vi.fn(async (id: string) => boards.get(id) ?? null),
    save: vi.fn(async (id: string, update: Uint8Array) => {
      if (fail > 0) {
        fail--
        throw new Error('network down')
      }
      saves.push({ id, update })
      const cur = boards.get(id)
      boards.set(id, cur ? Y.mergeUpdates([cur, update]) : update)
    }),
    /** The server's board as a doc. */
    doc(id: string) {
      const d = new Y.Doc()
      const s = boards.get(id)
      if (s) Y.applyUpdate(d, s)
      return d
    },
  }
}

/** Server state containing `n` rectangles. */
function seed(n: number): Uint8Array {
  const d = new Y.Doc()
  const s = new BoardStore(d)
  for (let i = 0; i < n; i++) s.create(init(i * 10))
  return Y.encodeStateAsUpdate(d)
}

const flushMicrotasks = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

afterEach(() => {
  vi.useRealTimers()
})

describe('http provider', () => {
  it('loads server state', async () => {
    const server = fakeServer()
    server.boards.set('b1', seed(2))
    const conn = await http({ load: server.load, save: server.save, offline: false }).connect('b1')
    expect(server.load).toHaveBeenCalledWith('b1')
    expect(conn.existed).toBe(true)
    expect(conn.networked).toBe(true)
    expect(conn.doc.getMap('elements').size).toBe(2)
    conn.destroy()

    const empty = await http({ load: server.load, save: server.save, offline: false }).connect('none')
    expect(empty.existed).toBe(false)
    empty.destroy()

    // ArrayBuffer payloads work too
    const ab = seed(1)
    const conn2 = await http({
      load: async () => ab.buffer.slice(ab.byteOffset, ab.byteOffset + ab.byteLength) as ArrayBuffer,
      save: server.save,
      offline: false,
    }).connect('ab')
    expect(conn2.doc.getMap('elements').size).toBe(1)
    conn2.destroy()
  })

  it('debounces and merges local updates into one save', async () => {
    vi.useFakeTimers()
    const server = fakeServer()
    const conn = await http({ load: server.load, save: server.save, offline: false, debounceMs: 500 }).connect('b2')
    const store = new BoardStore(conn.doc)
    store.create(init(0))
    await vi.advanceTimersByTimeAsync(200)
    store.create(init(10))
    await vi.advanceTimersByTimeAsync(200)
    store.create(init(20))
    expect(server.save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(499)
    expect(server.save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(server.save).toHaveBeenCalledTimes(1)
    expect(server.doc('b2').getMap('elements').size).toBe(3)
    conn.destroy()
  })

  it('save failure retries with backoff and keeps data', async () => {
    vi.useFakeTimers()
    const server = fakeServer()
    const conn = await http({ load: server.load, save: server.save, offline: false, debounceMs: 100 }).connect('b3')
    const store = new BoardStore(conn.doc)
    server.failNext(3)
    store.create(init(0))
    await vi.advanceTimersByTimeAsync(100) // attempt 1 fails
    expect(server.save).toHaveBeenCalledTimes(1)
    store.create(init(10)) // edits during backoff join the pending merge
    await vi.advanceTimersByTimeAsync(999)
    expect(server.save).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1) // +1 s: attempt 2 fails
    expect(server.save).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1999)
    expect(server.save).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1) // +2 s: attempt 3 fails
    expect(server.save).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(4000) // +4 s: attempt 4 succeeds
    expect(server.save).toHaveBeenCalledTimes(4)
    expect(server.doc('b3').getMap('elements').size).toBe(2)
    conn.destroy()
  })

  it('backoff caps at 30 s', async () => {
    vi.useFakeTimers()
    const server = fakeServer()
    const conn = await http({ load: server.load, save: server.save, offline: false, debounceMs: 0 }).connect('cap')
    server.failNext(100)
    new BoardStore(conn.doc).create(init())
    await vi.advanceTimersByTimeAsync(0)
    // 1+2+4+8+16 s → attempts 2..6, then every 30 s
    await vi.advanceTimersByTimeAsync(31_000)
    expect(server.save).toHaveBeenCalledTimes(6)
    await vi.advanceTimersByTimeAsync(29_999)
    expect(server.save).toHaveBeenCalledTimes(6)
    await vi.advanceTimersByTimeAsync(1)
    expect(server.save).toHaveBeenCalledTimes(7)
    conn.destroy()
  })

  it('remote-load updates are not saved back', async () => {
    vi.useFakeTimers()
    const server = fakeServer()
    server.boards.set('b4', seed(3))
    const conn = await http({ load: server.load, save: server.save, offline: false, debounceMs: 100 }).connect('b4')
    await vi.advanceTimersByTimeAsync(5000)
    expect(server.save).not.toHaveBeenCalled()
    // a local edit sends only the local change, not the loaded state
    new BoardStore(conn.doc).create(init(99))
    await vi.advanceTimersByTimeAsync(100)
    expect(server.save).toHaveBeenCalledTimes(1)
    const sent = new Y.Doc()
    Y.applyUpdate(sent, server.saves[0]!.update)
    expect(sent.getMap('elements').size).toBe(1)
    conn.destroy()
  })

  it('offline cache pushes IDB-only diff after load', async () => {
    const server = fakeServer()
    server.boards.set('b5', seed(1))
    // the cache already holds the server state plus one edit the server never got
    const cached = await indexeddb().connect('b5')
    Y.applyUpdate(cached.doc, server.boards.get('b5')!)
    new BoardStore(cached.doc).create(init(50))
    await flushMicrotasks()
    cached.destroy()

    const conn = await http({ load: server.load, save: server.save, debounceMs: 10 }).connect('b5')
    expect(conn.doc.getMap('elements').size).toBe(2)
    await vi.waitFor(() => expect(server.save).toHaveBeenCalledTimes(1))
    const sent = new Y.Doc()
    Y.applyUpdate(sent, server.saves[0]!.update)
    expect(sent.getMap('elements').size).toBe(1) // only the IDB-only element
    expect(server.doc('b5').getMap('elements').size).toBe(2)
    conn.destroy()
  })

  it('offline cache: nothing is pushed when the cache matches the server', async () => {
    const server = fakeServer()
    server.boards.set('b6', seed(2))
    const a = await http({ load: server.load, save: server.save, debounceMs: 10 }).connect('b6')
    const store = new BoardStore(a.doc)
    store.remove([[...a.doc.getMap('elements').keys()][0]!]) // deletions the server has must not count as unsynced
    await vi.waitFor(() => expect(server.save).toHaveBeenCalledTimes(1))
    a.destroy()
    await new Promise(r => setTimeout(r, 50))
    const b = await http({ load: server.load, save: server.save, debounceMs: 10 }).connect('b6')
    await new Promise(r => setTimeout(r, 50))
    expect(server.save).toHaveBeenCalledTimes(1)
    expect(b.doc.getMap('elements').size).toBe(1)
    b.destroy()
  })

  it('destroy flushes pending save and never throws', async () => {
    vi.useFakeTimers()
    const server = fakeServer()
    const conn = await http({ load: server.load, save: server.save, offline: false, debounceMs: 1000 }).connect('b7')
    new BoardStore(conn.doc).create(init())
    expect(() => conn.destroy()).not.toThrow()
    await flushMicrotasks()
    expect(server.save).toHaveBeenCalledTimes(1)
    expect(server.doc('b7').getMap('elements').size).toBe(1)
    expect(() => conn.destroy()).not.toThrow() // idempotent

    // rejecting and synchronously throwing saves are swallowed
    const conn2 = await http({ load: async () => null, save: () => Promise.reject(new Error('x')), offline: false }).connect('b8')
    new BoardStore(conn2.doc).create(init())
    expect(() => conn2.destroy()).not.toThrow()
    const conn3 = await http({ load: async () => null, save: () => { throw new Error('sync') }, offline: false }).connect('b9')
    new BoardStore(conn3.doc).create(init())
    expect(() => conn3.destroy()).not.toThrow()
    await flushMicrotasks()
    // no retry timers survive destroy
    expect(vi.getTimerCount()).toBe(0)
  })

  it('status transitions saving→saved and error', async () => {
    vi.useFakeTimers()
    const server = fakeServer()
    const conn = await http({ load: server.load, save: server.save, offline: false, debounceMs: 100 }).connect('b10')
    const status = conn.status!
    expect(status.get()).toBe('saved')
    const seen: string[] = []
    const off = status.on(s => seen.push(s))
    const store = new BoardStore(conn.doc)
    store.create(init())
    expect(status.get()).toBe('saving')
    await vi.advanceTimersByTimeAsync(100)
    expect(status.get()).toBe('saved')
    server.failNext(1)
    store.create(init(10))
    await vi.advanceTimersByTimeAsync(100)
    expect(status.get()).toBe('error')
    await vi.advanceTimersByTimeAsync(1000)
    expect(status.get()).toBe('saved')
    expect(seen).toEqual(['saving', 'saved', 'saving', 'error', 'saving', 'saved'])
    off()
    store.create(init(20))
    expect(seen).toHaveLength(6)
    conn.destroy()
  })

  it('load failure without offline cache rejects; with cache it opens offline', async () => {
    const failing = { load: async () => { throw new Error('down') }, save: async () => {} }
    await expect(http({ ...failing, offline: false }).connect('lf')).rejects.toThrow('down')
    const conn = await http(failing).connect('lf2')
    expect(conn.status!.get()).toBe('offline')
    conn.destroy()
  })

  it('passes savePreview and uploadImage through', () => {
    const savePreview = async () => 'p'
    const uploadImage = async () => 'u'
    const p = http({ load: async () => null, save: async () => {}, savePreview, uploadImage })
    expect(p.savePreview).toBe(savePreview)
    expect(p.uploadImage).toBe(uploadImage)
  })
})
