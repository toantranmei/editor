import { Editor, type JSONContent } from '@tiptap/vue-3'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { collaborationExtensions } from '../src/collaboration'
import { createExtensions } from '../src/extensions'
import { defaultBlocks } from '../src/blocks'
import { text } from '../src/blocks/basic'

const blocks = [text, ...defaultBlocks]
const editors: Editor[] = []
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy()
})

function editor(content?: JSONContent, doc?: Y.Doc) {
  const e = doc
    ? new Editor({ extensions: [...createExtensions({ blocks, undoRedo: false }), ...collaborationExtensions({ document: doc })] })
    : new Editor({ extensions: createExtensions({ blocks }), content })
  editors.push(e)
  return e
}

const code = (t: string, language: string | null = null): JSONContent => ({ type: 'codeBlock', attrs: { language }, content: t ? [{ type: 'text', text: t }] : [] })
const firstCode = (e: Editor) => e.getJSON().content!.find(n => n.type === 'codeBlock')!

describe('code block language (KS-BUG-4)', () => {
  it('a code block without a language stays null after a round trip through Yjs, and opening it writes nothing', () => {
    const doc = new Y.Doc()
    editor(undefined, doc).commands.setContent({ type: 'doc', content: [code('plain'), code('const a = 1', 'typescript')] })

    const copy = new Y.Doc()
    Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc))
    let writes = 0
    copy.on('update', () => writes++)
    const reopened = editor(undefined, copy)
    const blocksJSON = reopened.getJSON().content!.filter(n => n.type === 'codeBlock')
    expect(blocksJSON.map(n => n.attrs!.language)).toEqual([null, 'typescript'])
    expect(writes).toBe(0)
  })

  it('parsed <pre> without a class has no language; the picker still shows plaintext', () => {
    const e = new Editor({ extensions: createExtensions({ blocks }), content: '<pre><code>x</code></pre>' })
    editors.push(e)
    expect(firstCode(e).attrs!.language).toBeNull()
  })
})
