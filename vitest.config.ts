import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    // Use jsdom for component tests
    environment: 'jsdom',
    // Setup file for @testing-library/jest-dom matchers
    setupFiles: ['./tests/setup.ts'],
    // Glob patterns for test files
    include: [
      'tests/unit/**/*.test.ts',
      'tests/unit/**/*.test.tsx',
      'tests/integration/**/*.test.ts',
    ],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    // Global test utilities (no need to import describe/it/expect in every file)
    globals: true,
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '.next/',
        '*.config.*',
        'lib/db/prisma.ts', // Requires DB connection — covered by integration tests
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
