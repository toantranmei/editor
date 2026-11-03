import { Extension, type Editor } from '@tiptap/core'
import { Fragment, type Node as PMNode, Slice } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { dropPoint, ReplaceAroundStep, ReplaceStep } from '@tiptap/pm/transform'
import type { EditorView } from '@tiptap/pm/view'
import { reactive, shallowReactive } from 'vue'
import type { FileBlockOptions, FileKind } from './file-block'
import { uuid } from './block-id'
import { blockGapAtPoint } from './block-drop'

/** Why an upload placeholder could not become a real image / file. */
export type UploadError = 'tooLarge' | 'badType' | 'failed'

/** Local state of a pasted / dropped file while it uploads (never in the document). */
export interface PendingUpload {
  /** Kept so "Retry" can send it again. */
  file: File
  /** `blob:` URL of an image, shown until the upload resolves. */
  preview: string | null
  /** 0..1, when the uploader reports progress. */
  progress: number
}

export interface FileDropStorage {
  /** Pending uploads by the node's `uploadId` attribute. */
  uploads: Map<string, PendingUpload>
  /** Uploads still running, by `uploadId`: settled once their result is written ({@link uploadsSettled}). */
  running: Map<string, Promise<void>>
  /** Local time each other-tab upload (`uploadId`) was first seen here, for `uploadStaleAt` (not reactive). */
  firstSeen: Map<string, number>
}

declare module '@tiptap/core' {
  interface Storage {
    fileDrop: FileDropStorage
  }
}

/** Formats every browser shows in `<img>`; other `image/*` (HEIC, TIFF…) are refused as `badType`. */
const DISPLAYABLE_IMAGES = /^image\/(png|jpe?g|gif|webp|avif|svg\+xml|bmp|x-icon|vnd\.microsoft\.icon|apng)$/i

const MB = 1024 * 1024

/** An `uploading` node without a local upload and older than this is shown as interrupted (its tab closed). */
export const UPLOAD_STALE_MS = 2 * 60_000

/**
 * How a node's upload looks in this tab:
 * - `local`: this tab owns the file (progress, Delete, Retry on error);
 * - `remote`: another tab is uploading it (message only);
 * - `interrupted`: `uploading` for longer than `UPLOAD_STALE_MS` with nobody here owning it (Delete for editors);
 * - null: no upload.
 */
export type UploadState = 'local' | 'remote' | 'interrupted' | null

export function uploadState(editor: Editor, attrs: Record<string, unknown>, now = Date.now()): UploadState {
  if (pendingUpload(editor, attrs.uploadId)) return 'local'
  if (!attrs.uploading) return null
  return now > uploadStaleAt(editor, attrs, now) ? 'interrupted' : 'remote'
}

/**
 * When an `uploading` node without a local file becomes interrupted (ms, local clock). `uploadStartedAt` comes from
 * another machine whose clock may differ, so the countdown never starts before this tab first saw the upload:
 * `max(firstSeenHere, min(uploadStartedAt, firstSeenHere)) + UPLOAD_STALE_MS`, i.e. 2 minutes after first seen, fixed. Nodes without an `uploadId` (duplicates,
 * older documents) only use `uploadStartedAt`.
 */
export function uploadStaleAt(editor: Editor, attrs: Record<string, unknown>, now = Date.now()): number {
  const started = typeof attrs.uploadStartedAt === 'number' ? attrs.uploadStartedAt : 0
  const id = attrs.uploadId
  const seen = editor.storage.fileDrop?.firstSeen
  if (typeof id !== 'string' || !seen) return Math.min(started, now) + UPLOAD_STALE_MS
  const firstSeen = seen.get(id) ?? now
  if (!seen.has(id)) seen.set(id, firstSeen)
  // max(firstSeen, min(started, firstSeen)): fixed once seen, even when the uploader's clock is ahead.
  return Math.max(firstSeen, Math.min(started, firstSeen)) + UPLOAD_STALE_MS
}

const readAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(reader.result as string)
  reader.onerror = () => reject(reader.error)
  reader.readAsDataURL(file)
})

const kindOf = (mime: string): FileKind => (mime.startsWith('audio/') ? 'audio' : mime.startsWith('video/') ? 'video' : 'file')

function fileBlockOptions(editor: Editor): FileBlockOptions | null {
  return (editor.extensionManager.extensions.find(e => e.name === 'fileBlock')?.options as FileBlockOptions | undefined) ?? null
}

