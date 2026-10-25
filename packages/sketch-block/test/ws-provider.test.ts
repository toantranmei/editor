import { afterEach, describe, expect, it, vi } from 'vitest'
import { Awareness } from 'y-protocols/awareness'
import * as Y from 'yjs'
import { BoardStore } from '../src/model/store'
import { DEFAULT_STYLE } from '../src/model/types'
import { indexeddb } from '../src/providers'

const init = (x = 0) => ({
  type: 'rectangle' as const, x, y: 0, w: 100, h: 50, angle: 0, locked: false, ...DEFAULT_STYLE, label: '',
})

type Listener = (...args: any[]) => void

/** Stand-in for y-websocket's WebsocketProvider: records its arguments, tests drive its events. */
class FakeProvider {
  static instances: FakeProvider[] = []
  awareness: Awareness
  params: Record<string, string>
  destroyed = false
  private listeners = new Map<string, Set<Listener>>()
  constructor(public url: string, public room: string, public doc: Y.Doc, public opts: any) {
    this.awareness = new Awareness(doc)
    this.params = opts.params ?? {}
    FakeProvider.instances.push(this)
  }

  on(name: string, fn: Listener) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set())
    this.listeners.get(name)!.add(fn)
  }

  off(name: string, fn: Listener) {
    this.listeners.get(name)?.delete(fn)
  }

  emit(name: string, ...args: unknown[]) {
    for (const fn of [...(this.listeners.get(name) ?? [])]) fn(...args)
  }

  /** Simulates the server sending its state, then the first sync. */
  sync(remote?: Uint8Array) {
    if (remote) Y.applyUpdate(this.doc, remote, this)
    this.emit('status', { status: 'connected' })
    this.emit('sync', true)
  }

  destroy() {
    this.destroyed = true
    this.awareness.destroy()
  }
}

vi.mock('y-websocket', () => ({ WebsocketProvider: FakeProvider }))

const { websocket } = await import('../src/providers/websocket')

const nextProvider = async () => {
  await vi.waitFor(() => expect(FakeProvider.instances.length).toBeGreaterThan(0))
  return FakeProvider.instances.at(-1)!
}

function seed(n: number): Uint8Array {
  const d = new Y.Doc()
  const s = new BoardStore(d)
  for (let i = 0; i < n; i++) s.create(init(i * 10))
  return Y.encodeStateAsUpdate(d)
}

afterEach(() => {
  FakeProvider.instances = []
})

