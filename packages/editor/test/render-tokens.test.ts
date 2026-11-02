// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { renderTokensStyle } from '../src/render'

const MEDIA = '@media (prefers-color-scheme: dark)'

describe('renderTokensStyle', () => {
  it('without options is the default light + class-based dark tokens, no OS media rule', () => {
    const css = renderTokensStyle()
    expect(css.startsWith('<style id="mei-editor-tokens">')).toBe(true)
    expect(css).not.toContain(MEDIA)
  })

  it('{ light, dark } adds the OS dark media block with default dark tokens and the dark overrides', () => {
    const css = renderTokensStyle({ light: { color: { accent: '#111111' } }, dark: { color: { accent: '#eeeeee' } } })
    expect(css).toContain(MEDIA)
    expect(css).toMatch(/\.me-scope\{[^}]*--me-color-accent:#111111/)
    expect(css).toMatch(new RegExp(`${MEDIA.replaceAll('(', '\\(').replaceAll(')', '\\)')}\\{\\.me-scope:not\\(\\.me-light\\)\\{[^}]*--me-color-accent:#eeeeee`))
    // Class-based dark is emitted too.
    expect(css).toMatch(/html\.dark \.me-scope:not\(\.me-light\),\.me-scope\.me-dark\{[^}]*#eeeeee/)
    // The forced-light opt-out exists in the default dark block.
    expect(css).toContain(':where(.me-scope:not(.me-light))')
  })

  it('accepts flat maps and --me-* keys; a light tree own `dark` counts as dark overrides', () => {
    const flat = renderTokensStyle({ light: { '--me-color-accent': '#123456' }, dark: { '--me-color-accent': '#abcdef' } })
    expect(flat).toContain('--me-color-accent:#123456')
    expect(flat).toContain('--me-color-accent:#abcdef')
    const tree = renderTokensStyle({ light: { color: { accent: '#111111' }, dark: { color: { accent: '#999999' } } } })
    expect(tree).toContain(`${MEDIA}{.me-scope:not(.me-light){`)
    expect(tree).toContain('#999999')
  })

  it('a plain token tree (with a color key) is the old form: no media block', () => {
    expect(renderTokensStyle({ color: { accent: '#7c3aed' } })).not.toContain(MEDIA)
  })

  it('neutralises </style', () => {
    const css = renderTokensStyle({ light: { 'x-y': '</style><script>' } })
    expect(css.match(/<\/style/gi)).toHaveLength(1)
    expect(css).not.toContain('<script>')
  })

  describe('UNSAFE_CSS rejects values and names that could leave the declaration', () => {
    const bad = ['a/*b', 'a*/b', 'a\\7d b', 'a;b', 'a{b', 'a}b', '"a', 'a"b', "a'b", '#000;}x{']
    for (const value of bad) {
      it(`drops value ${JSON.stringify(value)}`, () => {
        const css = renderTokensStyle({ light: { '--me-evil': value, '--me-ok': '#fff' }, dark: { '--me-evil-dark': value } })
        expect(css).not.toContain('--me-evil')
        expect(css).toContain('--me-ok:#fff')
      })
    }
    it('quotes: a quote of the other kind inside a string is fine, an unclosed one is not', () => {
      expect(renderTokensStyle({ light: { '--me-q1': '"it\'s"' } })).toContain('--me-q1:"it\'s"')
      expect(renderTokensStyle({ light: { '--me-q2': '"a\' b" c\'' } })).not.toContain('--me-q2')
      expect(renderTokensStyle({ light: { '--me-q3': 'a"' } })).not.toContain('--me-q3')
    })
    it('the legacy single-argument form is filtered the same way (light and dark)', () => {
      const css = renderTokensStyle({ color: { accent: 'red;}body{x:y', text: '#111' }, dark: { color: { accent: 'a/*b', text: '"x' } } })
      expect(css).not.toContain('body{x:y')
      expect(css).not.toContain('a/*b')
      expect(css).not.toContain('"x')
      expect(css).toContain('--me-color-text:#111')
    })
    it('keeps balanced quotes (font names)', () => {
      expect(renderTokensStyle({ light: { '--me-font': '"Segoe UI", \'Inter\'' } })).toContain('--me-font:"Segoe UI", \'Inter\'')
    })
    it('warns about each dropped token (development)', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      renderTokensStyle({ light: { '--me-evil': 'a;b' } })
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('--me-evil'))
      warn.mockRestore()
    })
    it('drops unsafe names', () => {
      const css = renderTokensStyle({ light: { '--zz-a;b': '#fff', '--zz-a/*': '#fff', '--me-ok': '#000' } })
      expect(css).not.toContain('--zz-a')
      expect(css).toContain('--me-ok:#000')
    })
  })
})
