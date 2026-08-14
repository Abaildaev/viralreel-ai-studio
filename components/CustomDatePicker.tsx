import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';

interface CustomDatePickerProps {
  value: string; // "YYYY-MM-DD"
  onChange: (value: string) => void;
  label?: string;
  minDate?: string; // "YYYY-MM-DD"
  className?: string;
}

const MONTH_NAMES_RU = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

const WEEKDAY_NAMES_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function padZero(num: number): string {
  return num.toString().padStart(2, '0');
}

function formatDateString(year: number, month: number, day: number): string {
  return `${year}-${padZero(month + 1)}-${padZero(day)}`;
}

function parseDateString(dateStr: string): { year: number; month: number; day: number } | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return null;
  return { year: y, month: m - 1, day: d };
}

export const CustomDatePicker: React.FC<CustomDatePickerProps> = ({
  value,
  onChange,
  label,
  minDate,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedParsed = useMemo(() => parseDateString(value), [value]);

  // Current viewing month and year in calendar
  const today = new Date();
  const [viewYear, setViewYear] = useState(() => selectedParsed?.year || today.getFullYear());
  const [viewMonth, setViewMonth] = useState(() => selectedParsed?.month ?? today.getMonth());

  // Sync view when selected value changes externally
  useEffect(() => {
    if (selectedParsed) {
      setViewYear(selectedParsed.year);
      setViewMonth(selectedParsed.month);
    }
  }, [value]);

  // Close dropdown on outside click
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

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(y => y - 1);
    } else {
      setViewMonth(m => m - 1);
    }
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(y => y + 1);
    } else {
      setViewMonth(m => m + 1);
    }
  };

  const handleSelectDay = (year: number, month: number, day: number) => {
    const formatted = formatDateString(year, month, day);
    onChange(formatted);
    setIsOpen(false);
  };

  // Human readable label for the trigger button
  const formattedDisplayValue = useMemo(() => {
    if (!selectedParsed) return 'Выберите дату';
    const dateObj = new Date(selectedParsed.year, selectedParsed.month, selectedParsed.day);
    const todayObj = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const tomorrowObj = new Date(todayObj);
    tomorrowObj.setDate(tomorrowObj.getDate() + 1);

    const diffDays = Math.round((dateObj.getTime() - todayObj.getTime()) / (1000 * 60 * 60 * 24));

    const dateFormatted = dateObj.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: dateObj.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
    });

    if (diffDays === 0) return `Сегодня, ${dateFormatted}`;
    if (diffDays === 1) return `Завтра, ${dateFormatted}`;
    if (diffDays === 2) return `Послезавтра, ${dateFormatted}`;

    const weekday = dateObj.toLocaleDateString('ru-RU', { weekday: 'short' });
    return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)}, ${dateFormatted}`;
  }, [selectedParsed]);

  // Days matrix for current viewing month
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
    // JS getDay(): 0 = Sun, 1 = Mon ... Convert to Mon = 0, Sun = 6
    let startDayOfWeek = firstDayOfMonth.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const days: Array<{
      day: number;
      month: number;
      year: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      isSelected: boolean;
      isPast: boolean;
      isWeekend: boolean;
    }> = [];

    // Prev month days
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const m = viewMonth === 0 ? 11 : viewMonth - 1;
      const y = viewMonth === 0 ? viewYear - 1 : viewYear;
      days.push({
        day: d,
        month: m,
        year: y,
        isCurrentMonth: false,
        isToday: false,
        isSelected: selectedParsed?.year === y && selectedParsed?.month === m && selectedParsed?.day === d,
        isPast: true,
        isWeekend: false,
      });
    }

    // Current month days
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth();
    const todayDate = today.getDate();

    for (let d = 1; d <= daysInMonth; d++) {
      const dayDate = new Date(viewYear, viewMonth, d);
      let dayOfWeek = dayDate.getDay() - 1;
      if (dayOfWeek === -1) dayOfWeek = 6;

      const isToday = viewYear === todayYear && viewMonth === todayMonth && d === todayDate;
      const isSelected = selectedParsed?.year === viewYear && selectedParsed?.month === viewMonth && selectedParsed?.day === d;
      
      const isPast = minDate
        ? formatDateString(viewYear, viewMonth, d) < minDate
        : new Date(viewYear, viewMonth, d).getTime() < new Date(todayYear, todayMonth, todayDate).getTime();

      days.push({
        day: d,
        month: viewMonth,
        year: viewYear,
        isCurrentMonth: true,
        isToday,
        isSelected,
        isPast,
        isWeekend: dayOfWeek === 5 || dayOfWeek === 6,
      });
    }

    // Next month days to complete 35 or 42 grid slots
    const totalSlots = days.length > 35 ? 42 : 35;
    const remainingSlots = totalSlots - days.length;
    for (let d = 1; d <= remainingSlots; d++) {
      const m = viewMonth === 11 ? 0 : viewMonth + 1;
      const y = viewMonth === 11 ? viewYear + 1 : viewYear;
      days.push({
        day: d,
        month: m,
        year: y,
        isCurrentMonth: false,
        isToday: false,
        isSelected: selectedParsed?.year === y && selectedParsed?.month === m && selectedParsed?.day === d,
        isPast: false,
        isWeekend: false,
      });
    }

    return days;
  }, [viewYear, viewMonth, selectedParsed, minDate]);

  // Quick preset actions
  const selectToday = () => {
    const d = new Date();
    onChange(formatDateString(d.getFullYear(), d.getMonth(), d.getDate()));
    setIsOpen(false);
  };

  const selectTomorrow = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    onChange(formatDateString(d.getFullYear(), d.getMonth(), d.getDate()));
    setIsOpen(false);
  };

  const selectNextMonday = () => {
    const d = new Date();
    const day = d.getDay(); // 0 is Sun, 1 is Mon
    const daysUntilMonday = (1 + 7 - day) % 7 || 7;
    d.setDate(d.getDate() + daysUntilMonday);
    onChange(formatDateString(d.getFullYear(), d.getMonth(), d.getDate()));
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
        <div className="flex items-center gap-2.5 truncate">
          <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center flex-shrink-0">
            <CalendarDaysIcon className="w-4 h-4" />
          </div>
          <span className="truncate">{formattedDisplayValue}</span>
        </div>

        <span className="text-xs text-gray-400 font-mono ml-2 flex-shrink-0">
          {value || 'ГГГГ-ММ-ДД'}
        </span>
      </button>

      {/* Popover Calendar */}
      {isOpen && (
        <div className="absolute z-50 left-0 mt-2 w-80 bg-white border border-gray-200 rounded-2xl shadow-2xl p-4 animate-in fade-in zoom-in-95 duration-150">
          {/* Quick Presets */}
          <div className="flex items-center gap-1.5 pb-3 border-b border-gray-100 mb-3 overflow-x-auto">
            <button
              type="button"
              onClick={selectToday}
              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-100 hover:bg-brand-50 hover:text-brand-700 text-gray-700 transition-colors whitespace-nowrap"
            >
              Сегодня
            </button>
            <button
              type="button"
              onClick={selectTomorrow}
              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-100 hover:bg-brand-50 hover:text-brand-700 text-gray-700 transition-colors whitespace-nowrap"
            >
              Завтра
            </button>
            <button
              type="button"
              onClick={selectNextMonday}
              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-100 hover:bg-brand-50 hover:text-brand-700 text-gray-700 transition-colors whitespace-nowrap"
            >
              С понедельника
            </button>
          </div>

          {/* Month & Year Header */}
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="font-bold text-gray-900 text-sm">
              {MONTH_NAMES_RU[viewMonth]} {viewYear}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600 transition-colors"
                title="Предыдущий месяц"
              >
                <ChevronLeftIcon className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600 transition-colors"
                title="Следующий месяц"
              >
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Weekday labels */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {WEEKDAY_NAMES_RU.map((weekday, idx) => (
              <div
                key={weekday}
                className={`text-[11px] font-semibold py-1 ${
                  idx >= 5 ? 'text-amber-500' : 'text-gray-400'
                }`}
              >
                {weekday}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((item, index) => {
              const key = `${item.year}-${item.month}-${item.day}-${index}`;

              if (!item.isCurrentMonth) {
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleSelectDay(item.year, item.month, item.day)}
                    className="h-8 text-xs font-normal text-gray-300 hover:bg-gray-50 rounded-xl transition-colors flex items-center justify-center"
                  >
                    {item.day}
                  </button>
                );
              }

              if (item.isSelected) {
                return (
                  <button
                    key={key}
                    type="button"
                    className="h-8 text-xs font-bold bg-brand-600 text-white rounded-xl shadow-sm flex items-center justify-center scale-105 transition-transform"
                  >
                    {item.day}
                  </button>
                );
              }

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleSelectDay(item.year, item.month, item.day)}
                  className={`h-8 text-xs font-medium rounded-xl flex items-center justify-center transition-all relative ${
                    item.isToday
                      ? 'text-brand-700 bg-brand-50 font-bold border border-brand-200'
                      : item.isPast
                      ? 'text-gray-400 hover:bg-gray-50'
                      : 'text-gray-800 hover:bg-brand-50 hover:text-brand-700'
                  }`}
                >
                  {item.day}
                  {item.isToday && (
                    <span className="absolute bottom-1 w-1 h-1 rounded-full bg-brand-600" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomDatePicker;
