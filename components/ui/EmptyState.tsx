import React from 'react';
import { cn } from './cn';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  /** One line on what to do about it. An empty state without a next step is a dead end. */
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * The "nothing here yet" panel. Pages either showed a bare grey line or nothing
 * at all, so an empty list was indistinguishable from a failed one.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className,
}) => (
  <div className={cn('card flex flex-col items-center px-6 py-12 text-center', className)}>
    {icon && (
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
        {icon}
      </div>
    )}
    <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
    {description && (
      <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-gray-500">{description}</p>
    )}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

export default EmptyState;
