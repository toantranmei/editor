import type { InjectionKey, Ref } from 'vue'
import type { BlockDefinition } from './define-block'
import type { ThemeTokens } from './theme/tokens'

/** App-wide token overrides provided by the Vue plugin (`app.use(MeiEditorPlugin, { tokens })`). */
export const GLOBAL_TOKENS_KEY: InjectionKey<Ref<ThemeTokens | undefined>> = Symbol('mei-editor-tokens')

/** App-wide blocks provided by the Vue plugin / Nuxt module. */
export const GLOBAL_BLOCKS_KEY: InjectionKey<BlockDefinition[]> = Symbol('mei-editor-blocks')
