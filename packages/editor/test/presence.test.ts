import { TextSelection } from '@tiptap/pm/state'
import { Editor } from '@tiptap/vue-3'
import { absolutePositionToRelativePosition, ySyncPluginKey } from '@tiptap/y-tiptap'
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { defaultBlocks } from '../src/blocks'
import { text } from '../src/blocks/basic'
import { collaborationExtensions, labelBackground, refreshPresence, PRESENCE_COLORS, presenceColor, scrollToPeer, type PresenceUser } from '../src/collaboration'
import { createExtensions } from '../src/extensions'

const editors: Editor[] = []
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy()
  document.body.innerHTML = ''
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

describe('presence colours', () => {
  it('presenceColor wraps at 12 and folds negatives', () => {
    expect(PRESENCE_COLORS).toHaveLength(12)
    expect(presenceColor(0)).toBe(PRESENCE_COLORS[0])
    expect(presenceColor(12)).toBe(PRESENCE_COLORS[0])
    expect(presenceColor(13)).toBe(PRESENCE_COLORS[1])
    expect(presenceColor(-1)).toBe(PRESENCE_COLORS[11])
    expect(presenceColor(Number.NaN)).toBe(PRESENCE_COLORS[0])
  })

  it('every label background reaches 4.5:1 with white text; non-hex colours pass through', () => {
    for (const color of PRESENCE_COLORS) expect(contrast('#ffffff', labelBackground(color)), color).toBeGreaterThanOrEqual(4.5)
    expect(labelBackground('rgb(1, 2, 3)')).toBe('rgb(1, 2, 3)')
  })

  it('every caret colour reaches 3:1 on white and on the dark editor background', () => {
    for (const color of PRESENCE_COLORS) {
      expect(contrast('#ffffff', color), color).toBeGreaterThanOrEqual(3)
      expect(contrast('#191919', color), color).toBeGreaterThanOrEqual(3)
    }
  })
})

/** Two collaborating editors (local = "me" with presence, peer = "them"), awareness forwarded both ways. */
function setup(resolve: (id: number) => PresenceUser | null = () => ({ name: 'Peer', color: presenceColor(1) })) {
  const docA = new Y.Doc()
  const docB = new Y.Doc()
  docA.on('update', (u: Uint8Array, o: unknown) => o !== 'remote' && Y.applyUpdate(docB, u, 'remote'))
  docB.on('update', (u: Uint8Array, o: unknown) => o !== 'remote' && Y.applyUpdate(docA, u, 'remote'))
  const awA = new Awareness(docA)
  const awB = new Awareness(docB)
  const forward = (from: Awareness, to: Awareness) => from.on('update', ({ added, updated, removed }: { added: number[], updated: number[], removed: number[] }) => {
    applyAwarenessUpdate(to, encodeAwarenessUpdate(from, [...added, ...updated, ...removed]), 'remote')
  })
  forward(awA, awB)
  forward(awB, awA)
  const mk = (doc: Y.Doc, aw: Awareness, resolveUser: (id: number) => PresenceUser | null) => {
    const element = document.createElement('div')
    document.body.append(element)
    const editor = new Editor({
      element,
      extensions: [
        ...createExtensions({ blocks: [text, ...defaultBlocks], undoRedo: false }),
        ...collaborationExtensions({ document: doc, presence: { awareness: aw, resolveUser } }),
      ],
    })
    editors.push(editor)
    return editor
  }
  const me = mk(docA, awA, resolve)
  me.commands.setContent('<p>hello world</p><p>second</p>')
  const peer = mk(docB, awB, () => null)
  return { me, peer, awMe: awA, awPeer: awB, docPeer: docB }
}

const select = (editor: Editor, from: number, to = from) => {
  editor.view.focus()
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, to)))
}
const cursorOf = (aw: Awareness) => (aw.getLocalState() as { cursor?: unknown } | null)?.cursor ?? null

