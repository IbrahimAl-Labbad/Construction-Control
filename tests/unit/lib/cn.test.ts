/**
 * tests/unit/lib/cn.test.ts
 *
 * Unit tests for the cn (classNames) utility.
 */

import { describe, expect, it } from 'vitest';
import { cn } from '@/lib/utils/cn';

describe('cn utility', () => {
  it('merges multiple class names correctly', () => {
    const result = cn('class-a', 'class-b');
    expect(result).toBe('class-a class-b');
  });

  it('handles conditional class names', () => {
    const isTrue = true;
    const isFalse = false;
    const result = cn('base', isTrue && 'active', isFalse && 'hidden');
    expect(result).toBe('base active');
  });

  it('resolves conflicting tailwind classes', () => {
    const result = cn('p-2', 'p-4');
    expect(result).toBe('p-4');
  });

  it('handles empty, null, and undefined inputs', () => {
    const result = cn('base', null, undefined, '', false);
    expect(result).toBe('base');
  });

  it('handles array and nested inputs', () => {
    const result = cn(['px-2', 'py-1'], { 'bg-red-500': true, 'text-white': false });
    expect(result).toBe('px-2 py-1 bg-red-500');
  });
});
