import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Coverage instrumentation roughly triples render time; 5s is marginal for
    // the screens that debounce a search before asserting.
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        // Ambient/type-only modules: no runtime statements to cover.
        'src/lib/spotify/types.ts',
        'src/types/**',
        // Next.js entry shims that only re-export framework-owned handlers.
        'src/app/layout.tsx',
        'src/app/api/auth/**',
        'src/test/**',
      ],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
