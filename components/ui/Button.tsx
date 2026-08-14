import React from 'react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'subtle' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-gray-300 disabled:text-white shadow-xs',
  secondary:
    'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-900 shadow-xs',
  subtle: 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:text-gray-900',
  ghost: 'bg-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900',
  danger: 'bg-transparent text-red-600 hover:bg-red-50',
};

/* Heights, not paddings, so a row of mixed buttons always lines up. `md` is
   40px — the minimum comfortable touch target on a phone. */
const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-2.5 text-xs gap-1.5 rounded-lg',
  md: 'h-10 px-3.5 text-sm gap-2 rounded-xl',
  lg: 'h-11 px-5 text-base gap-2 rounded-xl',
};

const ICON_SIZES: Record<ButtonSize, string> = {
  sm: 'w-8 px-0',
  md: 'w-10 px-0',
  lg: 'w-11 px-0',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading icon. Swapped for a spinner while `loading`. */
  icon?: React.ReactNode;
  /** Disables the button and shows a spinner in place of the icon. */
  loading?: boolean;
  /** Square button with no label — pass `title` so it stays reachable. */
  iconOnly?: boolean;
  fullWidth?: boolean;
}

/**
 * The one button. Before this the app had five ways to spell the same control
 * across 196 call sites, differing in radius, weight, shadow and disabled
 * treatment — which is most of why the interface read as assembled from parts.
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      icon,
      loading = false,
      iconOnly = false,
      fullWidth = false,
      disabled,
      className,
      children,
      type = 'button',
      ...rest
    },
    ref,
  ) => {
    const spinner = <ArrowPathIcon className="w-4 h-4 animate-spin" aria-hidden />;

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          'inline-flex items-center justify-center font-medium whitespace-nowrap',
          'transition-colors disabled:cursor-not-allowed',
          VARIANTS[variant],
          SIZES[size],
          iconOnly && ICON_SIZES[size],
          // Variants without their own disabled colour just fade.
          variant !== 'primary' && 'disabled:opacity-50',
          fullWidth && 'w-full',
          className,
        )}
        {...rest}
      >
        {loading ? spinner : icon}
        {!iconOnly && children}
      </button>
    );
  },
);

Button.displayName = 'Button';

export default Button;
