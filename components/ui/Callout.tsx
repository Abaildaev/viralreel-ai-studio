import React from 'react';
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import { cn } from './cn';

export type CalloutTone = 'info' | 'success' | 'warning' | 'danger';

const TONES: Record<CalloutTone, { box: string; icon: React.ReactNode }> = {
  info: {
    box: 'bg-brand-50 border-brand-200 text-brand-900',
    icon: <InformationCircleIcon className="h-4 w-4" />,
  },
  success: {
    box: 'bg-green-50 border-green-200 text-green-800',
    icon: <CheckCircleIcon className="h-4 w-4" />,
  },
  warning: {
    box: 'bg-amber-50 border-amber-200 text-amber-800',
    icon: <ExclamationTriangleIcon className="h-4 w-4" />,
  },
  danger: {
    box: 'bg-red-50 border-red-200 text-red-700',
    icon: <ExclamationCircleIcon className="h-4 w-4" />,
  },
};

export interface CalloutProps {
  tone?: CalloutTone;
  /** Overrides the tone's default icon. */
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * An inline notice attached to the thing it is about — a form that failed, a
 * section with a caveat. For feedback about an action that has already
 * finished, prefer a toast; a banner the user has to visually find is a worse
 * answer than one that comes to them.
 */
export const Callout: React.FC<CalloutProps> = ({ tone = 'info', icon, children, className }) => {
  const { box, icon: defaultIcon } = TONES[tone];

  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm leading-relaxed',
        box,
        className,
      )}
    >
      <span className="mt-0.5 flex-shrink-0" aria-hidden>
        {icon ?? defaultIcon}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
};

export default Callout;