describe('websocket provider', () => {
  it('resolves on sync', async () => {
    let resolved = false
    const params = vi.fn(() => ({ token: 't1' }))
    const WebSocketPolyfill = class {} as unknown as typeof WebSocket
    const pending = websocket({ url: 'ws://sync.test', params, WebSocketPolyfill, offline: false })
      .connect('board-1')
      .then((c) => { resolved = true; return c })
    const p = await nextProvider()
    expect(p.url).toBe('ws://sync.test')
    expect(p.room).toBe('board-1')
    expect(p.opts.params).toEqual({ token: 't1' })
    expect(p.opts.WebSocketPolyfill).toBe(WebSocketPolyfill)
    await Promise.resolve()
    expect(resolved).toBe(false)
    p.sync(seed(2))
    const conn = await pending
    expect(conn.doc).toBe(p.doc)
    expect(conn.existed).toBe(true)
    expect(conn.networked).toBe(true)
    expect(conn.status!.get()).toBe('online')
    conn.destroy()
  })

  it('refreshes params on reconnect', async () => {
    let n = 0
    const pending = websocket({ url: 'ws://x', params: () => ({ token: `t${++n}` }), offline: false }).connect('rp')
    const p = await nextProvider()
    p.sync()
    const conn = await pending
    p.emit('connection-close', null, p)
    expect(p.params).toEqual({ token: 't2' })
    conn.destroy()
  })

  it('empty room reports existed false', async () => {
    const pending = websocket({ url: 'ws://x', offline: false }).connect('empty')
    const p = await nextProvider()
    p.sync()
    const conn = await pending
    expect(conn.existed).toBe(false)
    conn.destroy()
  })

  it('timeout falls back to offline IDB content', async () => {
    const cached = await indexeddb().connect('ws-cached')
    Y.applyUpdate(cached.doc, seed(3))
    await new Promise(r => setTimeout(r, 20))
    cached.destroy()

    const conn = await websocket({ url: 'ws://down', connectTimeoutMs: 30 }).connect('ws-cached')
    expect(conn.existed).toBe(true)
    expect(conn.doc.getMap('elements').size).toBe(3)
    expect(conn.status!.get()).toBe('offline')
    expect(conn.offline).toBe(true)
    const p = FakeProvider.instances.at(-1)!
    expect(p.destroyed).toBe(false) // keeps reconnecting in the background
    // a later sync turns it online
    p.sync()
    expect(conn.status!.get()).toBe('online')
    conn.destroy()

    // without offline: an empty doc
    const bare = await websocket({ url: 'ws://down', connectTimeoutMs: 30, offline: false }).connect('ws-cached')
    expect(bare.existed).toBe(false)
    expect(bare.offline).toBe(false)
    expect(bare.doc.getMap('elements').size).toBe(0)
    bare.destroy()
  })

  it('status online/offline', async () => {
    const pending = websocket({ url: 'ws://x', offline: false }).connect('st')
    const p = await nextProvider()
    p.emit('status', { status: 'connecting' })
    p.sync()
    const conn = await pending
    const seen: string[] = []
    const off = conn.status!.on(s => seen.push(s))
    // y-websocket's real order on a drop: synced=false first, then the disconnected status
    p.emit('sync', false)
    p.emit('status', { status: 'disconnected' })
    expect(conn.status!.get()).toBe('offline')
    p.emit('status', { status: 'connecting' }) // retry attempts don't flicker the dot
    expect(conn.status!.get()).toBe('offline')
    p.emit('status', { status: 'connected' })
    expect(conn.status!.get()).toBe('connecting')
    p.emit('sync', true)
    expect(conn.status!.get()).toBe('online')
    expect(seen).toEqual(['connecting', 'offline', 'connecting', 'online'])
    p.emit('closed', { code: 4401, reason: 'unauthorized' }, p) // terminal: no more retries
    expect(conn.status!.get()).toBe('error')
    off()
    conn.destroy()
  })

  it('a refusal before the first sync resolves at once with status error', async () => {
    const cached = await indexeddb().connect('ws-refused')
    Y.applyUpdate(cached.doc, seed(2))
    await new Promise(r => setTimeout(r, 20))
    cached.destroy()

    const started = Date.now()
    const pending = websocket({ url: 'ws://x', connectTimeoutMs: 60_000 }).connect('ws-refused')
    const p = await nextProvider()
    p.emit('closed', { code: 4401, reason: 'unauthorized' }, p)
    const conn = await pending
    expect(Date.now() - started).toBeLessThan(5000)
    expect(conn.status!.get()).toBe('error')
    expect(conn.doc.getMap('elements').size).toBe(2) // offline IDB content
    conn.destroy()

    FakeProvider.instances = []
    const bare = websocket({ url: 'ws://x', connectTimeoutMs: 60_000, offline: false }).connect('ws-refused')
    const p2 = await nextProvider()
    p2.emit('closed', { code: 4401, reason: 'unauthorized' }, p2)
    const c2 = await bare
    expect(c2.status!.get()).toBe('error')
    expect(c2.doc.getMap('elements').size).toBe(0)
    c2.destroy()
  })

  it('the connect timeout does not overwrite error', async () => {
    const pending = websocket({ url: 'ws://x', connectTimeoutMs: 300, offline: false }).connect('ws-err-timeout')
    const p = await nextProvider()
    const seen: string[] = []
    p.emit('closed', { code: 4401, reason: 'unauthorized' }, p)
    const conn = await pending
    conn.status!.on(s => seen.push(s))
    await new Promise(r => setTimeout(r, 400)) // past the connect timeout
    expect(conn.status!.get()).toBe('error')
    expect(seen).toEqual([])
    conn.destroy()
  })

  it('awareness exposed', async () => {
    const pending = websocket({ url: 'ws://x', offline: false }).connect('aw')
    const p = await nextProvider()
    p.sync()
    const conn = await pending
    expect(conn.awareness).toBe(p.awareness)
    conn.destroy()
  })

  it('remote updates do not use the local origin', async () => {
    const { LOCAL_ORIGIN } = await import('../src/model/store')
    const pending = websocket({ url: 'ws://x', offline: false }).connect('origin')
    const p = await nextProvider()
    const origins: unknown[] = []
    p.doc.on('update', (_u: Uint8Array, origin: unknown) => origins.push(origin))
    p.sync(seed(1))
    const conn = await pending
    expect(origins).toHaveLength(1)
    expect(origins[0]).not.toBe(LOCAL_ORIGIN)
    conn.destroy()
  })

  it('destroy cleans up', async () => {
    const pending = websocket({ url: 'ws://x' }).connect('ws-destroy')
    const p = await nextProvider()
    p.sync()
    const conn = await pending
    const docDestroyed = vi.fn()
    conn.doc.on('destroy', docDestroyed)
    expect(() => conn.destroy()).not.toThrow()
    expect(p.destroyed).toBe(true)
    expect(docDestroyed).toHaveBeenCalled()
    expect(() => conn.destroy()).not.toThrow()
  })
})

describe('websocket provider without y-websocket', () => {
  afterEach(() => {
    vi.doUnmock('y-websocket')
    vi.resetModules()
  })

  it('missing y-websocket rejects with a clear error', async () => {
    vi.resetModules()
    vi.doMock('y-websocket', () => {
      throw new Error('Cannot find package \'y-websocket\'')
    })
    const mod = await import('../src/providers/websocket')
    await expect(mod.websocket({ url: 'ws://x' }).connect('b')).rejects.toThrow(
      'websocket() needs the optional peer dependency "y-websocket"',
    )
  })
})
