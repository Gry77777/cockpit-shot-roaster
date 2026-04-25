import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron/simple'

const rootDir = dirname(fileURLToPath(import.meta.url))

export default defineConfig(async () => ({
  plugins: [
    react(),
    ...(await electron({
      main: {
        entry: 'electron/main.ts',
      },
      preload: {
        input: resolve(rootDir, 'electron/preload.ts'),
      },
    })),
  ],
  resolve: {
    alias: {
      '@': resolve(rootDir, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/tests/setup.ts',
  },
}))
