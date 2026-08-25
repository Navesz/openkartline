/// <reference types="vitest" />
import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    exclude: [...configDefaults.exclude, 'e2e/**'],
    css: true,
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      // Bootstrap and declaration-only modules have no behaviour to cover and
      // would otherwise dilute the gate.
      exclude: ['src/main.tsx', 'src/vite-env.d.ts', 'src/domain/types.ts', 'src/test/**'],
      // Matches the intent of the Python `fail_under` gate so both workspaces
      // are held to a comparable standard.
      //
      // Set just under what the suite actually reaches -- 91.57 / 83.27 / 78.75
      // / 91.57 -- leaving a couple of points for the wobble between platforms.
      // The functions gate had been sitting at 55 against an actual 78.75, so
      // a change could have deleted a quarter of the covered functions without
      // the gate noticing. A threshold that far below reality records a past
      // ambition rather than defending the present one.
      thresholds: {
        statements: 90,
        branches: 82,
        functions: 76,
        lines: 90,
      },
    },
  },
})
