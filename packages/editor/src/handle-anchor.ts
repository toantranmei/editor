/**
 * The line the block handle (+ ⋮⋮) is vertically centered on, like Notion:
 * - text blocks: their first line of text (headings, callouts, lists, tables…)
 * - blocks with a header bar (code, HTML): the bar
 * - dividers: the line itself
 * - media and other blocks without text (image, embed, file…): a text line at their top edge
 *
 * Centering on a line, instead of aligning tops, keeps the handle level with the text
 * whatever padding, margin or font size a block has.
 */
export function handleAnchorRect(dom: HTMLElement): DOMRect {
  const box = dom.getBoundingClientRect()
  const lineHeight = lineHeightOf(dom)
  const line = (center: number) => new DOMRect(box.left, center - lineHeight / 2, box.width, lineHeight)

  if (dom.tagName === 'HR') return line(box.top + box.height / 2)

  const bar = dom.querySelector<HTMLElement>('.me-block-bar')
  if (bar) {
    const r = bar.getBoundingClientRect()
    return line(r.top + r.height / 2)
  }

  const text = firstTextRect(dom)
  if (text) return line(text.top + text.height / 2)

  // An empty text block: the middle of its first (empty) line.
  const block = dom.matches('p, h1, h2, h3, h4, summary') ? dom : dom.querySelector<HTMLElement>('p, h1, h2, h3, h4, summary')
  if (block) {
    const r = block.getBoundingClientRect()
    const padTop = Number.parseFloat(getComputedStyle(block).paddingTop) || 0
    return line(r.top + padTop + lineHeightOf(block) / 2)
  }

  return line(box.top + lineHeight / 2)
}

/**
 * Rect of the first visible character. Prefers editable text over UI inside the block
 * (a callout's emoji button, an image toolbar); blocks that only have UI text (TOC,
 * upload placeholders) fall back to that.
 */
function firstTextRect(root: HTMLElement): DOMRect | null {
  const inUi = (node: Node) => {
    const ui = node.parentElement?.closest('[contenteditable="false"]')
    return !!ui && ui !== root && root.contains(ui)
  }
  return findTextRect(root, node => !inUi(node)) ?? findTextRect(root, () => true)
}

function findTextRect(root: HTMLElement, accept: (node: Node) => boolean): DOMRect | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: node => (node.textContent?.trim() && accept(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
  })
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const offset = node.textContent!.search(/\S/)
    const range = document.createRange()
    range.setStart(node, offset)
    range.setEnd(node, offset + 1)
    const rect = range.getClientRects()[0]
    if (rect && rect.height > 0) return rect
  }
  return null
}

function lineHeightOf(el: HTMLElement): number {
  const style = getComputedStyle(el)
  const lh = Number.parseFloat(style.lineHeight)
  return Number.isNaN(lh) ? Number.parseFloat(style.fontSize) * 1.5 : lh
}
