import { defineAsyncComponent, h } from 'vue'

/** Last rendered height of an inline database (`<databaseId>:<viewId>`), kept for this session as its placeholder size. */
export const reservedHeights = new Map<string, number>()

const Loading = { name: 'DatabaseLoading', render: () => h('div', { 'class': 'me-db-empty is-loading', 'aria-busy': 'true' }) }

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
