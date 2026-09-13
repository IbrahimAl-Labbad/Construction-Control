/**
 * lib/utils/cn.ts
 *
 * Class name utility combining clsx and tailwind-merge.
 *
 * Used for conditional Tailwind class merging in components.
 * Resolves Tailwind class conflicts (e.g., 'p-2 p-4' → 'p-4').
 *
 * Usage:
 *   import { cn } from '@/lib/utils/cn';
 *   <div className={cn('base-class', condition && 'conditional-class', className)} />
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges class names with Tailwind conflict resolution.
 *
 * @example
 * cn('px-4 py-2', 'px-8')        // → 'py-2 px-8'
 * cn('text-red-500', isError && 'text-green-500')  // conditional
 * cn(baseClass, className)        // component pattern
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
