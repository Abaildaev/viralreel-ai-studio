import React from 'react';
import { cn } from './cn';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Rounds to a pill for avatars and icon placeholders. */
  circle?: boolean;
}

/**
 * A placeholder shaped like the thing that is loading. Pages used to show a
 * centred spinner over an empty page, which tells the reader that something is
 * happening but nothing about what is coming — and makes the layout jump when
 * the content lands.
 */
export const Skeleton: React.FC<SkeletonProps> = ({ circle, className, ...rest }) => (
  <div
    aria-hidden
    className={cn(
      'relative overflow-hidden bg-gray-100',
      circle ? 'rounded-full' : 'rounded-lg',
      // The sheen reads as "loading" without the attention cost of a spinner.
      'after:absolute after:inset-0 after:-translate-x-full after:animate-shimmer',
      'after:bg-gradient-to-r after:from-transparent after:via-white/70 after:to-transparent',
      className,
    )}
    {...rest}
  />
);

/** A stack of card-shaped placeholders, for the common "list is loading" case. */
export const SkeletonList: React.FC<{ rows?: number; className?: string }> = ({
  rows = 3,
  className,
}) => (
  <div className={cn('space-y-3', className)} role="status" aria-label="Загрузка">
    {Array.from({ length: rows }, (_, index) => (
      <div key={index} className="card flex items-center gap-4 p-4">
        <Skeleton circle className="h-10 w-10 flex-shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-3.5 w-1/3" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </div>
    ))}
  </div>
);

export default Skeleton;
