import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import { buildManifest } from './manifest.config'
import { resolve } from 'path'

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    crx({ manifest: buildManifest(mode) }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    // dist/ is the load-unpacked folder and only ever receives dev-keyed
    // builds; production builds (no dev key, Web Store credentials) go to
    // dist-release/ so they can't silently break the unpacked workflow.
    outDir: mode === 'production' ? 'dist-release' : 'dist',
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
        options: resolve(__dirname, 'src/options/index.html'),
        annotate: resolve(__dirname, 'src/annotate/index.html'),
        history: resolve(__dirname, 'src/history/index.html'),
      },
    },
  },
}))
