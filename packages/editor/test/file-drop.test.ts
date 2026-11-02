import { Editor } from '@tiptap/vue-3'
import { Plugin } from '@tiptap/pm/state'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultBlocks, file } from '../src/blocks'
import { text } from '../src/blocks/basic'
import { createExtensions } from '../src/extensions'
import { pendingUpload, runUpload, UPLOAD_STALE_MS, uploadStaleAt, uploadState } from '../src/extensions/file-drop'

const editors: Editor[] = []
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy()
  vi.useRealTimers()
  vi.restoreAllMocks()
})
beforeEach(() => {
  // happy-dom may lack object URLs.
  URL.createObjectURL ??= () => 'blob:test'
  URL.revokeObjectURL ??= () => {}
})

type Uploader = (f: File, onProgress?: (n: number) => void) => Promise<string>

function make(opts: { upload?: Uploader, fileUpload?: (f: File, kind: string, onProgress?: (n: number) => void) => Promise<string>, maxImageSize?: number, content?: object } = {}) {
  const editor = new Editor({
    extensions: createExtensions({
      blocks: [text, ...defaultBlocks, file.configure({ upload: opts.fileUpload ?? null })],
      uploadImage: opts.upload ?? null,
      maxImageSize: opts.maxImageSize,
    }),
    content: opts.content ?? { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }] },
  })
  editors.push(editor)
  return editor
}

const png = (name = 'a.png', size = 10) => new File([new Uint8Array(size)], name, { type: 'image/png' })

function clipboard(files: File[], data: Record<string, string> = {}) {
  return { files, items: [], getData: (t: string) => data[t] ?? '' } as unknown as DataTransfer
}

function paste(editor: Editor, files: File[], data: Record<string, string> = {}) {
  const event = { clipboardData: clipboard(files, data), preventDefault() {} } as unknown as ClipboardEvent
  return !!editor.view.someProp('handlePaste', f => f(editor.view, event, null as never))
}

function drop(editor: Editor, files: File[]) {
  vi.spyOn(editor.view, 'posAtCoords').mockReturnValue({ pos: editor.state.doc.content.size, inside: -1 })
  const event = { dataTransfer: clipboard(files), clientX: 1, clientY: 1, preventDefault() {} } as unknown as DragEvent
  return !!editor.view.someProp('handleDrop', f => f(editor.view, event, null as never, false))
}

const nodesOf = (editor: Editor, type: string) => {
  const out: { attrs: Record<string, unknown> }[] = []
  editor.state.doc.descendants((n) => {
    if (n.type.name === type) out.push(n)
  })
  return out
}

describe('paste', () => {
  it('an image-only paste becomes an image node that uploads, then gets its src', async () => {
    let resolve!: (url: string) => void
    const editor = make({ upload: () => new Promise(r => (resolve = r)) })
    expect(paste(editor, [png()])).toBe(true)
    const [img] = nodesOf(editor, 'image')
    expect(img!.attrs.uploading).toBe(true)
    expect(img!.attrs.src).toBeNull()
    expect(pendingUpload(editor, img!.attrs.uploadId)?.file.name).toBe('a.png')
    resolve('/api/v1/files/1')
    await vi.waitFor(() => expect(nodesOf(editor, 'image')[0]!.attrs.src).toBe('/api/v1/files/1'))
    const done = nodesOf(editor, 'image')[0]!.attrs
    expect(done.uploading).toBe(false)
    expect(done.error).toBeNull()
    expect(editor.storage.fileDrop.uploads.size).toBe(0)
  })

  it('mixed text + image keeps the regular paste (text is not lost)', () => {
    const editor = make({ upload: async () => '/x' })
    expect(paste(editor, [png()], { 'text/html': '<p>some <b>text</b></p>', 'text/plain': 'some text' })).toBe(false)
    expect(nodesOf(editor, 'image')).toHaveLength(0)
    // The regular paste then inserts the text (the fallback the editor would run next).
    editor.view.pasteHTML('<p>some <b>text</b></p>')
    expect(editor.getText()).toContain('some text')
    expect(nodesOf(editor, 'image')).toHaveLength(0)
  })

  it('does nothing when the editor is read-only', () => {
    const editor = make({ upload: async () => '/x' })
    editor.setEditable(false)
    expect(paste(editor, [png()])).toBe(false)
    expect(nodesOf(editor, 'image')).toHaveLength(0)
  })

  it('Word HTML with file:/// images: placeholders replace them in order and the text stays', async () => {
    const urls: string[] = []
    const editor = make({ upload: async (f) => { urls.push(f.name); return `/u/${f.name}` } })
    const html = '<p>Intro</p><p><img src="file:///C:/a/one.png"></p><p>middle</p><p><img src="file:///C:/a/two.png"></p>'
    const handled = paste(editor, [png('first.png'), png('second.png')], { 'text/html': html })
    expect(handled).toBe(true)
    await vi.waitFor(() => expect(nodesOf(editor, 'image').map(n => n.attrs.src)).toEqual(['/u/first.png', '/u/second.png']))
    expect(editor.getText()).toContain('Intro')
    expect(editor.getText()).toContain('middle')
    expect(urls).toEqual(['first.png', 'second.png'])
  })
})

