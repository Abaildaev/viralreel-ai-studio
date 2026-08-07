import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
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

export const AccountProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<InstagramAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<InstagramAccount | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAccounts = async () => {
    if (!user) {
      setAccounts([]);
      setSelectedAccount(null);
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
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        timeoutPromise,
      ]);

      const { data, error } = res as any;

      if (!error && data) {
        setAccounts(data);
        if (data.length > 0 && !selectedAccount) {
          const activeAccount = data.find(a => a.is_active) || data[0];
          setSelectedAccount(activeAccount);
        }
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