describe('local cursor publishing', () => {
  it('publishes the cursor once focused', async () => {
    const { peer, awPeer } = setup()
    select(peer, 3)
    await vi.waitFor(() => expect(cursorOf(awPeer)).not.toBeNull())
  })

  it('a read-only editor publishes no cursor, and clears an existing one', () => {
    vi.useFakeTimers()
    const { peer, awPeer } = setup()
    select(peer, 3)
    vi.advanceTimersByTime(100)
    expect(cursorOf(awPeer)).not.toBeNull()
    peer.setEditable(false)
    peer.view.dispatch(peer.state.tr)
    vi.advanceTimersByTime(100)
    expect(cursorOf(awPeer)).toBeNull()
    select(peer, 5)
    vi.advanceTimersByTime(200)
    expect(cursorOf(awPeer)).toBeNull()
  })

  it('does not clear the caret on blur', () => {
    vi.useFakeTimers()
    const { peer, awPeer } = setup()
    select(peer, 3)
    vi.advanceTimersByTime(100)
    expect(cursorOf(awPeer)).not.toBeNull()
    const before = document.activeElement
    peer.view.dom.blur()
    peer.view.dom.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    expect(document.activeElement).not.toBe(before)
    expect(peer.view.hasFocus()).toBe(false)
    peer.view.dispatch(peer.state.tr)
    vi.advanceTimersByTime(200)
    expect(cursorOf(awPeer)).not.toBeNull()
  })

  it('throttles to 50 ms (leading + trailing) and the final position wins', () => {
    vi.useFakeTimers()
    const { peer, awPeer } = setup()
    const sets = vi.spyOn(awPeer, 'setLocalStateField')
    select(peer, 2)
    select(peer, 3)
    select(peer, 4)
    select(peer, 5)
    const cursorCalls = () => sets.mock.calls.filter(c => c[0] === 'cursor')
    expect(cursorCalls().length).toBeLessThanOrEqual(1)
    vi.advanceTimersByTime(60)
    expect(cursorCalls().length).toBeLessThanOrEqual(2)
    const expected = (() => {
      const state = ySyncPluginKey.getState(peer.state)!
      return absolutePositionToRelativePosition(5, state.type, state.binding.mapping)
    })()
    const last = cursorCalls().at(-1)![1] as { head: unknown }
    expect(Y.compareRelativePositions(Y.createRelativePositionFromJSON(last.head), expected)).toBe(true)
  })

  it('a pending null is not overtaken by a stale "already null": blur-free read-only toggle ends null', () => {
    vi.useFakeTimers()
    const { peer, awPeer } = setup()
    select(peer, 3)
    vi.advanceTimersByTime(100)
    expect(cursorOf(awPeer)).not.toBeNull()
    peer.setEditable(false)
    peer.view.dispatch(peer.state.tr)
    // Back and forth inside one throttle window.
    peer.setEditable(true)
    peer.view.dispatch(peer.state.tr)
    peer.setEditable(false)
    peer.view.dispatch(peer.state.tr)
    vi.advanceTimersByTime(200)
    expect(cursorOf(awPeer)).toBeNull()
  })

  it('activity rises at most once per second while typing', () => {
    vi.useFakeTimers()
    const { peer, awPeer } = setup()
    select(peer, 3)
    vi.advanceTimersByTime(100)
    const activity = () => (cursorOf(awPeer) as { activity?: number }).activity ?? 0
    const start = activity()
    for (let i = 0; i < 20; i++) {
      peer.commands.insertContentAt(3, 'x')
      vi.advanceTimersByTime(100)
    }
    const raised = activity() - start
    expect(raised).toBeGreaterThanOrEqual(1)
    expect(raised).toBeLessThanOrEqual(3)
  })

  it('hidden for more than 60 s clears the caret; visible again restores it', () => {
    vi.useFakeTimers()
    const { peer, awPeer } = setup()
    select(peer, 3)
    vi.advanceTimersByTime(100)
    expect(cursorOf(awPeer)).not.toBeNull()
    const visibility = vi.spyOn(document, 'visibilityState', 'get')
    visibility.mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(59_000)
    expect(cursorOf(awPeer)).not.toBeNull()
    vi.advanceTimersByTime(2_000)
    expect(cursorOf(awPeer)).toBeNull()
    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(100)
    expect(cursorOf(awPeer)).not.toBeNull()
  })

  it('hidden for a short time (back before 60 s) never clears', () => {
    vi.useFakeTimers()
    const { peer, awPeer } = setup()
    select(peer, 3)
    vi.advanceTimersByTime(100)
    const visibility = vi.spyOn(document, 'visibilityState', 'get')
    visibility.mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(30_000)
    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(60_000)
    expect(cursorOf(awPeer)).not.toBeNull()
  })

  it('destroy clears the cursor', () => {
    const { peer, awPeer } = setup()
    select(peer, 3)
    peer.destroy()
    expect(cursorOf(awPeer)).toBeNull()
  })
})