describe('drop', () => {
  it('2 images + a pdf become 3 blocks in order; kinds follow the mime type', () => {
    const editor = make({ upload: () => new Promise(() => {}), fileUpload: () => new Promise(() => {}) })
    const pdf = new File(['x'], 'doc.pdf', { type: 'application/pdf' })
    const mp3 = new File(['x'], 's.mp3', { type: 'audio/mpeg' })
    expect(drop(editor, [png('1.png'), pdf, png('2.png'), mp3])).toBe(true)
    const order: string[] = []
    editor.state.doc.descendants((n) => {
      if (n.type.name === 'image') order.push(`image:${n.attrs.alt}`)
      if (n.type.name === 'fileBlock') order.push(`${n.attrs.kind}:${n.attrs.name}`)
    })
    expect(order).toEqual(['image:1.png', 'file:doc.pdf', 'image:2.png', 'audio:s.mp3'])
  })

  it('is ignored when read-only', () => {
    const editor = make()
    editor.setEditable(false)
    expect(drop(editor, [png()])).toBe(false)
  })
})

describe('upload errors', () => {
  it('a file over the limit gets error tooLarge and never reaches the uploader', async () => {
    const upload = vi.fn(async () => '/x')
    const editor = make({ upload, maxImageSize: 1 })
    paste(editor, [png('big.png', 2 * 1024 * 1024)])
    await vi.waitFor(() => expect(nodesOf(editor, 'image')[0]!.attrs.error).toBe('tooLarge'))
    expect(nodesOf(editor, 'image')[0]!.attrs.uploading).toBe(false)
    expect(upload).not.toHaveBeenCalled()
  })

  it('an image/* type browsers cannot show gets error badType', async () => {
    const editor = make({ upload: async () => '/x' })
    paste(editor, [new File(['x'], 'p.heic', { type: 'image/heic' })])
    await vi.waitFor(() => expect(nodesOf(editor, 'image')[0]!.attrs.error).toBe('badType'))
  })

  it('a failing upload keeps the block with error failed; retry with a working uploader fills src', async () => {
    let fail = true
    const editor = make({ upload: async () => { if (fail) throw new Error('boom'); return '/ok' } })
    paste(editor, [png()])
    await vi.waitFor(() => expect(nodesOf(editor, 'image')[0]!.attrs.error).toBe('failed'))
    const id = nodesOf(editor, 'image')[0]!.attrs.uploadId as string
    expect(pendingUpload(editor, id)).not.toBeNull()
    fail = false
    await runUpload(editor, id)
    const attrs = nodesOf(editor, 'image')[0]!.attrs
    expect(attrs.src).toBe('/ok')
    expect(attrs.error).toBeNull()
  })

  it('a finished upload is not its own undo step (undo removes the block in one step)', async () => {
    const editor = make({ upload: async () => '/ok' })
    paste(editor, [png()])
    await vi.waitFor(() => expect(nodesOf(editor, 'image')[0]!.attrs.src).toBe('/ok'))
    editor.commands.undo()
    expect(nodesOf(editor, 'image')).toHaveLength(0)
  })
})

