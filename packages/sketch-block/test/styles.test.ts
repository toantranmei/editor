import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(import.meta.dirname, '../src/styles/block.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ')

describe('block styles', () => {
  // The preview is exported in the light theme (dark strokes, transparent background):
  // in a dark editor it is inverted, as Excalidraw does, under the editor's dark selectors.
  it('inverts the preview under the editor dark selectors', () => {
    const rule = /([^{}]+)\{[^{}]*filter: invert\(1\) hue-rotate\(180deg\)/.exec(css)
    expect(rule).not.toBeNull()
    const selectors = rule![1]!.split(',').map(s => s.trim())
    expect(selectors).toEqual(expect.arrayContaining([
      'html.dark .me-scope:not(.me-light) .me-sketch-preview',
      '.me-scope.me-dark .me-sketch-preview',
    ]))
  })
})
