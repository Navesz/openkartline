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
      // Set just under what the suite actually reaches -- 92.23 / 86.30 / 93.79
      // / 94.00 -- leaving a point or two for the wobble between platforms.
      //
      // These were 85/78/80/86 for exactly one release. #103 changed the
      // coverage provider, which attributed JSX render branches more finely and
      // showed the three big components were far less covered than the previous
      // meter implied; the gates were lowered to that honest reading rather
      // than to the old standard, on the explicit condition that raising the
      // real number was the next piece of work. #106 did it -- ControlPanel and
      // TrackCanvas to 100% of functions -- so the gates follow it back up. A
      // threshold left below what the suite reaches records a past ambition
      // instead of defending the present one.
      thresholds: {
        statements: 91,
        branches: 85,
        functions: 92,
        lines: 92,
      },
    },
  },
})