/** The node carrying `uploadId`, with its position. */
function findUpload(doc: PMNode, uploadId: string): { node: PMNode, pos: number } | null {
  let found: { node: PMNode, pos: number } | null = null
  doc.descendants((node, pos) => {
    if (found) return false
    if (node.attrs.uploadId === uploadId) found = { node, pos }
    return !node.isAtom
  })
  return found as { node: PMNode, pos: number } | null
}

/**
 * Uploads that outlived their editor (destroyed while uploading: the page was left): still shown as this tab's by
 * an editor opened again on the same document ({@link pendingUpload}), until they settle.
 */
const adrift = shallowReactive(new Map<string, PendingUpload>())

/** The parts of a Yjs XML fragment / element used here (Yjs itself stays out of the main chunk). */
interface YElementLike {
  getAttribute: (name: string) => unknown
  setAttribute: (name: string, value: unknown) => void
  removeAttribute: (name: string) => void
}
interface YFragmentLike {
  doc: { transact: (fn: () => void, origin?: unknown) => void } | null
  createTreeWalker: (filter: (node: unknown) => boolean) => Iterable<unknown>
}

/** The Yjs fragment a collaborative editor is bound to (`collaborationExtensions`), or null. */
function collaborationFragment(editor: Editor): YFragmentLike | null {
  const options = editor.extensionManager?.extensions.find(e => e.name === 'collaboration')?.options as
    | { document?: { getXmlFragment: (name: string) => YFragmentLike } | null, field?: string, fragment?: YFragmentLike | null }
    | undefined
  try {
    return options?.fragment ?? options?.document?.getXmlFragment(options.field ?? 'default') ?? null
  }
  catch {
    return null
  }
}

/** Origin of the writes below: not a y-tiptap origin, so the Yjs undo manager does not track them. */
const UPLOAD_ORIGIN = 'meiFileDrop'

/**
 * Writes the upload's result straight into the Yjs document, for an editor destroyed meanwhile: the document
 * outlives the view (an app keeps it open until {@link uploadsSettled}), every editor on it gets the change. A null
 * value removes the attribute (its default then applies). False when the node is gone.
 */
function writeToDocument(fragment: YFragmentLike, uploadId: string, attrs: Record<string, unknown>): boolean {
  const isUpload = (node: unknown) => typeof (node as YElementLike).getAttribute === 'function' && (node as YElementLike).getAttribute('uploadId') === uploadId
  for (const node of fragment.createTreeWalker(isUpload)) {
    const element = node as YElementLike
    const apply = () => {
      for (const [key, value] of Object.entries(attrs)) {
        if (value === null || value === undefined) element.removeAttribute(key)
        else element.setAttribute(key, value)
      }
    }
    if (fragment.doc) fragment.doc.transact(apply, UPLOAD_ORIGIN)
    else apply()
    return true
  }
  return false
}

/** Updates the upload node's attributes, outside the undo history (the insertion is the undo step). */
function setUploadAttrs(editor: Editor, uploadId: string, attrs: Record<string, unknown>): boolean {
  if (editor.isDestroyed) return false
  const hit = findUpload(editor.state.doc, uploadId)
  if (!hit) return false
  const tr = editor.state.tr.setNodeMarkup(hit.pos, undefined, { ...hit.node.attrs, ...attrs })
  editor.view.dispatch(tr.setMeta('addToHistory', false))
  return true
}

function dropEntry(editor: Editor, uploadId: string) {
  const uploads = editor.storage.fileDrop?.uploads
  const entry = uploads?.get(uploadId) ?? adrift.get(uploadId)
  if (!entry) return
  uploads?.delete(uploadId)
  adrift.delete(uploadId)
  // The final URL may still be loading: keep the preview a little longer.
  if (entry.preview) setTimeout(() => URL.revokeObjectURL(entry.preview!), 30_000)
}

/** The pending upload of a node (reactive), or null (another tab's upload, or none). Also one started by an earlier
 * editor of this page, destroyed while it uploads. */
export function pendingUpload(editor: Editor, uploadId: unknown): PendingUpload | null {
  if (typeof uploadId !== 'string') return null
  return editor.storage.fileDrop?.uploads.get(uploadId) ?? adrift.get(uploadId) ?? null
}

/**
 * Uploads running per Yjs document (the collaboration `Y.Doc`), whichever editor started them: an editor opened again
 * on that document (a remount, a page left and opened again) still counts the uploads of the editors before it.
 */
const docRuns = new WeakMap<object, Map<string, Promise<void>>>()

const docOf = (editor: Editor): object | null => collaborationFragment(editor)?.doc ?? null

