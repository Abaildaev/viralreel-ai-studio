import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { cn } from './cn';

type OptionElement = React.ReactElement<React.OptionHTMLAttributes<HTMLOptionElement>>;

type AppSelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> & {
  children: React.ReactNode;
  menuClassName?: string;
};

const getOptions = (children: React.ReactNode) =>
  React.Children.toArray(children).flatMap((child) => {
    if (!React.isValidElement(child) || child.type !== 'option') return [];

    const option = child as OptionElement;
    return [{
      value: String(option.props.value ?? ''),
      label: option.props.children,
      disabled: Boolean(option.props.disabled),
    }];
  });

/**
 * A consistent, fully styled alternative to the browser's native select popup.
 * It intentionally keeps the same API as a regular <select>, so existing forms
 * can be migrated without changing their data handling.
 */
export const AppSelect: React.FC<AppSelectProps> = ({
  children,
  className,
  disabled,
  id,
  menuClassName,
  name,
  onChange,
  value,
  defaultValue,
  required,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [uncontrolledValue, setUncontrolledValue] = useState(() => String(defaultValue ?? ''));
  const options = useMemo(() => getOptions(children), [children]);
  const selectedValue = value === undefined ? uncontrolledValue : String(value);
  const selectedOption = options.find((option) => option.value === selectedValue) ?? options[0];

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  const selectOption = (nextValue: string) => {
    if (value === undefined) setUncontrolledValue(nextValue);
    setOpen(false);
    onChange?.({
      target: { value: nextValue },
      currentTarget: { value: nextValue },
    } as React.ChangeEvent<HTMLSelectElement>);
  };

  return (
    <div ref={rootRef} className={cn('relative min-w-0 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20', className)}>
      {name && <input type="hidden" name={name} value={selectedValue} />}
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-required={required}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-5 w-full items-center justify-between gap-3 rounded-[inherit] text-left transition-all disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="min-w-0 flex-1 truncate">{selectedOption?.label ?? 'Выберите значение'}</span>
        <ChevronDownIcon className={cn('h-4 w-4 shrink-0 text-gray-500 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="listbox"
          className={cn(
            'absolute left-0 top-[calc(100%+0.5rem)] z-[70] max-h-64 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-[0_16px_40px_rgba(15,23,42,0.16)] ring-1 ring-black/5',
            menuClassName,
          )}
        >
          {options.map((option) => {
            const selected = option.value === selectedValue;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={option.disabled}
                onClick={() => selectOption(option.value)}
                className={cn(
                  'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors',
                  selected ? 'bg-brand-50 text-brand-700' : 'text-gray-700 hover:bg-gray-100',
                  option.disabled && 'cursor-not-allowed opacity-45',
                )}
              >
                <span className="min-w-0 flex-1">{option.label}</span>
                {selected && <CheckIcon className="h-4 w-4 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AppSelect;
