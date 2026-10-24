import type { PluginKey } from '@tiptap/pm/state'
import { exitSuggestion, type SuggestionKeyDownProps, type SuggestionOptions, type SuggestionProps } from '@tiptap/suggestion'
import { VueRenderer } from '@tiptap/vue-3'
import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom'
import type { Component } from 'vue'
import { readTokenPx } from '../theme/read'

/**
 * Renders a suggestion popup (slash menu, emoji, mentions) with a Vue component that
 * exposes `onKeyDown(event): boolean`, positioned under the caret with floating-ui.
 */
export function suggestionRenderer<I>(
  component: Component,
  pluginKey: PluginKey,
  hooks: { onUpdate?: (props: SuggestionProps<I>) => boolean | void, onStart?: () => void } = {},
): SuggestionOptions<I>['render'] {
  return () => {
    let renderer: VueRenderer | null = null
    let cleanup: (() => void) | null = null

    const position = (props: SuggestionProps<I>) => {
      const el = renderer?.element as HTMLElement | undefined
      if (!el || !props.clientRect) return
      const reference = { getBoundingClientRect: () => props.clientRect?.() ?? new DOMRect() }
      const gap = readTokenPx(props.editor.view.dom, 'popover.offset')
      cleanup?.()
      cleanup = autoUpdate(reference, el, () => {
        computePosition(reference, el, {
          placement: 'bottom-start',
          strategy: 'fixed',
          middleware: [offset(gap), flip({ padding: gap }), shift({ padding: gap })],
        }).then(({ x, y }) => Object.assign(el.style, { left: `${x}px`, top: `${y}px` }))
      })
    }

    return {
      onStart: (props) => {
        hooks.onStart?.()
        renderer = new VueRenderer(component, { props, editor: props.editor })
        const el = renderer.element as HTMLElement
        Object.assign(el.style, { position: 'fixed', zIndex: '50', left: '0', top: '0' })
        document.body.appendChild(el)
        position(props)
      },
      onUpdate: (props) => {
        // A hook returning false closes the popup (deferred: no dispatch during view updates).
        if (hooks.onUpdate?.(props) === false) {
          setTimeout(() => exitSuggestion(props.editor.view, pluginKey))
          return
        }
        renderer?.updateProps(props)
        position(props)
      },
      onKeyDown: (props: SuggestionKeyDownProps) => {
        if (props.event.key === 'Escape') {
          exitSuggestion(props.view, pluginKey)
          return true
        }
        return renderer?.ref?.onKeyDown?.(props.event) ?? false
      },
      onExit: () => {
        cleanup?.()
        cleanup = null
        renderer?.element?.remove()
        renderer?.destroy()
        renderer = null
      },
    }
  }
}
