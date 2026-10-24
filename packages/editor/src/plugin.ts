import { type App, type Plugin, ref } from 'vue'
import MeiEditor from './components/MeiEditor.vue'
import type { BlockDefinition } from './define-block'
import { GLOBAL_BLOCKS_KEY, GLOBAL_TOKENS_KEY } from './plugin-key'
import type { ThemeTokens } from './theme/tokens'

export interface MeiEditorPluginOptions {
  /** Global component name. */
  componentName?: string
  /** Token overrides applied to every editor in the app. */
  tokens?: ThemeTokens
  /** Blocks loaded by every editor that has no `blocks` prop. */
  blocks?: BlockDefinition[]
  /** Register <MeiEditor> globally (set false when the Nuxt module already does). */
  component?: boolean
}

/**
 * Vue plugin that registers <MeiEditor> globally and sets app-wide tokens.
 *
 * @example
 * app.use(MeiEditorPlugin, { tokens: { color: { accent: '#7c3aed' } } })
 */
export const MeiEditorPlugin: Plugin<[MeiEditorPluginOptions?]> = {
  install(app: App, options: MeiEditorPluginOptions = {}) {
    if (options.component !== false) app.component(options.componentName ?? 'MeiEditor', MeiEditor)
    app.provide(GLOBAL_TOKENS_KEY, ref(options.tokens))
    if (options.blocks) app.provide(GLOBAL_BLOCKS_KEY, options.blocks)
  },
}
