import React, { lazy, Suspense, useState } from 'react';
import Sidebar, { MobileTopBar, viewTitle } from './components/Sidebar';
import { useAuth } from './contexts/AuthContext';
import { SkeletonList } from './components/ui';
import { useAppView } from './hooks/useAppView';

const AccountsPage = lazy(() => import('./pages/AccountsPage'));
const AutomationsPage = lazy(() => import('./pages/AutomationsPage'));
const TelegramPage = lazy(() => import('./pages/TelegramPage'));
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
  // The open section lives in the address bar, so every view is linkable and
  // the back button steps through sections instead of leaving the app.
  const { view: currentView, navigate } = useAppView();
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-canvas text-gray-900">
      <Sidebar
        currentView={currentView}
        onViewChange={navigate}
        userEmail={user?.email || ''}
        onSignOut={signOut}
        mobileOpen={navOpen}
        onMobileClose={() => setNavOpen(false)}
      />

      {/* min-w-0 stops a wide table or calendar from stretching the flex row
          and pushing the page sideways. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar title={viewTitle(currentView)} onOpenNav={() => setNavOpen(true)} />

        <main className="min-h-0 flex-1">
          <Suspense
            fallback={
              <div className="p-4 sm:p-6 lg:p-8">
                <SkeletonList rows={4} className="mx-auto max-w-5xl" />
              </div>
            }
          >
            {currentView === 'accounts' && <AccountsPage />}
            {currentView === 'automations' && <AutomationsPage />}
            {currentView === 'telegram' && <TelegramPage />}
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
    </div>
  );
};

export default MainApp;
