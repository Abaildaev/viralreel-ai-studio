import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  TIMEZONE_OPTIONS,
  TimezoneOption,
} from '../utils/scheduleUtils';
import {
  GlobeAltIcon,
  MagnifyingGlassIcon,
  CheckIcon,
  ChevronDownIcon,
  XMarkIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

interface TimezonePickerProps {
  value: string;
  onChange: (timezone: string) => void;
  className?: string;
  align?: 'left' | 'right';
}

type RegionFilter = 'all' | 'cis' | 'europe' | 'asia' | 'mideast' | 'americas' | 'pacific';

const REGION_LABELS: { id: RegionFilter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'cis', label: 'СНГ & РФ' },
  { id: 'europe', label: 'Европа' },
  { id: 'asia', label: 'Азия' },
  { id: 'mideast', label: 'Ближний Восток' },
  { id: 'americas', label: 'Америка' },
  { id: 'pacific', label: 'Океания' },
];

export const TimezonePicker: React.FC<TimezonePickerProps> = ({
  value,
  onChange,
  className = '',
  align = 'right',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeRegion, setActiveRegion] = useState<RegionFilter>('all');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const selectedItemRef = useRef<HTMLButtonElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      setTimeout(() => searchInputRef.current?.focus(), 50);

      // Auto-scroll directly to the currently selected timezone
      const scrollTimer = setTimeout(() => {
        if (selectedItemRef.current) {
          selectedItemRef.current.scrollIntoView({
            block: 'center',
            behavior: 'instant' as ScrollBehavior,
          });
        }
      }, 60);

      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        clearTimeout(scrollTimer);
      };
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Active item details
  const activeTz = useMemo(() => {
    return (
      TIMEZONE_OPTIONS.find((tz) => tz.value === value) ||
      TIMEZONE_OPTIONS.find((tz) => tz.value === 'Europe/Moscow') ||
      TIMEZONE_OPTIONS[0]
    );
  }, [value]);

  // Live time helper
  const getLiveTime = (tzValue: string) => {
    try {
      return new Date().toLocaleTimeString('ru-RU', {
        timeZone: tzValue,
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  // Filtered and strictly sorted timezone options
  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return TIMEZONE_OPTIONS.filter((item) => {
      const matchesRegion = activeRegion === 'all' || item.region === activeRegion;
      if (!matchesRegion) return false;

      if (!query) return true;

      return (
        item.label.toLowerCase().includes(query) ||
        item.city.toLowerCase().includes(query) ||
        item.offset.toLowerCase().includes(query) ||
        item.value.toLowerCase().includes(query)
      );
    });
  }, [search, activeRegion]);

  const handleSelect = (tzValue: string) => {
    onChange(tzValue);
    setIsOpen(false);
    setSearch('');
  };

  return (
    <div className={`relative inline-block text-left ${className}`} ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="group flex items-center gap-2 bg-white hover:bg-gray-50/80 border border-gray-200 rounded-xl px-3 py-1.5 text-xs text-gray-700 shadow-xs transition-all active:scale-98 focus:outline-none focus:ring-2 focus:ring-[#1E60FF]/20"
      >
        <GlobeAltIcon className="w-4 h-4 text-[#1E60FF] flex-shrink-0" />
        <span className="font-medium text-gray-800 truncate max-w-[170px] sm:max-w-[220px]">
          {activeTz.city}
        </span>
        <span className="font-medium text-[11px] text-[#1E60FF] bg-blue-50 px-1.5 py-0.5 rounded-md border border-blue-100/70">
          {activeTz.offset}
        </span>
        <span className="text-[11px] font-normal text-gray-500 bg-gray-100/90 px-1.5 py-0.5 rounded-md tabular hidden sm:inline-block">
          {getLiveTime(activeTz.value)}
        </span>
        <ChevronDownIcon
          className={`w-3.5 h-3.5 text-gray-400 group-hover:text-gray-600 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-[#1E60FF]' : ''
          }`}
        />
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div
          className={`absolute mt-2 z-50 w-[340px] sm:w-[410px] bg-white rounded-2xl shadow-xl border border-gray-200/90 overflow-hidden animate-in fade-in zoom-in-95 duration-150 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {/* Header & Search */}
          <div className="p-3.5 bg-gray-50/70 border-b border-gray-200/60 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClockIcon className="w-4 h-4 text-[#1E60FF]" />
                <span className="font-semibold text-xs text-gray-800">Выбор часового пояса</span>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg transition-colors"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск города, страны или пояса (Москва, +3, UTC-5)..."
                className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-8 py-2 text-xs text-gray-800 placeholder:text-gray-400 font-normal outline-none focus:border-[#1E60FF] focus:ring-2 focus:ring-[#1E60FF]/15 transition-all"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <XMarkIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Region Filter Chips */}
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5 no-scrollbar">
              {REGION_LABELS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveRegion(tab.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-all ${
                    activeRegion === tab.id
                      ? 'bg-[#1E60FF] text-white shadow-xs'
                      : 'bg-white text-gray-600 hover:bg-gray-100/80 border border-gray-200/60'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Timezone Items List (Sorted strictly from - to +) */}
          <div
            ref={listContainerRef}
            className="max-h-[300px] overflow-y-auto divide-y divide-gray-100/80 p-1.5 scroll-smooth"
          >
            {filteredOptions.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-400 space-y-1">
                <p className="font-medium text-gray-600">Ничего не найдено</p>
                <p className="text-[11px]">Попробуйте изменить поисковый запрос</p>
              </div>
            ) : (
              filteredOptions.map((tz) => {
                const isSelected = tz.value === value;
                const liveTime = getLiveTime(tz.value);

                return (
                  <button
                    key={tz.value}
                    ref={isSelected ? selectedItemRef : undefined}
                    type="button"
                    onClick={() => handleSelect(tz.value)}
                    className={`w-full text-left px-3 py-2 rounded-xl transition-all flex items-center justify-between gap-3 group ${
                      isSelected
                        ? 'bg-blue-50/70 text-[#1E60FF]'
                        : 'hover:bg-gray-50/90 text-gray-700'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-medium leading-snug ${
                            isSelected ? 'text-[#1E60FF]' : 'text-gray-800 group-hover:text-[#1E60FF]'
                          }`}
                        >
                          {tz.label}
                        </span>
                      </div>
                      <span className="text-[11px] text-gray-400 font-normal mt-0.5 block truncate">
                        {tz.value}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs font-normal tabular text-gray-500 bg-gray-100/90 px-2 py-0.5 rounded-md">
                        {liveTime}
                      </span>
                      <div className="w-4 h-4 flex items-center justify-center">
                        {isSelected && (
                          <CheckIcon className="w-3.5 h-3.5 text-[#1E60FF] stroke-[2]" />
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer Info */}
          <div className="p-2 bg-gray-50/80 border-t border-gray-200/60 text-[11px] text-gray-400 text-center font-normal">
            Часовые пояса отсортированы по смещению: от <b>UTC-11</b> до <b>UTC+14</b>
          </div>
        </div>
      )}
    </div>
  );
};

export default TimezonePicker;
