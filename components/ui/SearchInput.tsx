import React from 'react';
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { cn } from './cn';
import { Input } from './Field';

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Announced to screen readers; the magnifier alone is not a label. */
  label?: string;
  className?: string;
}

/** Search box with a leading magnifier and a clear button once there is a query. */
export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  placeholder = 'Поиск…',
  label = 'Поиск',
  className,
}) => (
  <div className={cn('relative', className)}>
    <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
    <Input
      type="search"
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="pl-9 pr-9"
    />
    {value && (
      <button
        type="button"
        onClick={() => onChange('')}
        title="Очистить"
        aria-label="Очистить поиск"
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-gray-400 transition-colors hover:text-gray-600"
      >
        <XMarkIcon className="h-4 w-4" />
      </button>
    )}
  </div>
);

export default SearchInput;
