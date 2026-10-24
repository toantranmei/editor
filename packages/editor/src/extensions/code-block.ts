import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { createLowlight } from 'lowlight'
import { blockNodeView } from '../nodeviews/renderer'
import CodeBlockView from '../nodeviews/CodeBlockView.vue'

/** Starts empty: each language's grammar is loaded the first time a code block uses it. */
export const lowlight = createLowlight()

type Grammar = Parameters<typeof lowlight.register>[1]
const LOADERS: Record<string, () => Promise<{ default: Grammar }>> = {
  arduino: () => import('highlight.js/lib/languages/arduino'),
  bash: () => import('highlight.js/lib/languages/bash'),
  c: () => import('highlight.js/lib/languages/c'),
  cpp: () => import('highlight.js/lib/languages/cpp'),
  csharp: () => import('highlight.js/lib/languages/csharp'),
  css: () => import('highlight.js/lib/languages/css'),
  diff: () => import('highlight.js/lib/languages/diff'),
  go: () => import('highlight.js/lib/languages/go'),
  graphql: () => import('highlight.js/lib/languages/graphql'),
  ini: () => import('highlight.js/lib/languages/ini'),
  java: () => import('highlight.js/lib/languages/java'),
  javascript: () => import('highlight.js/lib/languages/javascript'),
  json: () => import('highlight.js/lib/languages/json'),
  kotlin: () => import('highlight.js/lib/languages/kotlin'),
  less: () => import('highlight.js/lib/languages/less'),
  lua: () => import('highlight.js/lib/languages/lua'),
  makefile: () => import('highlight.js/lib/languages/makefile'),
  markdown: () => import('highlight.js/lib/languages/markdown'),
  objectivec: () => import('highlight.js/lib/languages/objectivec'),
  perl: () => import('highlight.js/lib/languages/perl'),
  php: () => import('highlight.js/lib/languages/php'),
  python: () => import('highlight.js/lib/languages/python'),
  r: () => import('highlight.js/lib/languages/r'),
  ruby: () => import('highlight.js/lib/languages/ruby'),
  rust: () => import('highlight.js/lib/languages/rust'),
  scss: () => import('highlight.js/lib/languages/scss'),
  shell: () => import('highlight.js/lib/languages/shell'),
  sql: () => import('highlight.js/lib/languages/sql'),
  swift: () => import('highlight.js/lib/languages/swift'),
  typescript: () => import('highlight.js/lib/languages/typescript'),
  xml: () => import('highlight.js/lib/languages/xml'),
  yaml: () => import('highlight.js/lib/languages/yaml'),
}

/** Languages offered in the code block's language picker. */
export const CODE_LANGUAGES = ['plaintext', ...Object.keys(LOADERS)]

const ALIASES: Record<string, string> = {
  js: 'javascript', ts: 'typescript', sh: 'bash', zsh: 'bash', html: 'xml', vue: 'xml', py: 'python',
  yml: 'yaml', md: 'markdown', 'c++': 'cpp', cs: 'csharp', rb: 'ruby', rs: 'rust', kt: 'kotlin', golang: 'go',
}

const pending = new Map<string, Promise<boolean>>()

/** Loads and registers a grammar. Resolves true when newly registered. */
export function loadLanguage(language: string): Promise<boolean> {
  const name = ALIASES[language] ?? language
  if (lowlight.registered(name) || !LOADERS[name]) return Promise.resolve(false)
  if (!pending.has(name)) {
    pending.set(name, LOADERS[name]!().then((mod) => {
      lowlight.register(name, mod.default)
      if (name !== language) lowlight.registerAlias(name, language)
      return true
    }).catch(() => false))
  }
  return pending.get(name)!
}

/** Re-highlights code blocks in `language` once its grammar arrives. */
function refresh(view: EditorView, language: string) {
  if (view.isDestroyed) return
  const tr = view.state.tr
  view.state.doc.descendants((node, pos) => {
    if (node.type.name === 'codeBlock' && node.attrs.language === language) tr.setNodeMarkup(pos, undefined, node.attrs)
  })
  if (tr.docChanged) view.dispatch(tr.setMeta('addToHistory', false))
}

export const CodeBlock = CodeBlockLowlight.extend({
  addProseMirrorPlugins() {
    // One load + one re-highlight per language (not per code block: that was O(n²)).
    const requested = new Set<string>()
    const check = (view: EditorView) => {
      view.state.doc.descendants((node) => {
        const language = node.attrs.language as string | null
        if (node.type.name === 'codeBlock' && language && !requested.has(language)) {
          requested.add(language)
          loadLanguage(language).then(added => added && refresh(view, language))
        }
        return !node.isTextblock
      })
    }
    return [
      ...(this.parent?.() ?? []),
      new Plugin({
        key: new PluginKey('codeBlockLanguages'),
        view: (view) => {
          check(view)
          return { update: (v, prev) => !v.state.doc.eq(prev.doc) && check(v) }
        },
      }),
    ]
  },
  addNodeView() {
    return blockNodeView(CodeBlockView)
  },
}).configure({ lowlight, defaultLanguage: 'plaintext' })