/**
 * Resolves once every upload running for this editor has written its result (its `src`, or its error), also after
 * the editor is destroyed; null when none is running. Counts the uploads this editor started and, for a collaborative
 * editor, every upload still running on its Yjs document (started by an earlier editor of it). A collaborative editor
 * destroyed meanwhile writes the result into its Yjs document: keep that document open (and saved, synced) until
 * then, e.g. close it in `.finally()`. A plain (`v-model`) editor destroyed meanwhile cannot keep the result.
 */
export function uploadsSettled(editor: Editor): Promise<void> | null {
  const runs = new Set(editor.storage.fileDrop?.running.values() ?? [])
  const doc = docOf(editor)
  for (const run of (doc && docRuns.get(doc)?.values()) || []) runs.add(run)
  if (!runs.size) return null
  return Promise.allSettled([...runs]).then(() => {})
}

/**
 * Validates and uploads the file of a placeholder node, then sets its `src` (or `error`).
 * Also used by the node views' "Retry" button.
 */
export function runUpload(editor: Editor, uploadId: string): Promise<void> {
  const running = editor.storage.fileDrop?.running
  const current = running?.get(uploadId)
  if (current) return current
  const doc = docOf(editor)
  let onDoc = doc ? docRuns.get(doc) : undefined
  if (doc && !onDoc) docRuns.set(doc, (onDoc = new Map()))
  const run = upload(editor, uploadId).finally(() => {
    if (running?.get(uploadId) === run) running.delete(uploadId)
    if (onDoc?.get(uploadId) === run) onDoc.delete(uploadId)
  })
  running?.set(uploadId, run)
  onDoc?.set(uploadId, run)
  return run
}

async function upload(editor: Editor, uploadId: string): Promise<void> {
  const entry = pendingUpload(editor, uploadId)
  const hit = findUpload(editor.state.doc, uploadId)
  if (!entry || !hit) return
  // Captured now: read after an await, the editor may be gone.
  const fragment = collaborationFragment(editor)
  /** The result, through the editor while it lives, else straight into its document. */
  const finish = (attrs: Record<string, unknown>) => {
    if (!editor.isDestroyed) return setUploadAttrs(editor, uploadId, attrs)
    return fragment ? writeToDocument(fragment, uploadId, attrs) : false
  }
  const { file } = entry
  const isImage = hit.node.type.name === 'image'
  const config = editor.storage.meiConfig
  const fileOptions = fileBlockOptions(editor)
  const maxMb = isImage ? config.maxImageSize : fileOptions?.maxSize ?? config.maxImageSize

  if (isImage && !DISPLAYABLE_IMAGES.test(file.type)) return void setUploadAttrs(editor, uploadId, { uploading: false, error: 'badType' })
  if (file.size > maxMb * MB) return void setUploadAttrs(editor, uploadId, { uploading: false, error: 'tooLarge' })

  entry.progress = 0
  setUploadAttrs(editor, uploadId, { uploading: true, uploadStartedAt: Date.now(), error: null })
  const onProgress = (fraction: number) => {
    entry.progress = Math.min(1, Math.max(0, fraction))
  }
  try {
    let src: string
    if (isImage) {
      const upload = config.uploadImage
      src = upload ? await upload(file, onProgress) : await readAsDataUrl(file)
    }
    else {
      const kind = (hit.node.attrs.kind ?? 'file') as FileKind
      src = fileOptions?.upload ? await fileOptions.upload(file, kind, onProgress) : await readAsDataUrl(file)
    }
    const done = finish({ src, uploading: false, uploadStartedAt: null, error: null, uploadId: null })
    if (done || editor.isDestroyed || !findUpload(editor.state.doc, uploadId)) dropEntry(editor, uploadId)
  }
  catch {
    finish({ uploading: false, error: 'failed' })
    // Nobody is left to retry it here: the block shows the failure (Delete) and the file is let go.
    if (editor.isDestroyed) dropEntry(editor, uploadId)
  }
}

/** Builds one placeholder node per file (images → `image`, others → `fileBlock`), in order. */
function placeholders(editor: Editor, files: File[]): PMNode[] {
  const { schema } = editor
  const nodes: PMNode[] = []
  for (const file of files) {
    const uploadId = uuid()
    const isImage = file.type.startsWith('image/') && !!schema.nodes.image
    const type = isImage ? schema.nodes.image : schema.nodes.fileBlock
    if (!type) continue
    const attrs = isImage
      ? { src: null, alt: file.name, uploading: true, uploadStartedAt: Date.now(), uploadId }
      : { src: null, name: file.name, size: file.size, mime: file.type, kind: kindOf(file.type), uploading: true, uploadStartedAt: Date.now(), uploadId }
    const preview = isImage && DISPLAYABLE_IMAGES.test(file.type) ? URL.createObjectURL(file) : null
    editor.storage.fileDrop.uploads.set(uploadId, reactive({ file, preview, progress: 0 }))
    nodes.push(type.create(attrs))
  }
  return nodes
}

