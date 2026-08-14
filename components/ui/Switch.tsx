import React from 'react';
import { cn } from './cn';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Required: a bare toggle is unreadable to a screen reader. */
  label: string;
  /** Hides the label visually while keeping it announced. */
  hideLabel?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * On/off toggle. Built on a real checkbox so it is keyboard-reachable and
 * announces its state for free — the hand-rolled versions this replaces were
 * `sr-only` inputs whose labels were never associated with anything.
 */
export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  label,
  hideLabel = false,
  disabled = false,
  className,
}) => (
  <label
    className={cn(
      'inline-flex items-center gap-2.5',
      disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
      className,
    )}
  >
    <input
      type="checkbox"
      role="switch"
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
      className="peer sr-only"
    />
    <span
      className={cn(
        'relative h-6 w-11 flex-shrink-0 rounded-full bg-gray-300 transition-colors',
        'peer-checked:bg-brand-600',
        'peer-focus-visible:ring-2 peer-focus-visible:ring-brand-600 peer-focus-visible:ring-offset-2',
        "after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full",
        'after:bg-white after:shadow-sm after:transition-transform after:content-[""]',
        'peer-checked:after:translate-x-5',
      )}
    />
    <span className={cn('text-sm text-gray-700', hideLabel && 'sr-only')}>{label}</span>
  </label>
);

export default Switch;
