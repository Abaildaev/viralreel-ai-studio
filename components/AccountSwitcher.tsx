import React, { useEffect, useRef, useState } from 'react';
import { CheckIcon, ChevronUpDownIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import { useAccount } from '../contexts/AccountContext';
import { AppView } from '../types';
import AccountAvatar from './AccountAvatar';
import { cn } from './ui';

interface AccountSwitcherProps {
  /** Icon-only presentation for the collapsed desktop rail. */
  collapsed?: boolean;
  onNavigate: (view: AppView) => void;
}

/**
 * Picks which connected Instagram account the app is working with.
 *
 * Templates, the scheduler, history, budget reels and the generator all scope
 * themselves to `selectedAccount`, but nothing ever called `setSelectedAccount`:
 * the context auto-picked the first active account on load and that was final.
 * Anyone with two accounts was locked to whichever one happened to win.
 */
export const AccountSwitcher: React.FC<AccountSwitcherProps> = ({ collapsed = false, onNavigate }) => {
  const { accounts, selectedAccount, setSelectedAccount, loading } = useAccount();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (loading) {
    return <div className="mx-2.5 mb-2 h-11 animate-pulse rounded-xl bg-gray-100" />;
  }

  // Without an account most of the app has nothing to scope to, so this points
  // at the fix rather than rendering an empty control.
  if (accounts.length === 0) {
    return (
      <button
        type="button"
        onClick={() => onNavigate('accounts')}
        title="Подключить Instagram-аккаунт"
        className={cn(
          'mx-2.5 mb-2 flex items-center gap-2.5 rounded-xl border border-dashed border-gray-300 px-3 py-2.5 text-left transition-colors hover:border-brand-400 hover:bg-brand-50',
          collapsed && 'lg:justify-center lg:px-0',
        )}
      >
        <UserGroupIcon className="h-5 w-5 flex-shrink-0 text-gray-400" />
        <span className={cn('truncate text-xs font-medium text-gray-600', collapsed && 'lg:hidden')}>
          Подключить аккаунт
        </span>
      </button>
    );
  }

  return (
    <div ref={containerRef} className="relative mx-2.5 mb-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={selectedAccount ? `@${selectedAccount.username}` : 'Выберите аккаунт'}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-2.5 py-2 text-left transition-colors hover:border-gray-300 hover:bg-gray-50',
          collapsed && 'lg:justify-center lg:border-transparent lg:px-0',
        )}
      >
        <AccountAvatar account={selectedAccount} size="sm" />
        <span className={cn('min-w-0 flex-1', collapsed && 'lg:hidden')}>
          <span className="block truncate text-xs font-semibold text-gray-900">
            @{selectedAccount?.username ?? 'не выбран'}
          </span>
          <span className="block truncate text-[10px] text-gray-500">
            {accounts.length > 1 ? `${accounts.length} аккаунта подключено` : 'Активный аккаунт'}
          </span>
        </span>
        <ChevronUpDownIcon
          className={cn('h-4 w-4 flex-shrink-0 text-gray-400', collapsed && 'lg:hidden')}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="animate-in fade-in absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg duration-100 lg:min-w-[220px]"
        >
          {accounts.map((account) => {
            const isSelected = account.id === selectedAccount?.id;
            return (
              <button
                key={account.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  setSelectedAccount(account);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-gray-50"
              >
                <AccountAvatar account={account} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-gray-900">
                    @{account.username}
                  </span>
                  {!account.is_active && (
                    <span className="block text-[10px] text-amber-600">отключён</span>
                  )}
                </span>
                {isSelected && <CheckIcon className="h-4 w-4 flex-shrink-0 text-brand-600" />}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => {
              onNavigate('accounts');
              setOpen(false);
            }}
            className="mt-1 w-full border-t border-gray-100 px-2 py-2 text-left text-xs font-medium text-gray-500 transition-colors hover:text-gray-900"
          >
            Управлять аккаунтами →
          </button>
        </div>
      )}
    </div>
  );
};

export default AccountSwitcher;
