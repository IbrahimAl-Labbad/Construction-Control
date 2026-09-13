import * as React from 'react';

export interface HeaderProps {
  children?: React.ReactNode;
  className?: string;
}

/**
 * Shared layout Header component placeholder.
 * RTL-first structural wrapper.
 */
export function Header({ children, className }: HeaderProps) {
  return (
    <header className={className}>
      {children}
    </header>
  );
}
