import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))

describe('dependencies', () => {
  // collaboration.ts reads y-tiptap internals (the sync plugin's state.init and the binding's
  // _forceRerender), so the version must not float.
  it('@tiptap/y-tiptap is pinned to the exact version that is installed and tested', () => {
    const wanted = json('../package.json').dependencies['@tiptap/y-tiptap']
    expect(wanted).toMatch(/^\d+\.\d+\.\d+$/)
    expect(json('../node_modules/@tiptap/y-tiptap/package.json').version).toBe(wanted)
  })
})
