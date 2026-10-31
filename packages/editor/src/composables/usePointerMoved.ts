/**
 * For menus that open at the caret (slash, mentions, emoji): hovering a row may select it only
 * after the pointer really moved. When a menu opens — or its rows change while typing — under a
 * resting pointer, the browser fires mouseenter (and Chrome a synthetic mousemove) on the row
 * that slid under it; selecting that row made Enter insert the wrong block (KS-BUG-3).
 *
 * Returns a handler for `mousemove`: true when the pointer is at a new position since the last
 * event this menu saw (the first event only records the position).
 */
export function usePointerMoved() {
  let last: { x: number, y: number } | null = null
  return (event: MouseEvent): boolean => {
    const moved = last !== null && (last.x !== event.screenX || last.y !== event.screenY)
    last = { x: event.screenX, y: event.screenY }
    return moved
  }
}
