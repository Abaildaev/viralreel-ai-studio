import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, Profile } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<{ error: Error | null }>;
  loginAsDemo: (email?: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOCAL_STORAGE_DEMO_KEY = 'viralreel_demo_user';
const DEMO_MODE = import.meta.env.VITE_ENABLE_DEMO_MODE === 'true';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (data) {
        setProfile(data);
      }
    } catch {
      /* Ignore offline profile fetch errors */
    }
  };

  const setDemoUser = (email: string = 'demo@viralreel.io') => {
    if (!DEMO_MODE) return;
    const demoUser = {
      id: '00000000-0000-0000-0000-000000000000',
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: new Date().toISOString(),
      email,
    } as User;

    const demoProfile: Profile = {
      id: demoUser.id,
      email: demoUser.email!,
      ig_user_id: null,
      ig_access_token: null,
      timezone: 'UTC',
      publish_start_hour: 9,
      publish_end_hour: 21,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setUser(demoUser);
    setProfile(demoProfile);
    setSession({
      access_token: 'demo-token',
      refresh_token: 'demo-refresh',
      expires_in: 3600,
      token_type: 'bearer',
      user: demoUser,
    });
    localStorage.setItem(LOCAL_STORAGE_DEMO_KEY, email);
  };

  useEffect(() => {
    const storedDemoEmail = DEMO_MODE ? localStorage.getItem(LOCAL_STORAGE_DEMO_KEY) : null;

    const initAuth = async () => {
      try {
        const timeoutPromise = new Promise<{ data: { session: null } }>((resolve) =>
          setTimeout(() => resolve({ data: { session: null } }), 2000)
        );

        const res = await Promise.race([
          supabase.auth.getSession(),
          timeoutPromise,
        ]);

        const session = res?.data?.session;

        if (session?.user) {
          setSession(session);
          setUser(session.user);
          fetchProfile(session.user.id);
        } else if (storedDemoEmail && DEMO_MODE) {
          setDemoUser(storedDemoEmail);
        } else {
          setUser(null);
          setProfile(null);
          setSession(null);
        }
      } catch {
        if (storedDemoEmail && DEMO_MODE) {
          setDemoUser(storedDemoEmail);
        } else {
          setUser(null);
          setProfile(null);
          setSession(null);
        }
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    try {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (session?.user) {
          setSession(session);
          setUser(session.user);
          fetchProfile(session.user.id);
          return;
        }

        // Fired on subscribe as well; initAuth above owns the initial state.
        if (event === 'INITIAL_SESSION') return;

        // The demo user is local-only, so it has no Supabase session to lose.
        if (DEMO_MODE && localStorage.getItem(LOCAL_STORAGE_DEMO_KEY)) return;

        // Signed out here or in another tab, or the refresh token expired —
        // without this the app stays "logged in" while every request fails.
        setSession(null);
        setUser(null);
        setProfile(null);
      });
      return () => subscription.unsubscribe();
    } catch {
      /* ignore auth change subscription errors */
    }
  }, []);

  const signUp = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      return { error: null };
    } catch (err: any) {
      return { error: err };
    }
  };

  const signIn = async (email: string, password: string) => {
    // Explicit demo credentials check when DEMO_MODE flag is enabled
    if (DEMO_MODE && (email === 'demo@viralreel.ai' || email === 'demo@example.com')) {
      setDemoUser(email);
      return { error: null };
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return { error: null };
    } catch (err: any) {
      return { error: err };
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
    localStorage.removeItem(LOCAL_STORAGE_DEMO_KEY);
    setUser(null);
    setProfile(null);
    setSession(null);
  };

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) return { error: new Error('Not authenticated') };

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (error) throw error;
    } catch (err) {
      // Report the failure instead of showing a saved state the database
      // never accepted.
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }

    setProfile(prev => (prev ? { ...prev, ...updates } : null));
    return { error: null };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        loading,
        signUp,
        signIn,
        signOut,
        updateProfile,
        loginAsDemo: setDemoUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
