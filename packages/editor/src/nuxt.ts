import { addComponent, addPluginTemplate, addTemplate, defineNuxtModule, extendViteConfig } from '@nuxt/kit'
import type { NuxtModule } from '@nuxt/schema'
import { overridesCss } from './theme/css'
import type { ThemeTokens } from './theme/tokens'
import { BLOCK_NAMES, BLOCK_PEERS, type BlockName } from './block-names'

/**
 * Bare imports in dist/index.js (everything except `vue`). Keep in sync when adding
 * imports; `pnpm --filter @toantranmei/editor check:deps` verifies it after a build.
 */
export const RUNTIME_DEPS = [
  '@floating-ui/dom',
  '@lucide/vue',
  '@tiptap/core',
  '@tiptap/extension-blockquote',
  '@tiptap/extension-code-block-lowlight',
  '@tiptap/extension-details',
  '@tiptap/extension-drag-handle-vue-3',
  '@tiptap/extension-heading',
  '@tiptap/extension-horizontal-rule',
  '@tiptap/extension-image',
  '@tiptap/extension-list',
  '@tiptap/extension-mention',
  '@tiptap/extension-node-range',
  '@tiptap/extension-table',
  '@tiptap/extensions',
  '@tiptap/pm/model',
  '@tiptap/pm/state',
  '@tiptap/pm/tables',
  '@tiptap/pm/view',
  '@tiptap/starter-kit',
  '@tiptap/suggestion',
  '@tiptap/vue-3',
  '@tiptap/vue-3/menus',
  'lowlight',
]

export interface ModuleOptions {
  /** Name of the auto-registered component. */
  componentName: string
  /** Add the editor stylesheet to the app automatically. */
  css: boolean
  /**
   * Pre-bundle the editor and its Tiptap/ProseMirror deps in Vite dev. Keeps a single
   * ProseMirror instance and converts highlight.js (CommonJS). Disable only when
   * consuming the editor's source directly (like the monorepo playground).
   */
  prebundle: boolean
  /** Token overrides applied to every editor in the app (typed, with autocomplete). */
  tokens?: ThemeTokens
  /**
   * Blocks loaded by every editor without a `blocks` prop, e.g. `['default', 'math', 'toc']`.
   * Only the listed blocks are imported. For blocks with options (`file`, `mention`), use
   * a Nuxt plugin with `app.use(MeiEditorPlugin, { component: false, blocks: [...] })` instead.
   */
  blocks?: BlockName[]
}

/**
 * Nuxt module: registers <MeiEditor> as a client-only component and adds its CSS.
 *
 * @example
 * export default defineNuxtConfig({ modules: ['@toantranmei/editor/nuxt'] })
 */
const module: NuxtModule<ModuleOptions> = defineNuxtModule<ModuleOptions>({
  meta: { name: '@toantranmei/editor', configKey: 'meiEditor' },
  defaults: { componentName: 'MeiEditor', css: true, prebundle: true },
  setup(options, nuxt) {
    if (options.css) nuxt.options.css.push('@toantranmei/editor/style.css')

    // App-wide token overrides compiled to a static stylesheet (no runtime cost).
    const tokensCss = overridesCss(options.tokens)
    if (tokensCss) {
      const { dst } = addTemplate({ filename: 'mei-editor-tokens.css', write: true, getContents: () => tokensCss })
      nuxt.options.css.push(dst)
    }

    addComponent({
      name: options.componentName,
      export: 'MeiEditor',
      filePath: '@toantranmei/editor',
      mode: 'client',
    })

    // KaTeX's stylesheet for the math block (see lazy.ts for why the library doesn't import it).
    if (options.blocks?.includes('math')) nuxt.options.css.push('katex/dist/katex.min.css')

    if (options.blocks?.length) {
      const unknown = options.blocks.filter(b => !BLOCK_NAMES.includes(b))
      if (unknown.length) throw new Error(`[@toantranmei/editor] Unknown block(s) in meiEditor.blocks: ${unknown.join(', ')}`)
      const named = options.blocks.filter(b => b !== 'default')
      const list = [options.blocks.includes('default') ? '...defaultBlocks' : '', ...named].filter(Boolean).join(', ')
      addPluginTemplate({
        filename: 'mei-editor-blocks.client.mjs',
        mode: 'client',
        getContents: () => [
          `import { defineNuxtPlugin } from '#imports'`,
          `import { GLOBAL_BLOCKS_KEY, defaultBlocks${named.map(n => `, ${n}`).join('')} } from '@toantranmei/editor'`,
          `export default defineNuxtPlugin((nuxtApp) => { nuxtApp.vueApp.provide(GLOBAL_BLOCKS_KEY, [${list}]) })`,
        ].join('\n'),
      })
    }

    // Nuxt marks module packages as "transpile", which excludes them from pre-bundling,
    // so pre-bundle the editor's runtime deps instead (resolved from this package).
    if (options.prebundle) {
      extendViteConfig((config) => {
        config.optimizeDeps ??= {}
        config.optimizeDeps.include ??= []
        const peers = (options.blocks ?? []).map(b => BLOCK_PEERS[b]).filter((p): p is string => !!p)
        config.optimizeDeps.include.push(...[...RUNTIME_DEPS, ...peers].map(dep => `@toantranmei/editor > ${dep}`))
      })
    }
  },
})

export default module