describe('remote carets', () => {
  const caretsOf = (editor: Editor) => Array.from(editor.view.dom.querySelectorAll('.me-peer-caret'))

  it('draws a caret with the resolved name and colour, a selection and the active block', async () => {
    const { me, peer } = setup()
    select(peer, 2, 6)
    // The first (leading) publish is the focus position; the trailing one carries the selection.
    await vi.waitFor(() => expect(me.view.dom.querySelector('.me-peer-selection')).not.toBeNull())
    expect(caretsOf(me)).toHaveLength(1)
    const el = caretsOf(me)[0] as HTMLElement
    expect(el.querySelector('.me-peer-label')?.textContent).toBe('Peer')
    expect(el.style.getPropertyValue('--me-peer-color')).toBe(presenceColor(1))
    expect(me.view.dom.querySelector('.me-peer-selection')).not.toBeNull()
    expect(me.view.dom.querySelectorAll('.me-peer-block')).toHaveLength(1)
  })

  it('resolveUser returning null draws no caret', async () => {
    const { me, peer, awMe } = setup(() => null)
    select(peer, 3)
    await vi.waitFor(() => expect(Array.from(awMe.getStates().values()).some(s => s.cursor)).toBe(true))
    expect(caretsOf(me)).toHaveLength(0)
    expect(me.view.dom.querySelector('.me-peer-block')).toBeNull()
  })

  it('never trusts a name or colour sent in the remote awareness state', async () => {
    const { me, peer, awPeer } = setup()
    awPeer.setLocalStateField('user', { name: 'Evil', color: 'red' })
    select(peer, 3)
    await vi.waitFor(() => expect(caretsOf(me)).toHaveLength(1))
    expect(caretsOf(me)[0]!.textContent).not.toContain('Evil')
    expect(me.view.dom.innerHTML).not.toContain('Evil')
  })

  it('a colour that could close the style declaration falls back to a palette colour', async () => {
    const { me, peer } = setup(() => ({ name: 'X', color: 'red;background:url(x)' }))
    select(peer, 3)
    await vi.waitFor(() => expect(caretsOf(me)).toHaveLength(1))
    expect((caretsOf(me)[0] as HTMLElement).style.getPropertyValue('--me-peer-color')).toBe(PRESENCE_COLORS[0])
  })

  it('scrollToPeer is true with a caret and false without', async () => {
    // happy-dom may lack scrollIntoView; any element the caret sits in must be scrollable.
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    const { me, peer, awPeer } = setup()
    expect(scrollToPeer(me, awPeer.clientID)).toBe(false)
    select(peer, 3)
    await vi.waitFor(() => expect(caretsOf(me)).toHaveLength(1))
    expect(scrollToPeer(me, awPeer.clientID)).toBe(true)
    expect(scroll).toHaveBeenCalledOnce()
  })

  it('the name label counts down 3 s from the last move or edit, and re-shows on activity', async () => {
    const { me, peer } = setup()
    const delay = () => Number.parseInt((me.view.dom.querySelector('.me-peer-caret') as HTMLElement).style.getPropertyValue('--me-peer-label-delay'))
    select(peer, 3)
    await vi.waitFor(() => expect(me.view.dom.querySelector('.me-peer-caret')).not.toBeNull())
    expect(delay()).toBeGreaterThan(2500)
    const first = me.view.dom.querySelector('.me-peer-caret')
    // Fake time from here (real now): 3.5 s pass without movement; a redraw keeps the same element, so its CSS fade (3 s) runs out.
    vi.useFakeTimers({ now: Date.now() })
    vi.advanceTimersByTime(3500)
    refreshPresence(me)
    expect(me.view.dom.querySelector('.me-peer-caret')).toBe(first)
    // The peer types in place: activity rises, the cursor changes, the caret is re-created with a fresh countdown.
    peer.commands.insertContentAt(3, 'x')
    vi.advanceTimersByTime(100)
    expect(me.view.dom.querySelector('.me-peer-caret')).not.toBe(first)
    expect(delay()).toBeGreaterThan(2500)
  })
})
