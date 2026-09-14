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
      // These were 85/78/80/86 from #103 to #107, with no release in between.
      // #103 kept the v8 provider but moved @vitest/coverage-v8 from 3.2.7 to
      // 4.1.11, and the new major reads the same code differently: over the
      // source and tests #102 left, 3.2.7 reads 92.04 / 85.06 / 79.25 / 92.04
      // and 4.1.11 reads 86.32 / 79.17 / 82.26 / 87.93, steepest in
      // ControlPanel.tsx, whose statements fall from 97.07 to 57.81. The gates
      // were lowered to that honest reading rather than to the old standard, on
      // the explicit condition that raising the real number was the next piece
      // of work. #106 did it -- ControlPanel and TrackCanvas to 100% of
      // functions -- so the gates follow it back up. A threshold left below what
      // the suite reaches records a past ambition instead of defending the
      // present one.
      thresholds: {
        statements: 91,
        branches: 85,
        functions: 92,
        lines: 92,
      },
    },
  },
})
