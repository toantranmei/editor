import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import pkg from './package.json' with { type: 'json' }

// Dependencies and peers stay external, so the host app has one copy of Vue / Tiptap / TanStack / the editor,
// and chart-block (ECharts) stays a lazy chunk of the app.
const external = [...Object.keys(pkg.dependencies), ...Object.keys(pkg.peerDependencies)]
const isExternal = (id: string) => external.some(dep => id === dep || id.startsWith(`${dep}/`)) || id.startsWith('node:')

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: {
        index: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
        memory: fileURLToPath(new URL('./src/memory-source.ts', import.meta.url)),
      },
      formats: ['es'],
      cssFileName: 'style',
    },
    rolldownOptions: { external: isExternal },
    sourcemap: true,
    emptyOutDir: true,
  },
})
