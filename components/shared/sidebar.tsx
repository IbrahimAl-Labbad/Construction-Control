import * as React from 'react';

export interface SidebarProps {
  children?: React.ReactNode;
  className?: string;
}

/**
 * Shared layout Sidebar component placeholder.
 * RTL-first structural wrapper.
 */
export function Sidebar({ children, className }: SidebarProps) {
  return (
    <aside className={className}>
      {children}
    </aside>
  );
}
