import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase, INSTAGRAM_ACCOUNT_COLUMNS } from '../lib/supabase';
import { InstagramAccount } from '../types';
import { useAuth } from './AuthContext';

interface AccountContextType {
  accounts: InstagramAccount[];
  selectedAccount: InstagramAccount | null;
  setSelectedAccount: (account: InstagramAccount | null) => void;
  loading: boolean;
  refreshAccounts: () => Promise<void>;
}

const AccountContext = createContext<AccountContextType | undefined>(undefined);

/*
  The chosen account now decides what most of the app shows — automations,
  Telegram bot and funnels, scheduler, templates. Forgetting it on reload would
  drop the reader back onto the first account and make their own scenarios look
  like they had vanished, so the id outlives the tab.
*/
const SELECTED_ACCOUNT_KEY = 'viralreel_selected_account_id';

function readStoredAccountId(): string | null {
  try {
    return localStorage.getItem(SELECTED_ACCOUNT_KEY);
  } catch {
    return null;
  }
}

function storeAccountId(accountId: string | null): void {
  try {
    if (accountId) localStorage.setItem(SELECTED_ACCOUNT_KEY, accountId);
    else localStorage.removeItem(SELECTED_ACCOUNT_KEY);
  } catch {
    /* private mode or blocked storage — the selection is simply not remembered */
  }
}

export const AccountProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<InstagramAccount[]>([]);
  const [selectedAccount, setSelectedAccountState] = useState<InstagramAccount | null>(null);
  const [loading, setLoading] = useState(true);

  const setSelectedAccount = (account: InstagramAccount | null) => {
    setSelectedAccountState(account);
    storeAccountId(account?.id ?? null);
  };

  const loadAccounts = async () => {
    if (!user) {
      setAccounts([]);
      // Signing out clears the list, not the preference: the same person
      // signing back in should land on the account they were working with.
      setSelectedAccountState(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const timeoutPromise = new Promise<{ data: null; error: Error }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: new Error('Timeout') }), 2000)
      );

      const res = await Promise.race([
        supabase
          .from('instagram_accounts')
          .select(INSTAGRAM_ACCOUNT_COLUMNS)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        timeoutPromise,
      ]);

      const { data, error } = res as any;

      if (!error && data) {
        setAccounts(data);
        /*
          Keep the selected id, but replace the object itself with the fresh
          row. The account page refreshes this list after verification and the
          row may then contain a new profile_picture_url. Keeping the old
          object made the main card show the avatar while the sidebar still
          rendered the initial letter.
        */
        const wantedId = selectedAccount?.id ?? readStoredAccountId();
        const refreshedSelected = wantedId
          ? data.find((account: InstagramAccount) => account.id === wantedId)
          : null;
        const nextSelected = refreshedSelected || data.find((account: InstagramAccount) => account.is_active) || data[0] || null;
        setSelectedAccount(nextSelected);
      }
    } catch {
      /* ignore offline/unreachable error */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, [user]);

  const refreshAccounts = async () => {
    await loadAccounts();
  };

  return (
    <AccountContext.Provider value={{
      accounts,
      selectedAccount,
      setSelectedAccount,
      loading,
      refreshAccounts,
    }}>
      {children}
    </AccountContext.Provider>
  );
};

export const useAccount = () => {
  const context = useContext(AccountContext);
  if (context === undefined) {
    throw new Error('useAccount must be used within AccountProvider');
  }
  return context;
};
