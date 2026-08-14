import React, { useId } from 'react';
import { cn } from './cn';

interface FieldFrameProps {
  label?: string;
  /** Explanatory text under the control. Hidden while `error` is showing. */
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: (props: { id: string; describedBy?: string; invalid: boolean }) => React.ReactNode;
}

/**
 * Label, control, hint and error in the one arrangement, wired together by id
 * so screen readers announce the hint and the error with the control rather
 * than as loose text. Pages used to hand-roll this per input, and most of them
 * skipped the wiring.
 */
export const Field: React.FC<FieldFrameProps> = ({
  label,
  hint,
  error,
  required,
  className,
  children,
}) => {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error || hint;

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label htmlFor={id} className="label">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      {children({ id, describedBy: message ? messageId : undefined, invalid: Boolean(error) })}
      {message && (
        <p
          id={messageId}
          className={cn('mt-1.5 text-xs leading-relaxed', error ? 'text-red-600' : 'text-gray-500')}
        >
          {message}
        </p>
      )}
    </div>
  );
};

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ invalid, className, ...rest }, ref) => (
    <input ref={ref} className={cn('field', invalid && 'field-invalid', className)} {...rest} />
  ),
);
Input.displayName = 'Input';

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean };

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ invalid, className, ...rest }, ref) => (
    <textarea
      ref={ref}
      className={cn('field resize-y', invalid && 'field-invalid', className)}
      {...rest}
    />
  ),
);
Textarea.displayName = 'Textarea';

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean };

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ invalid, className, children, ...rest }, ref) => (
    <select
      ref={ref}
      className={cn('field cursor-pointer pr-8', invalid && 'field-invalid', className)}
      {...rest}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';

export default Field;
