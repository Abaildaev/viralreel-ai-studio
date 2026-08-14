import React, { useState, useEffect } from 'react';
import { AppView } from '../types';
import { useAccount } from '../contexts/AccountContext';
import { useBatchGeneration } from '../contexts/BatchGenerationContext';
import {
  SparklesIcon,
  CalendarDaysIcon,
  Cog6ToothIcon,
  MusicalNoteIcon,
  FilmIcon,
  BoltIcon,
  ClockIcon,
  CurrencyDollarIcon,
  ChatBubbleLeftRightIcon,
  UserGroupIcon,
  HomeIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowRightOnRectangleIcon,
} from '@heroicons/react/24/outline';
import {
  SparklesIcon as SparklesSolid,
  CalendarDaysIcon as CalendarSolid,
  FilmIcon as FilmSolid,
  BoltIcon as BoltSolid,
  ClockIcon as ClockSolid,
  CurrencyDollarIcon as CurrencyDollarSolid,
  ChatBubbleLeftRightIcon as ChatBubbleLeftRightSolid,
  UserGroupIcon as UserGroupSolid,
  HomeIcon as HomeSolid,
} from '@heroicons/react/24/solid';

interface SidebarProps {
  currentView: AppView;
  onViewChange: (view: AppView) => void;
  userEmail: string;
  onSignOut: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onViewChange,
  userEmail,
  onSignOut,
}) => {
  const { accounts, selectedAccount, setSelectedAccount } = useAccount();
  const { running: batchRunning } = useBatchGeneration();

  // Persistent collapsed state (default to false = expanded for ease of use)
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sidebar_is_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('sidebar_is_collapsed', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // ChatPlace icon rail nav items
  const navItems: { id: AppView; label: string; icon: React.ReactNode; iconActive: React.ReactNode }[] = [
    {
      id: 'generator',
      label: 'Генератор Reels',
      icon: <HomeIcon className="w-5 h-5" />,
      iconActive: <HomeSolid className="w-5 h-5" />,
    },
    {
      id: 'automations',
      label: 'Автоматизации & CRM',
      icon: <SparklesIcon className="w-5 h-5" />,
      iconActive: <SparklesSolid className="w-5 h-5" />,
    },
    {
      id: 'scheduler',
      label: 'Планировщик постов',
      icon: <CalendarDaysIcon className="w-5 h-5" />,
      iconActive: <CalendarSolid className="w-5 h-5" />,
    },
    {
      id: 'budget',
      label: 'Бюджет Reels',
      icon: <CurrencyDollarIcon className="w-5 h-5" />,
      iconActive: <CurrencyDollarSolid className="w-5 h-5" />,
    },
    {
      id: 'aishowcase',
      label: 'AI Showcase',
      icon: <ChatBubbleLeftRightIcon className="w-5 h-5" />,
      iconActive: <ChatBubbleLeftRightSolid className="w-5 h-5" />,
    },
    {
      id: 'templates',
      label: 'Шаблоны и подложки',
      icon: <FilmIcon className="w-5 h-5" />,
      iconActive: <FilmSolid className="w-5 h-5" />,
    },
    {
      id: 'batch',
      label: 'Автогенератор',
      icon: <BoltIcon className="w-5 h-5" />,
      iconActive: <BoltSolid className="w-5 h-5" />,
    },
    {
      id: 'history',
      label: 'История генераций',
      icon: <ClockIcon className="w-5 h-5" />,
      iconActive: <ClockSolid className="w-5 h-5" />,
    },
    {
      id: 'audio',
      label: 'Аудио-треки',
      icon: <MusicalNoteIcon className="w-5 h-5" />,
      iconActive: <MusicalNoteIcon className="w-5 h-5" />,
    },
    {
      id: 'accounts',
      label: 'Аккаунты Instagram',
      icon: <UserGroupIcon className="w-5 h-5" />,
      iconActive: <UserGroupSolid className="w-5 h-5" />,
    },
    {
      id: 'settings',
      label: 'Настройки',
      icon: <Cog6ToothIcon className="w-5 h-5" />,
      iconActive: <Cog6ToothIcon className="w-5 h-5" />,
    },
  ];

  return (
    <aside
      className={`bg-white border-r border-slate-200/90 flex flex-col h-screen sticky top-0 transition-all duration-200 z-30 shadow-xs select-none ${
        collapsed ? 'w-[70px]' : 'w-64'
      }`}
    >
      {/* Top Workspace Header & Collapse Toggle */}
      <div className="p-3.5 border-b border-slate-100 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-2xl bg-[#93C5FD] text-[#1E3A8A] font-bold text-xs flex items-center justify-center flex-shrink-0 shadow-xs">
            ПА
          </div>
          {!collapsed && (
            <div className="min-w-0 transition-opacity">
              <p className="text-xs font-bold text-slate-900 truncate">ViralReel Studio</p>
              <p className="text-[10px] text-slate-400 truncate">ChatPlace Edition</p>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={toggleCollapsed}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors flex-shrink-0"
          title={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
        >
          {collapsed ? (
            <ChevronRightIcon className="w-4 h-4" />
          ) : (
            <ChevronLeftIcon className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Main Navigation Items */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-1">
        {navItems.map((item) => {
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-xs transition-all ${
                collapsed ? 'justify-center px-0' : 'px-3'
              } ${
                isActive
                  ? 'bg-[#1E60FF] text-white font-semibold shadow-xs shadow-[#1E60FF]/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 font-medium'
              }`}
              title={collapsed ? item.label : undefined}
            >
              <span className={`flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`}>
                {isActive ? item.iconActive : item.icon}
              </span>

              {!collapsed && (
                <span className="whitespace-nowrap text-left truncate">
                  {item.label}
                </span>
              )}

              {item.id === 'batch' && batchRunning && (
                <span
                  className={`w-2 h-2 rounded-full bg-emerald-400 animate-pulse ${
                    collapsed ? 'absolute top-1.5 right-1.5' : 'ml-auto'
                  }`}
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom User Profile */}
      <div className="p-3 border-t border-slate-100 bg-slate-50/50">
        <div className={`flex items-center justify-between gap-2 ${collapsed ? 'justify-center' : ''}`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-[#93C5FD] text-[#1E3A8A] flex items-center justify-center text-xs font-bold flex-shrink-0">
              {userEmail ? userEmail.slice(0, 1).toUpperCase() : 'E'}
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-800 truncate">
                  {userEmail || 'Пользователь'}
                </p>
                <p className="text-[10px] text-emerald-600 font-medium">● В сети</p>
              </div>
            )}
          </div>

          {!collapsed && (
            <button
              onClick={onSignOut}
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0"
              title="Выйти"
            >
              <ArrowRightOnRectangleIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
