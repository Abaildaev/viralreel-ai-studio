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

    </div>
  );
};

export default MainApp;
