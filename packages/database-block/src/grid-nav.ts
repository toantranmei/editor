/** Spreadsheet-like cell navigation for the table view (pure, so it is easy to test). */

export interface CellPos { row: number, col: number }
export interface GridSelection {
  /** Where the selection started (stays put while Shift extends it). */
  anchor: CellPos
  /** The active cell. */
  focus: CellPos
}

export interface GridBounds {
  rows: number
  cols: number
  /** Item indices that are not data rows (group headers, "+ New" rows) are skipped. */
  isRow?: (index: number) => boolean
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

function step(index: number, dir: 1 | -1, bounds: GridBounds): number {
  const isRow = bounds.isRow ?? (() => true)
  let i = index + dir
  while (i >= 0 && i < bounds.rows && !isRow(i)) i += dir
  return i >= 0 && i < bounds.rows ? i : index
}

function edge(dir: 1 | -1, bounds: GridBounds): number {
  const isRow = bounds.isRow ?? (() => true)
  let i = dir === 1 ? bounds.rows - 1 : 0
  while (i >= 0 && i < bounds.rows && !isRow(i)) i -= dir
  return clamp(i, 0, Math.max(0, bounds.rows - 1))
}

export interface NavKey { key: string, shiftKey?: boolean, metaKey?: boolean, ctrlKey?: boolean }

/**
 * Next selection after a navigation key, or `null` when the key isn't a navigation key.
 * Arrows move (Shift extends, ⌘/Ctrl jumps to the edge), Tab / Shift-Tab move right / left and wrap to the
 * next / previous row, Home / End go to the first / last column.
 */
export function navigate(sel: GridSelection, e: NavKey, bounds: GridBounds): GridSelection | null {
  if (!bounds.rows || !bounds.cols) return null
  const { focus } = sel
  const jump = e.metaKey || e.ctrlKey
  let next: CellPos
  switch (e.key) {
    case 'ArrowDown': next = { row: jump ? edge(1, bounds) : step(focus.row, 1, bounds), col: focus.col }; break
    case 'ArrowUp': next = { row: jump ? edge(-1, bounds) : step(focus.row, -1, bounds), col: focus.col }; break
    case 'ArrowRight': next = { row: focus.row, col: jump ? bounds.cols - 1 : clamp(focus.col + 1, 0, bounds.cols - 1) }; break
    case 'ArrowLeft': next = { row: focus.row, col: jump ? 0 : clamp(focus.col - 1, 0, bounds.cols - 1) }; break
    case 'Home': next = { row: focus.row, col: 0 }; break
    case 'End': next = { row: focus.row, col: bounds.cols - 1 }; break
    case 'Tab': {
      if (e.shiftKey) {
        if (focus.col > 0) next = { row: focus.row, col: focus.col - 1 }
        else {
          const row = step(focus.row, -1, bounds)
          next = row === focus.row ? focus : { row, col: bounds.cols - 1 }
        }
      }
      else if (focus.col < bounds.cols - 1) next = { row: focus.row, col: focus.col + 1 }
      else {
        const row = step(focus.row, 1, bounds)
        next = row === focus.row ? focus : { row, col: 0 }
      }
      return { anchor: next, focus: next }
    }
    default: return null
  }
  return e.shiftKey ? { anchor: sel.anchor, focus: next } : { anchor: next, focus: next }
}

/** Rectangle covered by a selection (inclusive). */
export function selectionRect(sel: GridSelection) {
  return {
    top: Math.min(sel.anchor.row, sel.focus.row),
    bottom: Math.max(sel.anchor.row, sel.focus.row),
    left: Math.min(sel.anchor.col, sel.focus.col),
    right: Math.max(sel.anchor.col, sel.focus.col),
  }
}

export function inSelection(sel: GridSelection | null, row: number, col: number): boolean {
  if (!sel) return false
  const r = selectionRect(sel)
  return row >= r.top && row <= r.bottom && col >= r.left && col <= r.right
}
