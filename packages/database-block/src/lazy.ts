import { defineAsyncComponent } from 'vue'

/**
 * `<DatabaseView>` as an async component: the database UI (tables, views, TanStack) is a separate chunk, loaded the
 * first time a database is shown, so pages without one never download it.
 */
export const DatabaseView = defineAsyncComponent(() => import('./DatabaseView.vue'))
