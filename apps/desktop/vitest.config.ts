import { resolve } from 'node:path';
import { defineProject } from 'vitest/config';

// Shared CI runners are slower and uneven: longer timeouts + retries for timing flakes.
// A real bug still fails (it fails on every attempt).
const CI = Boolean(process.env.CI);

export default defineProject({
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src'),
      '@main': resolve(__dirname, 'src/main'),
    },
  },
  test: {
    name: 'desktop',
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    testTimeout: CI ? 30_000 : 20_000,
    retry: CI ? 2 : 0,
  },
});
