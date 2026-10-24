import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig, type Plugin } from 'vite'
import pkg from './package.json' with { type: 'json' }

// Everything in dependencies/peerDependencies stays external, so the host app dedupes them.
const external = [...Object.keys(pkg.dependencies), ...Object.keys(pkg.peerDependencies)]
const isExternal = (id: string) => external.some(dep => id === dep || id.startsWith(`${dep}/`)) || id.startsWith('node:')

/** Ships the font license next to the emitted woff2 files (dist/fonts/OFL.txt). */
function fontLicense(): Plugin {
  return {
    name: 'sketch-block:font-license',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'fonts/OFL.txt',
        source: readFileSync(fileURLToPath(new URL('./src/fonts/OFL.txt', import.meta.url))),
      })
    },
  }
}

export default defineConfig({
  plugins: [vue(), fontLicense()],
  // relative asset URLs (new URL('./fonts/…', import.meta.url)) so host bundlers resolve them from dist
  base: './',
  build: {
    lib: {
      entry: {
        index: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
        providers: fileURLToPath(new URL('./src/providers/index.ts', import.meta.url)),
      },
      formats: ['es'],
      cssFileName: 'style',
    },
    rolldownOptions: {
      external: isExternal,
      output: {
        // woff2 next to the license in dist/fonts; anything else (style.css) keeps the lib-mode default
        assetFileNames: info => info.names.some(n => n.endsWith('.woff2'))
          ? 'fonts/[name]-[hash][extname]'
          : '[name][extname]',
      },
    },
    // fonts must be real files loaded on demand by the engine, never base64 in a chunk
    assetsInlineLimit: 0,
    sourcemap: true,
    emptyOutDir: true,
  },
})
