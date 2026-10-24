import { Node } from '@tiptap/core'
import { blockNodeView } from '../nodeviews/renderer'
import HtmlView from '../nodeviews/HtmlView.vue'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    htmlBlock: {
      insertHtmlBlock: (attrs?: { code?: string, fileName?: string | null }) => ReturnType
    }
  }
}

export interface HtmlBlockOptions {
  /**
   * What the block's code may load from the network. `false` (default, like Notion):
   * nothing. Images, fonts and scripts must be inlined. `true`: anything. A list of
   * origins (`['https://cdn.jsdelivr.net']`): only those.
   */
  network: boolean | string[]
  /** Largest `.html` file that can be uploaded, in KB. */
  maxSize: number
  /** Height of a new block, in px. */
  defaultHeight: number
}

/** Block heights users can drag between, in px. */
export const HTML_MIN_HEIGHT = 120
export const HTML_MAX_HEIGHT = 2000

/**
 * Content-Security-Policy for the sandboxed page. The iframe has no `allow-same-origin`,
 * so the code can't touch the editor, its page, cookies or storage either way; the
 * policy additionally blocks network requests unless `network` allows them.
 */
export function htmlBlockCsp(network: HtmlBlockOptions['network']): string | null {
  if (network === true) return null
  const extra = Array.isArray(network) ? network.filter(o => /^https?:\/\/[\w.-]+(?::\d+)?$/.test(o)).join(' ') : ''
  const src = (base: string) => `${base}${extra ? ` ${extra}` : ''}`
  return [
    `default-src 'none'`,
    `script-src ${src(`'unsafe-inline' 'unsafe-eval' data: blob:`)}`,
    `style-src ${src(`'unsafe-inline' data:`)}`,
    `img-src ${src('data: blob:')}`,
    `font-src ${src('data:')}`,
    `media-src ${src('data: blob:')}`,
    `connect-src ${extra || `'none'`}`,
    `frame-src 'none'`,
    `form-action 'none'`,
    `base-uri 'none'`,
  ].join('; ')
}

/**
 * The iframe document: a strict CSP first (later policies can only tighten it), then
 * the user's HTML.
 */
export function htmlBlockDocument(code: string, network: HtmlBlockOptions['network']): string {
  const csp = htmlBlockCsp(network)
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    csp ? `<meta http-equiv="Content-Security-Policy" content="${csp}">` : '',
  ].join('')
  return `<!doctype html><html><head>${head}</head><body>${code}</body></html>`
}

/** Notion-style HTML block: your own HTML/CSS/JS, running in a sandboxed frame. */
export const HtmlBlock = Node.create<HtmlBlockOptions>({
  name: 'htmlBlock',
  group: 'block',
  atom: true,
  draggable: true,

  addOptions: () => ({ network: false, maxSize: 1024, defaultHeight: 400 }),

  addAttributes() {
    return {
      code: { default: '' },
      fileName: { default: null },
      height: { default: null },
    }
  },

  parseHTML() {
    return [{
      tag: 'div[data-type="html-block"]',
      getAttrs: el => ({
        code: el.getAttribute('data-code') ?? '',
        fileName: el.getAttribute('data-file-name'),
        height: Number(el.getAttribute('data-height')) || null,
      }),
    }]
  },

  // The code is kept in an attribute, so exported HTML never runs it.
  renderHTML({ node }) {
    return ['div', {
      'data-type': 'html-block',
      'data-code': node.attrs.code ?? '',
      ...(node.attrs.fileName ? { 'data-file-name': node.attrs.fileName } : {}),
      ...(node.attrs.height ? { 'data-height': node.attrs.height } : {}),
    }]
  },

  renderText: ({ node }) => node.attrs.code ?? '',

  addCommands() {
    return {
      insertHtmlBlock: attrs => ({ commands }) => commands.insertContent({ type: this.name, attrs: { height: this.options.defaultHeight, ...attrs } }),
    }
  },

  addNodeView() {
    return blockNodeView(HtmlView)
  },
})
