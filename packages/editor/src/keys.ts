/** Formats a Tiptap-style shortcut ('Mod-Shift-ArrowUp') for display: ⌘⇧↑ on Mac, Ctrl+Shift+↑ elsewhere. */
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

const MAC: Record<string, string> = { Mod: '⌘', Shift: '⇧', Alt: '⌥', ArrowUp: '↑', ArrowDown: '↓', Backspace: '⌫', Delete: 'Del', Escape: 'Esc' }
const PC: Record<string, string> = { Mod: 'Ctrl', Shift: 'Shift', Alt: 'Alt', ArrowUp: '↑', ArrowDown: '↓', Backspace: 'Backspace', Delete: 'Del', Escape: 'Esc' }

export function kbd(shortcut: string): string {
  const parts = shortcut.split('-').map(p => (isMac ? MAC : PC)[p] ?? p.toUpperCase())
  return isMac ? parts.join('') : parts.join('+')
}

/** True for ⌘ on Mac / Ctrl elsewhere. */
export const isMod = (e: KeyboardEvent | MouseEvent) => (isMac ? e.metaKey : e.ctrlKey)
