import React, { useEffect, useState } from 'react';
import { AppView } from '../types';
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
  Bars3Icon,
  XMarkIcon,
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
  MusicalNoteIcon as MusicalNoteSolid,
  Cog6ToothIcon as Cog6ToothSolid,
} from '@heroicons/react/24/solid';
import { Button, cn, Logo } from './ui';
import AccountSwitcher from './AccountSwitcher';

interface NavItem {
  id: AppView;
  label: string;
  icon: React.ReactNode;
  iconActive: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'generator', label: 'Генератор Reels', icon: <HomeIcon className="h-5 w-5" />, iconActive: <HomeSolid className="h-5 w-5" /> },
  { id: 'automations', label: 'Автоматизации & CRM', icon: <SparklesIcon className="h-5 w-5" />, iconActive: <SparklesSolid className="h-5 w-5" /> },
  { id: 'scheduler', label: 'Планировщик постов', icon: <CalendarDaysIcon className="h-5 w-5" />, iconActive: <CalendarSolid className="h-5 w-5" /> },
  { id: 'budget', label: 'Бюджет Reels', icon: <CurrencyDollarIcon className="h-5 w-5" />, iconActive: <CurrencyDollarSolid className="h-5 w-5" /> },
  { id: 'aishowcase', label: 'AI Showcase', icon: <ChatBubbleLeftRightIcon className="h-5 w-5" />, iconActive: <ChatBubbleLeftRightSolid className="h-5 w-5" /> },
  { id: 'templates', label: 'Шаблоны и подложки', icon: <FilmIcon className="h-5 w-5" />, iconActive: <FilmSolid className="h-5 w-5" /> },
  { id: 'batch', label: 'Автогенератор', icon: <BoltIcon className="h-5 w-5" />, iconActive: <BoltSolid className="h-5 w-5" /> },
  { id: 'history', label: 'История генераций', icon: <ClockIcon className="h-5 w-5" />, iconActive: <ClockSolid className="h-5 w-5" /> },
  { id: 'audio', label: 'Аудио-треки', icon: <MusicalNoteIcon className="h-5 w-5" />, iconActive: <MusicalNoteSolid className="h-5 w-5" /> },
  { id: 'accounts', label: 'Аккаунты Instagram', icon: <UserGroupIcon className="h-5 w-5" />, iconActive: <UserGroupSolid className="h-5 w-5" /> },
  { id: 'settings', label: 'Настройки', icon: <Cog6ToothIcon className="h-5 w-5" />, iconActive: <Cog6ToothSolid className="h-5 w-5" /> },
];

/** The mobile top bar has no room for the rail, so it names the open section instead. */
export const viewTitle = (view: AppView): string =>
  NAV_ITEMS.find((item) => item.id === view)?.label ?? 'ViralReel';

