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
      // These moved when @vitest/coverage-v8 went from 3.2.7 to 4.1.11, and the
      // move is the meter rather than the coverage: the same 1132 tests over the
      // same source read 92.04 / 85.06 / 79.25 / 92.04 before and
      // 86.40 / 79.41 / 82.26 / 87.95 after. Functions went UP while the other
      // three went down, which is not what less-covered code looks like, and the
      // whole drop sits in App.tsx, ControlPanel.tsx and TrackCanvas.tsx -- the
      // three JSX-heavy files, where render branches are now attributed more
      // finely.
      //
      // So these are lowered against the old reading and not against the old
      // standard. What the new meter is telling us is that those three
      // components are less covered than the previous figure implied --
      // App.tsx 64.87%, ControlPanel.tsx 59.09%, TrackCanvas.tsx 66.66%. Raising
      // that is real work and it is not done here; this bump only stops
      // pretending it was already done. The functions gate goes up, 76 to 80,
      // because that one genuinely improved.
      thresholds: {
        statements: 85,
        branches: 78,
        functions: 80,
        lines: 86,
      },
    },
  },
})