function startAll(editor: Editor, nodes: PMNode[]) {
  for (const node of nodes) void runUpload(editor, node.attrs.uploadId as string)
}

/** Files of a clipboard / drop, in order; null when there are none. */
function filesOf(data: DataTransfer | null): File[] | null {
  if (!data) return null
  let files = Array.from(data.files ?? [])
  if (!files.length && data.items) files = Array.from(data.items).filter(i => i.kind === 'file').map(i => i.getAsFile()).filter((f): f is File => !!f)
  return files.length ? files : null
}

/**
 * True when the clipboard's HTML carries content of its own (text, or images on the web): the regular paste keeps
 * it (Word / web pages also put a picture of the selection in `files`). HTML that is only images with local
 * sources (`file:`, `blob:`) — a copied image — gives way to the files.
 */
function htmlHasContent(html: string): boolean {
  if (!html.trim()) return false
  const doc = new DOMParser().parseFromString(html, 'text/html')
  if ((doc.body.textContent ?? '').trim()) return true
  return Array.from(doc.querySelectorAll('img')).some(img => /^https?:/i.test(img.getAttribute('src') ?? ''))
}

/** Local images in pasted HTML (Word: `<img src="file:///…">`), whose bytes may be in the clipboard's files. */
const LOCAL_IMG = /<img\b[^>]*?\ssrc\s*=\s*(["'])file:[^"']*\1/gi

/** True when a step inserts a node carrying an `uploadId` (a duplicate or a paste of a placeholder). */
function insertsUpload(steps: readonly unknown[]): boolean {
  return steps.some((step) => {
    if (!(step instanceof ReplaceStep || step instanceof ReplaceAroundStep)) return false
    let found = false
    // Image and file blocks never sit inside text blocks: skip their (large) inline content.
    step.slice.content.descendants((n) => {
      if (n.attrs.uploadId) found = true
      return !found && !n.isAtom && !n.isTextblock
    })
    return found
  })
}

/**
 * True for a transaction made by y-tiptap's sync plugin (remote changes, initial render): any meta of a
 * `PluginKey('y-sync')` (`y-sync$`, or `y-sync$1`… when the module is loaded twice) with `isChangeOrigin`. Read by key
 * name so Yjs stays out of the main chunk. `Transaction.meta` is internal: when it can't be read, the transaction
 * counts as remote (the cleanup below then skips it, never the reverse).
 */
function isSyncTransaction(tr: { getMeta: (key: string) => unknown }): boolean {
  const meta = (tr as unknown as { meta?: unknown }).meta
  if (!meta || typeof meta !== 'object') return true
  return Object.keys(meta).some(key => key.startsWith('y-sync$') && !!(tr.getMeta(key) as { isChangeOrigin?: boolean } | undefined)?.isChangeOrigin)
}

const isAccepted = (editor: Editor, file: File) => (file.type.startsWith('image/') ? !!editor.schema.nodes.image : !!editor.schema.nodes.fileBlock)

/**
 * Paste or drop images and files anywhere in the editor: each file becomes an image block (with an instant preview)
 * or a file block, uploaded through `uploadImage` / `fileBlock.upload`. Failures stay on the block with a Retry.
 * Runs before `markdownPaste`; pastes with text or web images keep the regular path.
 */
export const FileDrop = Extension.create<Record<string, never>, FileDropStorage>({
  name: 'fileDrop',
  // Above markdownPaste (default 100): files win over the clipboard's text/plain (e.g. Finder's file name).
  priority: 110,

  addStorage() {
    return { uploads: shallowReactive(new Map<string, PendingUpload>()), running: new Map<string, Promise<void>>(), firstSeen: new Map<string, number>() }
  },

  onDestroy() {
    // Uploads still running finish without the editor (see runUpload): their file and preview stay until then.
    for (const [id, entry] of this.storage.uploads) {
      if (this.storage.running.has(id)) adrift.set(id, entry)
      else if (entry.preview) URL.revokeObjectURL(entry.preview)
    }
    this.storage.uploads.clear()
    this.storage.firstSeen.clear()
  },

  addProseMirrorPlugins() {
    const editor = this.editor
    /** Images for the `file:` sources of the HTML being pasted (Word), consumed by `transformPasted`. */
    let wordImages: { nonce: string, nodes: PMNode[] } | null = null
    const insert = (view: EditorView, files: File[], at: number | null) => {
      const nodes = placeholders(editor, files)
      if (!nodes.length) return false
      const slice = new Slice(Fragment.from(nodes), 0, 0)
      let tr = view.state.tr
      if (at === null) tr = tr.replaceSelection(slice)
      else {
        const pos = dropPoint(tr.doc, at, slice) ?? at
        tr = tr.replace(pos, pos, slice)
      }
      view.dispatch(tr.scrollIntoView())
      startAll(editor, nodes)
      return true
    }
    return [new Plugin({
      key: new PluginKey('fileDrop'),
      // A node-level copy of a placeholder (duplicate, copy inside the editor) gets a state of its own: its
      // `uploadId` belongs to the original. Without a local file it shows as interrupted (Delete), never stuck.
      appendTransaction: (trs, _old, state) => {
        if (!trs.some(tr => tr.docChanged && !isSyncTransaction(tr) && insertsUpload(tr.steps))) return null
        const seen = new Set<string>()
        const tr = state.tr
        state.doc.descendants((node, pos) => {
          const id = node.attrs.uploadId
          if (typeof id === 'string') {
            if (seen.has(id)) tr.setNodeMarkup(pos, undefined, { ...node.attrs, uploadId: null, ...(node.attrs.uploading ? { uploadStartedAt: 0 } : {}) })
            seen.add(id)
          }
          return !node.isAtom && !node.isTextblock
        })
        return tr.docChanged ? tr.setMeta('addToHistory', false) : null
      },
      props: {
        handlePaste: (view, event) => {
          if (!editor.isEditable || wordImages) return false
          const data = event.clipboardData
          const files = filesOf(data)?.filter(f => isAccepted(editor, f))
          if (!files?.length) return false
          const html = data!.getData('text/html')
          if (htmlHasContent(html)) {
            // Word: local images (`file:` sources) whose bytes are in `files`. Paste the HTML with those images
            // swapped (in order) for upload placeholders; the text stays.
            const images = files.filter(f => f.type.startsWith('image/'))
            if (!images.length || !editor.schema.nodes.image || html.search(LOCAL_IMG) < 0) return false
            const nonce = uuid()
            let i = 0
            const marked = html.replace(LOCAL_IMG, m => m.replace(/\ssrc\s*=\s*(["'])file:[^"']*\1/i, ` src="#me-upload-${nonce}-${i++}"`))
            wordImages = { nonce, nodes: placeholders(editor, images.slice(0, i)) }
            const { nodes } = wordImages
            try {
              view.pasteHTML(marked, event)
            }
            finally {
              wordImages = null
            }
            // Placeholders that did not make it into the document (fewer images in the HTML) are dropped.
            for (const node of nodes) {
              if (findUpload(view.state.doc, node.attrs.uploadId as string)) void runUpload(editor, node.attrs.uploadId as string)
              else dropEntry(editor, node.attrs.uploadId as string)
            }
            return true
          }
          // A text selection is replaced, like Notion.
          return insert(view, files, null)
        },
        transformPasted: (slice) => {
          if (!wordImages) return slice
          const { nonce, nodes } = wordImages
          const prefix = `#me-upload-${nonce}-`
          const swap = (fragment: Fragment): Fragment => {
            const out: PMNode[] = []
            fragment.forEach((node) => {
              const src = node.type.name === 'image' ? node.attrs.src : null
              if (typeof src === 'string' && src.startsWith(prefix)) {
                const placeholder = nodes[Number(src.slice(prefix.length))]
                // More `file:` images than files: an empty image block (as before).
                out.push(placeholder ?? node.type.create({ ...node.attrs, src: null }))
              }
              else out.push(node.isLeaf ? node : node.copy(swap(node.content)))
            })
            return Fragment.from(out)
          }
          return new Slice(swap(slice.content), slice.openStart, slice.openEnd)
        },
        handleDrop: (view, event, _slice, moved) => {
          if (!editor.isEditable || moved || view.dragging) return false
          const files = filesOf(event.dataTransfer)?.filter(f => isAccepted(editor, f))
          if (!files?.length) return false
          const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
          event.preventDefault()
          // Over node-view gaps and the gutter, posAtCoords finds nothing: use the block geometry (as BlockDrop).
          const containers = (editor.extensionManager.extensions.find(e => e.name === 'blockDrop')?.options as { containers?: string[] } | undefined)?.containers
          const at = coords?.pos ?? blockGapAtPoint(view, event.clientX, event.clientY, containers)
          return insert(view, files, at ?? view.state.selection.from)
        },
      },
    })]
  },
})