interface SidebarProps {
  currentView: AppView;
  onViewChange: (view: AppView) => void;
  userEmail: string;
  onSignOut: () => void;
  /** Drawer state below `lg`. Ignored at desktop width, where the rail is static. */
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onViewChange,
  userEmail,
  onSignOut,
  mobileOpen,
  onMobileClose,
}) => {
  const { running: batchRunning } = useBatchGeneration();

  // Collapsing applies only to the desktop rail; the drawer is either open or
  // shut, so the two states never interact.
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
        // A blocked localStorage should not break the toggle.
      }
      return next;
    });
  };

  // A drawer that cannot be dismissed from the keyboard is a trap.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onMobileClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen, onMobileClose]);

  // Scrolling the page behind an open drawer is disorienting on touch.
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  const handleNavigate = (view: AppView) => {
    onViewChange(view);
    onMobileClose();
  };

  return (
    <>
      {mobileOpen && (
        <div
          className="animate-in fade-in fixed inset-0 z-40 bg-gray-900/40 backdrop-blur-sm duration-150 lg:hidden"
          onClick={onMobileClose}
          role="presentation"
        />
      )}

      <aside
        className={cn(
          'flex h-screen select-none flex-col border-r border-gray-200 bg-white',
          // Off-canvas drawer below lg, static rail from lg up.
          'fixed inset-y-0 left-0 z-50 w-72 transition-transform duration-200',
          'lg:sticky lg:top-0 lg:z-30 lg:translate-x-0 lg:transition-all',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          collapsed ? 'lg:w-[70px]' : 'lg:w-64',
        )}
        aria-label="Основная навигация"
      >
        <div className="flex items-center justify-between gap-2 border-b border-gray-100 p-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <Logo className="h-9 w-9 flex-shrink-0" />
            <p className={cn('truncate text-sm font-semibold text-gray-900', collapsed && 'lg:hidden')}>
              ViralReel Studio
            </p>
          </div>

          <Button
            variant="ghost"
            size="sm"
            iconOnly
            onClick={toggleCollapsed}
            title={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
            className="hidden lg:inline-flex"
            icon={collapsed ? <ChevronRightIcon className="h-4 w-4" /> : <ChevronLeftIcon className="h-4 w-4" />}
          />

          <Button
            variant="ghost"
            size="sm"
            iconOnly
            onClick={onMobileClose}
            title="Закрыть меню"
            className="lg:hidden"
            icon={<XMarkIcon className="h-5 w-5" />}
          />
        </div>

        {/* Everything below is scoped to this account, so the switcher sits
            above the navigation rather than buried on the accounts page. */}
        <div className="pt-3">
          <AccountSwitcher collapsed={collapsed} onNavigate={handleNavigate} />
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-2.5 pb-3">
          {NAV_ITEMS.map((item) => {
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavigate(item.id)}
                aria-current={isActive ? 'page' : undefined}
                title={collapsed ? item.label : undefined}
                className={cn(
                  'relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs transition-colors',
                  collapsed && 'lg:justify-center lg:px-0',
                  isActive
                    ? 'bg-brand-600 font-semibold text-white'
                    : 'font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                )}
              >
                <span className={cn('flex-shrink-0', isActive ? 'text-white' : 'text-gray-400')}>
                  {isActive ? item.iconActive : item.icon}
                </span>

                <span className={cn('truncate text-left', collapsed && 'lg:hidden')}>
                  {item.label}
                </span>

                {item.id === 'batch' && batchRunning && (
                  <span
                    title="Идёт пакетная генерация"
                    className={cn(
                      'h-2 w-2 flex-shrink-0 animate-pulse rounded-full bg-green-500',
                      collapsed ? 'ml-auto lg:absolute lg:right-1.5 lg:top-1.5 lg:ml-0' : 'ml-auto',
                    )}
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-gray-100 bg-gray-50/60 p-3">
          <div className={cn('flex items-center justify-between gap-2', collapsed && 'lg:justify-center')}>
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                {userEmail ? userEmail.slice(0, 1).toUpperCase() : '—'}
              </div>
              <p className={cn('truncate text-xs font-medium text-gray-700', collapsed && 'lg:hidden')}>
                {userEmail || 'Пользователь'}
              </p>
            </div>

            <Button
              variant="ghost"
              size="sm"
              iconOnly
              onClick={onSignOut}
              title="Выйти"
              className={cn('text-gray-400 hover:bg-red-50 hover:text-red-600', collapsed && 'lg:hidden')}
              icon={<ArrowRightOnRectangleIcon className="h-4 w-4" />}
            />
          </div>
        </div>
      </aside>
    </>
  );
};

interface MobileTopBarProps {
  title: string;
  onOpenNav: () => void;
}

/** Below `lg` the rail is off-canvas, so this is the only way back to it. */
export const MobileTopBar: React.FC<MobileTopBarProps> = ({ title, onOpenNav }) => (
  <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-gray-200 bg-white/90 px-4 py-2.5 backdrop-blur lg:hidden">
    <Button
      variant="ghost"
      iconOnly
      onClick={onOpenNav}
      title="Открыть меню"
      aria-label="Открыть меню"
      icon={<Bars3Icon className="h-5 w-5" />}
    />
    <span className="min-w-0 truncate text-sm font-semibold text-gray-900">{title}</span>
    <Logo className="ml-auto h-7 w-7 flex-shrink-0" />
  </header>
);

export default Sidebar;
