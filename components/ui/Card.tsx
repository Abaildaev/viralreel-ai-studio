import React from 'react';
import { cn } from './cn';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Adds the hover lift. Only for cards that are themselves clickable. */
  interactive?: boolean;
  /** Turn off when the card holds a list or table that spans edge to edge. */
  padded?: boolean;
  children: React.ReactNode;
}

/**
 * A card is a card on every page. Wraps the `.card` component class from
 * styles/index.css so the surface, border and radius stay in one place.
 */
export const Card: React.FC<CardProps> = ({
  interactive = false,
  padded = true,
  className,
  children,
  ...rest
}) => (
  <div
    className={cn('card', interactive && 'card-interactive', padded && 'p-5 sm:p-6', className)}
    {...rest}
  >
    {children}
  </div>
);

export interface SectionProps {
  /** Shown in a badge when the section is one step of an ordered flow. */
  step?: number | string;
  title: string;
  hint?: string;
  /** Optional control aligned to the right of the title. */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * The card-with-heading pattern for form pages. Before this, each page invented
 * its own: a bare bold label here, a label with a coloured icon there, a
 * numbered circle somewhere else.
 */
export const Section: React.FC<SectionProps> = ({
  step,
  title,
  hint,
  action,
  children,
  className,
}) => (
  <Card className={className}>
    <div className="mb-4 flex items-start gap-3">
      {step !== undefined && (
        <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white">
          {step}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {hint && <p className="mt-1 text-xs leading-relaxed text-gray-500">{hint}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
    {children}
  </Card>
);

export default Card;
