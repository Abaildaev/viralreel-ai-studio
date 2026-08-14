import React from 'react';
import { cn } from './cn';

type ShellWidth = 'narrow' | 'default' | 'wide' | 'full';

const WIDTHS: Record<ShellWidth, string> = {
  narrow: 'max-w-3xl',
  default: 'max-w-5xl',
  wide: 'max-w-6xl',
  full: 'max-w-none',
};

export interface PageShellProps {
  /** Matches the `max-w-*` each page used to hardcode. */
  width?: ShellWidth;
  children: React.ReactNode;
  className?: string;
}

/**
 * The page frame. Every page used to open with its own copy of
 * `p-8 max-w-5xl mx-auto`, so padding and width drifted apart and none of them
 * had a mobile scale — the padding is responsive here so fixing it once fixes
 * it everywhere.
 */
export const PageShell: React.FC<PageShellProps> = ({
  width = 'default',
  children,
  className,
}) => (
  <div className={cn('p-4 sm:p-6 lg:p-8 mx-auto w-full', WIDTHS[width], className)}>
    {children}
  </div>
);

export interface PageHeaderProps {
  title: string;
  description?: string;
  /** Primary actions, right-aligned on desktop and stacked below on mobile. */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * The page title block, replacing eight hand-written `<h1>` tags that had
 * drifted between `text-2xl font-semibold` and `text-xl font-bold`.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  actions,
  className,
}) => (
  <header
    className={cn(
      'mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-start sm:justify-between',
      className,
    )}
  >
    <div className="min-w-0">
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{title}</h1>
      {description && (
        <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{description}</p>
      )}
    </div>
    {actions && <div className="flex flex-shrink-0 flex-wrap items-center gap-2">{actions}</div>}
  </header>
);

export default PageShell;
