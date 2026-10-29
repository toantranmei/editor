// Server-side highlighting: every grammar the editor offers, registered up front (the
// editor loads them lazily in the browser; on the server a synchronous render needs them).
import arduino_ from 'highlight.js/lib/languages/arduino'
import bash_ from 'highlight.js/lib/languages/bash'
import c_ from 'highlight.js/lib/languages/c'
import cpp_ from 'highlight.js/lib/languages/cpp'
import csharp_ from 'highlight.js/lib/languages/csharp'
import css_ from 'highlight.js/lib/languages/css'
import diff_ from 'highlight.js/lib/languages/diff'
import go_ from 'highlight.js/lib/languages/go'
import graphql_ from 'highlight.js/lib/languages/graphql'
import ini_ from 'highlight.js/lib/languages/ini'
import java_ from 'highlight.js/lib/languages/java'
import javascript_ from 'highlight.js/lib/languages/javascript'
import json_ from 'highlight.js/lib/languages/json'
import kotlin_ from 'highlight.js/lib/languages/kotlin'
import less_ from 'highlight.js/lib/languages/less'
import lua_ from 'highlight.js/lib/languages/lua'
import makefile_ from 'highlight.js/lib/languages/makefile'
import markdown_ from 'highlight.js/lib/languages/markdown'
import objectivec_ from 'highlight.js/lib/languages/objectivec'
import perl_ from 'highlight.js/lib/languages/perl'
import php_ from 'highlight.js/lib/languages/php'
import python_ from 'highlight.js/lib/languages/python'
import r_ from 'highlight.js/lib/languages/r'
import ruby_ from 'highlight.js/lib/languages/ruby'
import rust_ from 'highlight.js/lib/languages/rust'
import scss_ from 'highlight.js/lib/languages/scss'
import shell_ from 'highlight.js/lib/languages/shell'
import sql_ from 'highlight.js/lib/languages/sql'
import swift_ from 'highlight.js/lib/languages/swift'
import typescript_ from 'highlight.js/lib/languages/typescript'
import xml_ from 'highlight.js/lib/languages/xml'
import yaml_ from 'highlight.js/lib/languages/yaml'
import { createLowlight } from 'lowlight'
import { LANGUAGE_ALIASES } from '../extensions/code-languages'
import { escapeHtml } from './html'

const lowlight = createLowlight({
  arduino: arduino_,
  bash: bash_,
  c: c_,
  cpp: cpp_,
  csharp: csharp_,
  css: css_,
  diff: diff_,
  go: go_,
  graphql: graphql_,
  ini: ini_,
  java: java_,
  javascript: javascript_,
  json: json_,
  kotlin: kotlin_,
  less: less_,
  lua: lua_,
  makefile: makefile_,
  markdown: markdown_,
  objectivec: objectivec_,
  perl: perl_,
  php: php_,
  python: python_,
  r: r_,
  ruby: ruby_,
  rust: rust_,
  scss: scss_,
  shell: shell_,
  sql: sql_,
  swift: swift_,
  typescript: typescript_,
  xml: xml_,
  yaml: yaml_,
})

type HastNode = { type: string, value?: string, tagName?: string, properties?: { className?: string[] | string }, children?: HastNode[] }

function toHtml(node: HastNode): string {
  if (node.type === 'text') return escapeHtml(node.value ?? '')
  const inner = (node.children ?? []).map(toHtml).join('')
  if (node.type === 'element') {
    const cls = node.properties?.className
    const names = (Array.isArray(cls) ? cls : cls ? [cls] : []).filter(c => /^[\w-]+$/.test(c))
    return names.length ? `<span class="${names.join(' ')}">${inner}</span>` : `<span>${inner}</span>`
  }
  return inner
}

/** Grammar name for a code block language (aliases resolved), or null when unknown / plain text. */
export function grammarFor(language: string | null | undefined): string | null {
  if (!language) return null
  const name = LANGUAGE_ALIASES[language] ?? language
  return lowlight.registered(name) ? name : null
}

/** Highlighted, escaped HTML for `code` (plain escaped text when the language is unknown). */
export function highlightCode(code: string, language: string | null | undefined): string {
  const grammar = grammarFor(language)
  if (!grammar) return escapeHtml(code)
  try {
    return toHtml(lowlight.highlight(grammar, code) as HastNode)
  }
  catch {
    return escapeHtml(code)
  }
}
