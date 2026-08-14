import React, { lazy, Suspense, useState } from 'react';
import { AppView } from './types';
import Sidebar from './components/Sidebar';
import { useAuth } from './contexts/AuthContext';

const AccountsPage = lazy(() => import('./pages/AccountsPage'));
const AutomationsPage = lazy(() => import('./pages/AutomationsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AudioPage = lazy(() => import('./pages/AudioPage'));
const TemplatesPage = lazy(() => import('./pages/TemplatesPage'));
const BatchGeneratorPage = lazy(() => import('./pages/BatchGeneratorPage'));
const BudgetReelsPage = lazy(() => import('./pages/BudgetReelsPage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const AiShowcasePage = lazy(() => import('./pages/AiShowcasePage'));
const GeneratorPage = lazy(() => import('./pages/GeneratorPage'));
const InstagramScheduler = lazy(() => import('./components/InstagramScheduler'));

const MainApp: React.FC = () => {
  const { user, signOut } = useAuth();
  const [currentView, setCurrentView] = useState<AppView>('generator');

  return (
    <div className="min-h-screen bg-canvas text-gray-900 flex">
      <Sidebar
        currentView={currentView}
        onViewChange={setCurrentView}
        userEmail={user?.email || ''}
        onSignOut={signOut}
      />

      <main className="flex-1 min-h-screen overflow-y-auto">
        <Suspense fallback={<div className="p-8 text-gray-500">Загрузка раздела…</div>}>
          {currentView === 'accounts' && <AccountsPage />}
          {currentView === 'automations' && <AutomationsPage />}
          {currentView === 'settings' && <SettingsPage />}
          {currentView === 'scheduler' && <InstagramScheduler />}
          {currentView === 'audio' && <AudioPage />}
          {currentView === 'templates' && <TemplatesPage />}
          {currentView === 'batch' && <BatchGeneratorPage />}
          {currentView === 'history' && <HistoryPage />}
          {currentView === 'budget' && <BudgetReelsPage />}
          {currentView === 'aishowcase' && <AiShowcasePage />}

          {currentView === 'generator' && <GeneratorPage />}
        </Suspense>
      </main>

      {/* Floating ChatPlace Assistant Widget */}
      <button
        type="button"
        onClick={() => setCurrentView('automations')}
        className="fixed bottom-5 right-5 z-40 w-12 h-12 rounded-full bg-[#1E60FF] hover:bg-[#1551E5] text-white flex items-center justify-center shadow-lg shadow-[#1E60FF]/25 hover:shadow-xl hover:scale-105 active:scale-95 transition-all"
        title="ИИ-Менеджер & Чат"
      >
        <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
          <path d="M12 2C6.477 2 2 6.477 2 12c0 1.821.487 3.53 1.338 5L2.1 21.9l5.056-1.208A9.957 9.957 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm-3 11a1 1 0 110-2 1 1 0 010 2zm3 0a1 1 0 110-2 1 1 0 010 2zm3 0a1 1 0 110-2 1 1 0 010 2z" />
        </svg>
      </button>

    </div>
  );
};

export default MainApp;