describe('interrupted uploads', () => {
  const node = (over: Record<string, unknown> = {}) => ({ uploading: true, uploadId: 'u1', uploadStartedAt: 1000, ...over })

  it('another tab\'s upload is remote, then interrupted after 2 minutes from first seen', () => {
    const editor = make()
    expect(uploadState(editor, node(), 5000)).toBe('remote')
    expect(uploadState(editor, node(), 5000 + UPLOAD_STALE_MS - 1)).toBe('remote')
    expect(uploadState(editor, node(), 5000 + UPLOAD_STALE_MS + 1)).toBe('interrupted')
  })

  it('clock skew: a start time 10 min in the future does not delay the deadline; 10 min in the past does not shorten it', () => {
    const editor = make()
    const now = 1_000_000_000
    expect(uploadStaleAt(editor, node({ uploadId: 'future', uploadStartedAt: now + 600_000 }), now)).toBe(now + UPLOAD_STALE_MS)
    expect(uploadStaleAt(editor, node({ uploadId: 'past', uploadStartedAt: now - 600_000 }), now)).toBe(now + UPLOAD_STALE_MS)
    // Fixed once seen, even later.
    expect(uploadStaleAt(editor, node({ uploadId: 'future', uploadStartedAt: now + 600_000 }), now + 50_000)).toBe(now + UPLOAD_STALE_MS)
  })

  it('a node without uploadId (duplicate) uses uploadStartedAt only, so a 0 start is interrupted at once', () => {
    const editor = make()
    expect(uploadState(editor, { uploading: true, uploadId: null, uploadStartedAt: 0 }, UPLOAD_STALE_MS + 5)).toBe('interrupted')
  })

  it('a duplicated placeholder: the copy loses its uploadId and is interrupted', () => {
    const editor = make({ upload: () => new Promise(() => {}) })
    paste(editor, [png()])
    const [img] = nodesOf(editor, 'image')
    const copy = editor.schema.nodes.image!.create({ ...img!.attrs })
    editor.view.dispatch(editor.state.tr.insert(editor.state.doc.content.size, copy))
    const [first, second] = nodesOf(editor, 'image')
    expect(first!.attrs.uploadId).toBe(img!.attrs.uploadId)
    expect(second!.attrs.uploadId).toBeNull()
    expect(second!.attrs.uploadStartedAt).toBe(0)
    expect(uploadState(editor, second!.attrs)).toBe('interrupted')
  })

  it('sync transactions (any y-sync$N meta) never run the duplicate cleanup', () => {
    for (const key of ['y-sync$', 'y-sync$1', 'y-sync$7']) {
      const editor = make({ upload: () => new Promise(() => {}) })
      paste(editor, [png()])
      const [img] = nodesOf(editor, 'image')
      const copy = editor.schema.nodes.image!.create({ ...img!.attrs })
      editor.view.dispatch(editor.state.tr.insert(editor.state.doc.content.size, copy).setMeta(key, { isChangeOrigin: true }))
      expect(nodesOf(editor, 'image').map(n => n.attrs.uploadId), key).toEqual([img!.attrs.uploadId, img!.attrs.uploadId])
    }
  })
})

// Guards the test helper itself: the plugin must be registered.
it('FileDrop is part of createExtensions', () => {
  const editor = make()
  expect(editor.state.plugins.some(p => (p as Plugin & { key: string }).key.startsWith('fileDrop'))).toBe(true)
})
