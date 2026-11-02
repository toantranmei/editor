import { defineAsyncComponent, getCurrentInstance, h, inject, type InjectionKey, type Ref } from 'vue'
import { databaseMessages } from './messages'

/** Last rendered height of an inline database (`<databaseId>:<viewId>`), kept for this session as its placeholder size. */
export const reservedHeights = new Map<string, number>()

/** "Loading…" in the editor's locale, provided by the node view (the async wrapper passes no props down). */
export const loadingTextKey: InjectionKey<Ref<string>> = Symbol('me-db-loading-text')

const Loading = {
  name: 'DatabaseLoading',
  setup() {
    const text = inject(loadingTextKey, null)
    // Standalone `<DatabaseView :locale>` (full-page route): read the locale given to the async wrapper.
    const props = getCurrentInstance()?.parent?.vnode.props as { locale?: string, options?: { messages?: Parameters<typeof databaseMessages>[1] } } | null | undefined
    const fallback = databaseMessages(props?.locale ?? 'vi', props?.options?.messages).loading
    return () => h('div', { 'class': 'me-db-empty is-loading', 'aria-busy': 'true', 'role': 'status' }, [
      h('span', { class: 'me-db-sr-only' }, text?.value ?? fallback),
    ])
  },
}

/**
 * `<DatabaseView>` as an async component: the database UI (tables, views, TanStack) is a separate chunk, loaded the
 * first time a database is shown, so pages without one never download it.
 */
export const DatabaseView = defineAsyncComponent({
  loader: () => import('./DatabaseView.vue'),
  // Keeps the block's space while the chunk loads (sized by CSS, `.me-db-empty.is-loading`).
  loadingComponent: Loading,
  delay: 0,
})
