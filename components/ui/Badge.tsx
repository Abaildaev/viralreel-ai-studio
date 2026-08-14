import React from 'react';
import { cn } from './cn';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const TONES: Record<BadgeTone, string> = {
  neutral: 'badge-neutral',
  accent: 'badge-accent',
  success: 'badge-success',
  warning: 'badge-warning',
  danger: 'badge-danger',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** Draws a filled dot in the current text colour, for live status pills. */
  dot?: boolean;
  children: React.ReactNode;
}

/**
 * Status pills. The `.badge-*` classes carry the colours so a status reads the
 * same whether it sits in a table, a card header or a toast.
 */
export const Badge: React.FC<BadgeProps> = ({
  tone = 'neutral',
  dot = false,
  className,
  children,
  ...rest
}) => (
  <span className={cn('badge', TONES[tone], className)} {...rest}>
    {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
    {children}
  </span>
);

export default Badge;
