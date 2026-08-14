import React, { useState, useMemo } from 'react';
import { ScheduledPost } from '../types';
import { useSignedUrls } from '../hooks/useSignedUrl';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  EyeIcon,
  CalendarDaysIcon,
  PlayIcon,
} from '@heroicons/react/24/outline';

interface SchedulerCalendarViewProps {
  posts: ScheduledPost[];
  onSelectPost?: (post: ScheduledPost) => void;
  onPreviewPost: (post: ScheduledPost) => void;
  timezone?: string;
}

const MONTH_NAMES_RU = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

const WEEKDAY_NAMES_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function padZero(num: number): string {
  return num.toString().padStart(2, '0');
}

export const SchedulerCalendarView: React.FC<SchedulerCalendarViewProps> = ({
  posts,
  onSelectPost,
  onPreviewPost,
  timezone = 'Europe/Moscow',
}) => {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const videoPaths = useMemo(() => posts.map(p => p.video_path), [posts]);
  const videoUrls = useSignedUrls('reels', videoPaths);

  const handlePrev = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(y => y - 1);
    } else {
      setCurrentMonth(m => m - 1);
    }
  };

  const handleNext = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(y => y + 1);
    } else {
      setCurrentMonth(m => m + 1);
    }
  };

  const handleJumpToday = () => {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
    const dateStr = `${today.getFullYear()}-${padZero(today.getMonth() + 1)}-${padZero(today.getDate())}`;
    setSelectedDay(dateStr);
  };

  // Group posts by date string "YYYY-MM-DD"
  const postsByDate = useMemo(() => {
    const map = new Map<string, ScheduledPost[]>();
    for (const post of posts) {
      if (!post.scheduled_at) continue;
      const d = new Date(post.scheduled_at);
      const dateKey = `${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(d.getDate())}`;
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(post);
    }
    // Sort posts on same day by time
    map.forEach((list) => {
      list.sort((a, b) => new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime());
    });
    return map;
  }, [posts]);

  // Calendar days grid calculation
  const calendarGrid = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1);
    let startDayOfWeek = firstDay.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

    const cells: Array<{
      dateStr: string;
      dayNum: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      isWeekend: boolean;
      dayPosts: ScheduledPost[];
    }> = [];

    const todayStr = `${today.getFullYear()}-${padZero(today.getMonth() + 1)}-${padZero(today.getDate())}`;

    // Prev month days
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const m = currentMonth === 0 ? 11 : currentMonth - 1;
      const y = currentMonth === 0 ? currentYear - 1 : currentYear;
      const dateStr = `${y}-${padZero(m + 1)}-${padZero(d)}`;
      cells.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        isWeekend: false,
        dayPosts: postsByDate.get(dateStr) || [],
      });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dayDate = new Date(currentYear, currentMonth, d);
      let dow = dayDate.getDay() - 1;
      if (dow === -1) dow = 6;
      const dateStr = `${currentYear}-${padZero(currentMonth + 1)}-${padZero(d)}`;

      cells.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        isWeekend: dow === 5 || dow === 6,
        dayPosts: postsByDate.get(dateStr) || [],
      });
    }

    // Next month filler
    const total = cells.length > 35 ? 42 : 35;
    const remaining = total - cells.length;
    for (let d = 1; d <= remaining; d++) {
      const m = currentMonth === 11 ? 0 : currentMonth + 1;
      const y = currentMonth === 11 ? currentYear + 1 : currentYear;
      const dateStr = `${y}-${padZero(m + 1)}-${padZero(d)}`;
      cells.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        isWeekend: false,
        dayPosts: postsByDate.get(dateStr) || [],
      });
    }

    return cells;
  }, [currentYear, currentMonth, postsByDate]);

  const selectedDayPosts = useMemo(() => {
    if (!selectedDay) return [];
    return postsByDate.get(selectedDay) || [];
  }, [selectedDay, postsByDate]);

  const formatPostTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${padZero(d.getHours())}:${padZero(d.getMinutes())}`;
  };

  const totalMonthPosts = useMemo(() => {
    let count = 0;
    calendarGrid.forEach(cell => {
      if (cell.isCurrentMonth) count += cell.dayPosts.length;
    });
    return count;
  }, [calendarGrid]);

  return (
    <div className="space-y-4">
      {/* Calendar Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-50/70 p-3 rounded-2xl border border-gray-200/80">
        <div className="flex items-center gap-2">
          <h4 className="text-base font-bold text-gray-900 min-w-36">
            {MONTH_NAMES_RU[currentMonth]} {currentYear}
          </h4>
          <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-brand-100 text-brand-800">
            {totalMonthPosts} {totalMonthPosts === 1 ? 'пост' : totalMonthPosts < 5 ? 'поста' : 'постов'}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleJumpToday}
            className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-white hover:bg-brand-50 hover:text-brand-700 text-gray-700 border border-gray-200 shadow-sm transition-all"
          >
            Сегодня
          </button>
          <button
            type="button"
            onClick={handlePrev}
            className="p-1.5 rounded-xl bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 shadow-sm transition-all"
            title="Предыдущий месяц"
          >
            <ChevronLeftIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleNext}
            className="p-1.5 rounded-xl bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 shadow-sm transition-all"
            title="Следующий месяц"
          >
            <ChevronRightIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/*
        A month grid is seven columns by definition — it cannot reflow. Below
        roughly 640px the cells would be too narrow to read a time in, so the
        grid keeps a usable minimum width and scrolls inside its own box rather
        than stretching the page.
      */}
      <div className="scroll-x -mx-1 px-1">
      <div className="min-w-[560px]">

      {/* Weekday labels */}
      <div className="grid grid-cols-7 gap-2 text-center">
        {WEEKDAY_NAMES_RU.map((weekday, idx) => (
          <div
            key={weekday}
            className={`text-xs font-bold py-1 uppercase tracking-wider ${
              idx >= 5 ? 'text-amber-500' : 'text-gray-400'
            }`}
          >
            {weekday}
          </div>
        ))}
      </div>

      {/* Month Calendar Grid */}
      <div className="grid grid-cols-7 gap-2">
        {calendarGrid.map((cell) => {
          const isSelected = selectedDay === cell.dateStr;
          const hasPosts = cell.dayPosts.length > 0;

          return (
            <div
              key={cell.dateStr}
              onClick={() => setSelectedDay(isSelected ? null : cell.dateStr)}
              className={`min-h-[105px] sm:min-h-[120px] rounded-2xl p-2 flex flex-col justify-between border transition-all cursor-pointer group ${
                cell.isCurrentMonth
                  ? isSelected
                    ? 'bg-brand-50/50 border-brand-500 ring-2 ring-brand-500/20 shadow-md'
                    : 'bg-white border-gray-200 hover:border-brand-300 hover:shadow-md'
                  : 'bg-gray-50/50 border-gray-100 text-gray-300 opacity-60'
              }`}
            >
              {/* Day Header */}
              <div className="flex items-center justify-between">
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    cell.isToday
                      ? 'bg-brand-600 text-white shadow-sm'
                      : cell.isCurrentMonth
                      ? 'text-gray-800'
                      : 'text-gray-400'
                  }`}
                >
                  {cell.dayNum}
                </span>

                {hasPosts && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand-100 text-brand-700">
                    {cell.dayPosts.length}
                  </span>
                )}
              </div>

              {/* Posts preview list */}
              <div className="mt-1.5 space-y-1 overflow-y-auto max-h-16 pr-0.5">
                {cell.dayPosts.slice(0, 3).map((post) => (
                  <div
                    key={post.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onPreviewPost(post);
                    }}
                    className={`text-[10px] p-1 rounded-lg flex items-center gap-1 font-medium transition-all truncate group/item ${
                      post.status === 'published'
                        ? 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'
                        : post.status === 'failed'
                        ? 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
                        : 'bg-brand-50 text-brand-800 hover:bg-brand-100 border border-brand-200'
                    }`}
                    title={`${formatPostTime(post.scheduled_at!)} - ${post.hook_text || 'Пост'}`}
                  >
                    <ClockIcon className="w-2.5 h-2.5 flex-shrink-0" />
                    <span className="font-bold flex-shrink-0">{formatPostTime(post.scheduled_at!)}</span>
                    <span className="truncate flex-1">{post.hook_text || 'Без текста'}</span>
                  </div>
                ))}
                {cell.dayPosts.length > 3 && (
                  <div className="text-[9px] font-semibold text-brand-600 text-center">
                    + еще {cell.dayPosts.length - 3}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      </div>
      </div>

      {/* Selected Day Expanded Drawer */}
      {selectedDay && (
        <div className="bg-gradient-to-r from-brand-50/80 to-cyan-50/80 border border-brand-200 rounded-2xl p-4 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between mb-3">
            <h5 className="font-bold text-gray-900 text-sm flex items-center gap-2">
              <CalendarDaysIcon className="w-4 h-4 text-brand-600" />
              Посты на {selectedDay} ({selectedDayPosts.length})
            </h5>
            <button
              onClick={() => setSelectedDay(null)}
              className="text-xs text-gray-500 hover:text-gray-800 font-medium"
            >
              Закрыть
            </button>
          </div>

          {selectedDayPosts.length === 0 ? (
            <p className="text-xs text-gray-500 py-2">
              На этот день нет запланированных постов. Вы можете запланировать посты из очереди.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {selectedDayPosts.map((post) => (
                <div
                  key={post.id}
                  className="bg-white rounded-xl p-3 border border-brand-100 shadow-sm flex items-center gap-3 hover:shadow-md transition-shadow"
                >
                  <div
                    onClick={() => onPreviewPost(post)}
                    className="w-12 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-black relative cursor-pointer group"
                  >
                    {post.video_path && videoUrls[post.video_path] ? (
                      <video
                        src={videoUrls[post.video_path]}
                        className="w-full h-full object-cover"
                        preload="metadata"
                        muted
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-900 text-brand-400">
                        <PlayIcon className="w-5 h-5 opacity-60" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors flex items-center justify-center">
                      <PlayIcon className="w-4 h-4 text-white drop-shadow" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 text-xs font-bold text-brand-700">
                      <ClockIcon className="w-3.5 h-3.5" />
                      {formatPostTime(post.scheduled_at!)}
                      <span className={`ml-auto text-[10px] px-1.5 py-0.2 rounded ${
                        post.status === 'published'
                          ? 'bg-green-100 text-green-700'
                          : post.status === 'failed'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-brand-100 text-brand-700'
                      }`}>
                        {post.status === 'published' ? 'Опубликован' : post.status === 'failed' ? 'Ошибка' : 'В очереди'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-800 font-medium line-clamp-1 mt-1">
                      {post.hook_text || 'Без хука'}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => onPreviewPost(post)}
                        className="text-[11px] font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1"
                      >
                        <EyeIcon className="w-3 h-3" /> Просмотр
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SchedulerCalendarView;
