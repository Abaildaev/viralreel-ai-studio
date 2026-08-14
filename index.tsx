import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/index.css';
import MainApp from './App';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AccountProvider } from './contexts/AccountContext';
import { BatchGenerationProvider } from './contexts/BatchGenerationContext';
import { ModalProvider } from './contexts/ModalContext';
import AuthPage from './pages/AuthPage';
import { ArrowPathIcon } from '@heroicons/react/24/solid';

const AppWithAuth: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <ArrowPathIcon className="w-7 h-7 text-teal-600 animate-spin" />
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
      <ModalProvider>
        <AppWithAuth />
      </ModalProvider>
    </AuthProvider>
  </React.StrictMode>
);
