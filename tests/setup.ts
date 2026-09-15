/**
 * tests/setup.ts
 *
 * Vitest global setup file.
 * Loaded before every test file via vitest.config.ts setupFiles.
 *
 * Adds @testing-library/jest-dom matchers to Vitest's expect.
 * Sets mock environment variables for unit tests.
 */

import '@testing-library/jest-dom';

process.env['DATABASE_URL'] =
  process.env['DATABASE_URL'] || 'postgresql://postgres:postgres@localhost:5432/construction_control?schema=public';
process.env['NEXTAUTH_SECRET'] =
  process.env['NEXTAUTH_SECRET'] || '12345678901234567890123456789012';
process.env['NEXTAUTH_URL'] =
  process.env['NEXTAUTH_URL'] || 'http://localhost:3000';
(process.env as Record<string, string | undefined>)['NODE_ENV'] = 'test';
