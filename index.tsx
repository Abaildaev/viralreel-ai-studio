import React from 'react';
import ReactDOM from 'react-dom/client';
import MainApp from './App';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AccountProvider } from './contexts/AccountContext';
import { BatchGenerationProvider } from './contexts/BatchGenerationContext';
import AuthPage from './pages/AuthPage';
import { ArrowPathIcon } from '@heroicons/react/24/solid';

const AppWithAuth: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <ArrowPathIcon className="w-8 h-8 text-cyan-500 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <AccountProvider>
      <BatchGenerationProvider>
        <MainApp />
      </BatchGenerationProvider>
    </AccountProvider>
  );
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AuthProvider>
      <AppWithAuth />
    </AuthProvider>
  </React.StrictMode>
);
