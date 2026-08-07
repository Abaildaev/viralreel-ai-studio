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
      label: '✨ AI Showcase',
      icon: <SparklesIcon className="w-5 h-5 text-amber-500" />,
      iconActive: <SparklesSolid className="w-5 h-5 text-amber-500" />,
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
    <div className={`${collapsed ? 'w-20' : 'w-72'} bg-white border-r border-gray-200 flex flex-col h-screen sticky top-0 transition-all duration-300`}>
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-4">
          {!collapsed && (
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Текущий профиль
            </span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-600"
          >
            <ChevronLeftIcon className={`w-4 h-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {loading ? (
          <div className="h-16 bg-gray-100 rounded-xl animate-pulse" />
        ) : accounts.length === 0 ? (
          <button
            onClick={() => onViewChange('accounts')}
            className={`w-full p-3 border-2 border-dashed border-gray-200 rounded-xl hover:border-teal-500 hover:bg-teal-50 transition-colors ${collapsed ? 'px-2' : ''}`}
          >
            {collapsed ? (
              <div className="w-8 h-8 mx-auto rounded-lg bg-gray-100 flex items-center justify-center text-gray-400">
                +
              </div>
            ) : (
              <span className="text-sm text-gray-500">+ Добавить аккаунт</span>
            )}
          </button>
        ) : (
          <div className="relative">
            <button
              onClick={() => !collapsed && setShowAccountDropdown(!showAccountDropdown)}
              className={`w-full flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-xl hover:border-gray-300 transition-colors ${collapsed ? 'justify-center px-2' : ''}`}
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-blue-500/20 flex-shrink-0">
                {selectedAccount?.username?.charAt(0).toUpperCase() || 'A'}
              </div>
              {!collapsed && (
                <>
                  <div className="flex-1 text-left min-w-0">
                    <p className="font-semibold text-gray-900 truncate">
                      @{selectedAccount?.username || 'Выберите'}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-xs text-green-600">Активен</span>
                    </div>
                  </div>
                  <ChevronDownIcon className={`w-5 h-5 text-gray-400 transition-transform flex-shrink-0 ${showAccountDropdown ? 'rotate-180' : ''}`} />
                </>
              )}
            </button>

            {showAccountDropdown && !collapsed && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
                <div className="p-2 border-b border-gray-100">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2">
                    Быстрое переключение
                  </span>
                </div>
                <div className="max-h-64 overflow-y-auto p-2">
                  {accounts.map((account) => (
                    <button
                      key={account.id}
                      onClick={() => handleSelectAccount(account)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${
                        selectedAccount?.id === account.id
                          ? 'bg-gray-900 text-white'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg flex-shrink-0 ${
                        selectedAccount?.id === account.id
                          ? 'bg-blue-500 text-white'
                          : 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/20'
                      }`}>
                        {account.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <p className={`font-semibold truncate ${selectedAccount?.id === account.id ? 'text-white' : 'text-gray-900'}`}>
                          @{account.username}
                        </p>
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${account.is_active ? 'bg-green-500' : 'bg-gray-400'}`} />
                          <span className={`text-xs ${
                            selectedAccount?.id === account.id
                              ? (account.is_active ? 'text-green-300' : 'text-gray-400')
                              : (account.is_active ? 'text-green-600' : 'text-gray-400')
                          }`}>
                            {account.is_active ? 'Активен' : 'Отключен'}
                          </span>
                        </div>
                      </div>
                      {selectedAccount?.id === account.id && (
                        <CheckIcon className="w-5 h-5 text-white flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {!collapsed && (
        <div className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-teal-500/20">
              <SparklesSolid className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">ViralReel</h1>
              <p className="text-xs text-gray-500">AI Контент Студия</p>
            </div>
          </div>
        </div>
      )}

      <nav className="flex-1 px-3 py-4">
        <div className="space-y-1">
          {navItems.map((item) => {
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-teal-50 text-teal-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                } ${collapsed ? 'justify-center px-2' : ''}`}
                title={collapsed ? item.label : undefined}
              >
                <span className={`relative ${isActive ? 'text-teal-600' : ''}`}>
                  {isActive ? item.iconActive : item.icon}
                  {item.id === 'batch' && batchRunning && collapsed && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-teal-500 animate-pulse" />
                  )}
                </span>
                {!collapsed && (
                  <>
                    {item.label}
                    {item.id === 'batch' && batchRunning && batchProgress ? (
                      <span className="ml-auto text-[10px] font-mono text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded-md">
                        {batchProgress.completed}/{batchProgress.total}
                      </span>
                    ) : isActive ? (
                      <div className="ml-auto w-1.5 h-1.5 rounded-full bg-teal-500" />
                    ) : null}
                  </>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      <div className="p-4 border-t border-gray-100">
        <div className={`flex items-center gap-3 px-3 py-2 ${collapsed ? 'justify-center px-0' : ''}`}>
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center text-sm font-bold text-gray-600 flex-shrink-0">
            {userEmail.charAt(0).toUpperCase()}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{userEmail}</p>
            </div>
          )}
          <button
            onClick={onSignOut}
            className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
            title="Выйти"
          >
            <ArrowRightOnRectangleIcon className="w-5 h-5" />
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
