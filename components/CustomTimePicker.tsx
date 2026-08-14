import React, { useState, useRef, useEffect } from 'react';
import { ClockIcon } from '@heroicons/react/24/outline';

interface CustomTimePickerProps {
  value: string; // "HH:MM"
  onChange: (value: string) => void;
  label?: string;
  className?: string;
}

const COMMON_TIME_PRESETS = [
  '09:00', '10:00', '11:00', '12:00', '13:00', '14:00',
  '15:00', '16:00', '17:00', '18:00', '19:00', '20:00',
  '21:00', '22:00'
];

const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

export const CustomTimePicker: React.FC<CustomTimePickerProps> = ({
  value,
  onChange,
  label,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [currentHour, currentMinute] = (value || '12:00').split(':');

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleSelectHour = (h: string) => {
    onChange(`${h}:${currentMinute || '00'}`);
  };

  const handleSelectMinute = (m: string) => {
    onChange(`${currentHour || '12'}:${m}`);
  };

  const handleSelectPreset = (preset: string) => {
    onChange(preset);
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          {label}
        </label>
      )}

      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full bg-white border rounded-xl px-4 py-2.5 text-sm font-medium text-left flex items-center justify-between transition-all shadow-sm ${
          isOpen
            ? 'border-brand-500 ring-2 ring-brand-500/20 text-gray-900'
            : 'border-gray-200 hover:border-brand-400 text-gray-800'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center flex-shrink-0">
            <ClockIcon className="w-4 h-4" />
          </div>
          <span className="font-semibold text-gray-900">{value || '12:00'}</span>
        </div>
        <span className="text-xs text-gray-400">МСК / локально</span>
      </button>

      {/* Popover */}
      {isOpen && (
        <div className="absolute z-50 left-0 mt-2 w-72 bg-white border border-gray-200 rounded-2xl shadow-2xl p-4 animate-in fade-in zoom-in-95 duration-150">
          {/* Quick Presets */}
          <div className="mb-3 pb-3 border-b border-gray-100">
            <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Популярное время
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
              {COMMON_TIME_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleSelectPreset(preset)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    value === preset
                      ? 'bg-brand-600 text-white font-bold'
                      : 'bg-gray-100 text-gray-700 hover:bg-brand-50 hover:text-brand-700'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Dual columns for Hour & Minute */}
          <div className="grid grid-cols-2 gap-3">
            {/* Hours Column */}
            <div>
              <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 text-center">
                Часы
              </div>
              <div className="max-h-36 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50 bg-gray-50/50 p-1">
                {HOURS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => handleSelectHour(h)}
                    className={`w-full py-1.5 px-2 text-xs font-medium rounded-lg text-center transition-colors ${
                      currentHour === h
                        ? 'bg-brand-600 text-white font-bold shadow-sm'
                        : 'text-gray-700 hover:bg-white'
                    }`}
                  >
                    {h}:00
                  </button>
                ))}
              </div>
            </div>

            {/* Minutes Column */}
            <div>
              <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 text-center">
                Минуты
              </div>
              <div className="max-h-36 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50 bg-gray-50/50 p-1">
                {MINUTES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleSelectMinute(m)}
                    className={`w-full py-1.5 px-2 text-xs font-medium rounded-lg text-center transition-colors ${
                      currentMinute === m
                        ? 'bg-brand-600 text-white font-bold shadow-sm'
                        : 'text-gray-700 hover:bg-white'
                    }`}
                  >
                    :{m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Footer button */}
          <div className="mt-3 pt-3 border-t border-gray-100 flex justify-end">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold transition-colors"
            >
              Готово
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomTimePicker;
