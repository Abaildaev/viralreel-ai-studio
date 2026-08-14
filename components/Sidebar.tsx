import React, { useState } from 'react';
import { AppView, InstagramAccount } from '../types';
import { useAccount } from '../contexts/AccountContext';
import { useBatchGeneration } from '../contexts/BatchGenerationContext';
import {
  SparklesIcon,
  CalendarDaysIcon,
  UserGroupIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  MusicalNoteIcon,
  ChevronDownIcon,
  CheckIcon,
  ChevronLeftIcon,
  FilmIcon,
  BoltIcon,
  ClockIcon,
  CurrencyDollarIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/outline';
import {
  SparklesIcon as SparklesSolid,
  CalendarDaysIcon as CalendarSolid,
  UserGroupIcon as UserGroupSolid,
  Cog6ToothIcon as CogSolid,
  MusicalNoteIcon as MusicalNoteSolid,
  FilmIcon as FilmSolid,
  BoltIcon as BoltSolid,
  ClockIcon as ClockSolid,
  CurrencyDollarIcon as CurrencyDollarSolid,
  ChatBubbleLeftRightIcon as ChatBubbleLeftRightSolid,
} from '@heroicons/react/24/solid';

interface SidebarProps {
  currentView: AppView;
  onViewChange: (view: AppView) => void;
  userEmail: string;
  onSignOut: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onViewChange, userEmail, onSignOut }) => {
  const { accounts, selectedAccount, setSelectedAccount, loading } = useAccount();
  const { running: batchRunning, progress: batchProgress } = useBatchGeneration();
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const navItems: { id: AppView; label: string; icon: React.ReactNode; iconActive: React.ReactNode }[] = [
    {
      id: 'generator',
      label: 'Генератор',
      icon: <SparklesIcon className="w-5 h-5" />,
      iconActive: <SparklesSolid className="w-5 h-5" />,
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
      icon: <SparklesIcon className="w-5 h-5" />,
      iconActive: <SparklesSolid className="w-5 h-5" />,
    },
    {
      id: 'scheduler',
      label: 'Планировщик',
      icon: <CalendarDaysIcon className="w-5 h-5" />,
      iconActive: <CalendarSolid className="w-5 h-5" />,
    },
    {
      id: 'templates',
      label: 'Подложки',
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
      id: 'automations',
      label: 'Лид-магниты',
      icon: <ChatBubbleLeftRightIcon className="w-5 h-5" />,
      iconActive: <ChatBubbleLeftRightSolid className="w-5 h-5" />,
    },
    {
      id: 'history',
      label: 'История',
      icon: <ClockIcon className="w-5 h-5" />,
      iconActive: <ClockSolid className="w-5 h-5" />,
    },
    {
      id: 'audio',
      label: 'Аудио',
      icon: <MusicalNoteIcon className="w-5 h-5" />,
      iconActive: <MusicalNoteSolid className="w-5 h-5" />,
    },
    {
      id: 'accounts',
      label: 'Аккаунты',
      icon: <UserGroupIcon className="w-5 h-5" />,
      iconActive: <UserGroupSolid className="w-5 h-5" />,
    },
    {
      id: 'settings',
      label: 'Настройки',
      icon: <Cog6ToothIcon className="w-5 h-5" />,
      iconActive: <CogSolid className="w-5 h-5" />,
    },
  ];

  const handleSelectAccount = (account: InstagramAccount) => {
    setSelectedAccount(account);
    setShowAccountDropdown(false);
  };

  return (
    <div className={`${collapsed ? 'w-20' : 'w-64'} bg-white border-r border-gray-200 flex flex-col h-screen sticky top-0 transition-all duration-200`}>
      <div className="p-3 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3 h-7">
          {!collapsed && (
            <span className="text-2xs font-semibold text-gray-400 uppercase tracking-wider pl-1">
              Профиль
            </span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 hover:bg-gray-100 rounded-md transition-colors text-gray-400 hover:text-gray-600"
            title={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
          >
            <ChevronLeftIcon className={`w-4 h-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {loading ? (
          <div className="h-14 bg-gray-100 rounded-lg animate-pulse" />
        ) : accounts.length === 0 ? (
          <button
            onClick={() => onViewChange('accounts')}
            className={`w-full p-3 border border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-teal-500 hover:text-teal-700 hover:bg-teal-50/60 transition-colors ${collapsed ? 'px-2' : ''}`}
          >
            <span className="text-sm">{collapsed ? '+' : '+ Добавить аккаунт'}</span>
          </button>
        ) : (
          <div className="relative">
            <button
              onClick={() => !collapsed && setShowAccountDropdown(!showAccountDropdown)}
              className={`w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-50 transition-colors ${collapsed ? 'justify-center' : ''}`}
            >
              <div className="w-9 h-9 rounded-lg bg-teal-600 flex items-center justify-center text-white font-semibold text-base flex-shrink-0">
                {selectedAccount?.username?.charAt(0).toUpperCase() || 'A'}
              </div>
              {!collapsed && (
                <>
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      @{selectedAccount?.username || 'Выберите'}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      <span className="text-2xs text-gray-500">Активен</span>
                    </div>
                  </div>
                  <ChevronDownIcon className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${showAccountDropdown ? 'rotate-180' : ''}`} />
                </>
              )}
            </button>

            {showAccountDropdown && !collapsed && (
              <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
                <div className="px-3 pt-2.5 pb-1.5">
                  <span className="text-2xs font-semibold text-gray-400 uppercase tracking-wider">
                    Переключить аккаунт
                  </span>
                </div>
                <div className="max-h-64 overflow-y-auto p-1.5">
                  {accounts.map((account) => {
                    const isSelected = selectedAccount?.id === account.id;
                    return (
                      <button
                        key={account.id}
                        onClick={() => handleSelectAccount(account)}
                        className={`w-full flex items-center gap-2.5 p-2 rounded-lg transition-colors ${
                          isSelected ? 'bg-teal-50' : 'hover:bg-gray-50'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-semibold text-white flex-shrink-0 ${
                          isSelected ? 'bg-teal-600' : 'bg-gray-400'
                        }`}>
                          {account.username.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <p className={`text-sm font-medium truncate ${isSelected ? 'text-teal-900' : 'text-gray-900'}`}>
                            @{account.username}
                          </p>
                          <span className="text-2xs text-gray-500">
                            {account.is_active ? 'Активен' : 'Отключен'}
                          </span>
                        </div>
                        {isSelected && <CheckIcon className="w-4 h-4 text-teal-600 flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className={`px-3 pt-4 pb-2 ${collapsed ? 'flex justify-center' : ''}`}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center flex-shrink-0">
            <SparklesSolid className="w-4 h-4 text-white" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-gray-900 leading-tight">ViralReel</h1>
              <p className="text-2xs text-gray-400 leading-tight">AI Контент Студия</p>
            </div>
          )}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-2">
        <div className="space-y-0.5">
          {navItems.map((item) => {
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-teal-50 text-teal-800'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                } ${collapsed ? 'justify-center px-2' : ''}`}
                title={collapsed ? item.label : undefined}
              >
                <span className={`relative flex-shrink-0 ${isActive ? 'text-teal-600' : 'text-gray-400'}`}>
                  {isActive ? item.iconActive : item.icon}
                  {item.id === 'batch' && batchRunning && collapsed && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
                  )}
                </span>
                {!collapsed && (
                  <>
                    <span className="truncate">{item.label}</span>
                    {item.id === 'batch' && batchRunning && batchProgress && (
                      <span className="ml-auto tabular text-2xs font-medium text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded-md">
                        {batchProgress.completed}/{batchProgress.total}
                      </span>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      <div className="p-3 border-t border-gray-100">
        <div className={`flex items-center gap-2.5 ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-600 flex-shrink-0">
            {userEmail.charAt(0).toUpperCase()}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-600 truncate">{userEmail}</p>
            </div>
          )}
          <button
            onClick={onSignOut}
            className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0"
            title="Выйти"
          >
            <ArrowRightOnRectangleIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showAccountDropdown && !collapsed && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowAccountDropdown(false)}
        />
      )}
    </div>
  );
};

export default Sidebar;
