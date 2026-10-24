import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'

// In the monorepo the playground uses the editor's source for instant HMR.
// Other projects just add '@toantranmei/editor/nuxt' to `modules`.
const editorSrc = fileURLToPath(new URL('../../packages/editor/src', import.meta.url))
const sketchSrc = fileURLToPath(new URL('../../packages/sketch-block/src', import.meta.url))

export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  devtools: { enabled: true },
  ssr: false,
  modules: [`${editorSrc}/nuxt`],
  // The source entry imports its own CSS, so the module doesn't need to add the built file.
  meiEditor: { css: false, prebundle: false },
  // More specific aliases first. `/engine` is playground-only (the sketch benchmark mounts the board directly).
  alias: {
    '@toantranmei/sketch-block/providers': `${sketchSrc}/providers/index.ts`,
    '@toantranmei/sketch-block/engine': `${sketchSrc}/engine.ts`,
    '@toantranmei/sketch-block': `${sketchSrc}/index.ts`,
    '@toantranmei/editor': `${editorSrc}/index.ts`,
  },
  // The playground enables the math block via props, so it adds KaTeX's CSS itself.
  css: ['katex/dist/katex.min.css', '~/assets/css/main.css'],
  // Port 3000 is used by another local project.
  devServer: { port: 3100 },
  vite: {
    plugins: [tailwindcss()],
  },
  app: {
    head: {
      title: 'MTS Editor',
      htmlAttrs: { lang: 'vi' },
    },
  },
})
