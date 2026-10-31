import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import pkg from './package.json' with { type: 'json' }

// Dependencies (echarts) and peers stay external: the host app dedupes them, and its bundler puts ECharts in the
// lazy chunk that `loadECharts()` imports.
const external = [...Object.keys(pkg.dependencies), ...Object.keys(pkg.peerDependencies)]
const isExternal = (id: string) => external.some(dep => id === dep || id.startsWith(`${dep}/`)) || id.startsWith('node:')

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: { index: fileURLToPath(new URL('./src/index.ts', import.meta.url)) },
      formats: ['es'],
      cssFileName: 'style',
    },
    rolldownOptions: { external: isExternal },
    sourcemap: true,
    emptyOutDir: true,
  },
})
