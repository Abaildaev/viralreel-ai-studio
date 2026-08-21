import React, { lazy, Suspense, useState } from 'react';
import Sidebar, { MobileTopBar, viewTitle } from './components/Sidebar';
import { useAuth } from './contexts/AuthContext';
import { SkeletonList } from './components/ui';
import { useAppView } from './hooks/useAppView';
import ErrorBoundary from './components/ErrorBoundary';

const ReelsStudioPage = lazy(() => import('./pages/ReelsStudioPage'));
const AccountsPage = lazy(() => import('./pages/AccountsPage'));
const AutomationsPage = lazy(() => import('./pages/AutomationsPage'));
const TelegramPage = lazy(() => import('./pages/TelegramPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AudioPage = lazy(() => import('./pages/AudioPage'));
const TemplatesPage = lazy(() => import('./pages/TemplatesPage'));
const BatchGeneratorPage = lazy(() => import('./pages/BatchGeneratorPage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
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
          {/* Scoped to the page rather than the whole app: a section that fails
              to render should not take the navigation with it, and keying on
              the section clears the error as soon as the reader moves away. */}
          <ErrorBoundary resetKey={currentView} title={`Раздел «${viewTitle(currentView)}» не открылся`}>
          <Suspense
            fallback={
              <div className="p-4 sm:p-6 lg:p-8">
                <SkeletonList rows={4} className="mx-auto max-w-5xl" />
              </div>
            }
          >
            {(currentView === 'studio' || currentView === 'generator' || currentView === 'aishowcase' || currentView === 'budget' || currentView === 'outro') && (
              <ReelsStudioPage
                initialTab={
                  currentView === 'aishowcase' ? 'aishowcase'
                  : currentView === 'budget' ? 'budget'
                  : currentView === 'outro' ? 'outro'
                  : 'generator'
                }
              />
            )}
            {currentView === 'accounts' && <AccountsPage />}
            {currentView === 'automations' && <AutomationsPage />}
            {currentView === 'telegram' && <TelegramPage />}
            {currentView === 'settings' && <SettingsPage />}
            {currentView === 'scheduler' && <InstagramScheduler />}
            {currentView === 'audio' && <AudioPage />}
            {currentView === 'templates' && <TemplatesPage />}
            {currentView === 'batch' && <BatchGeneratorPage />}
            {currentView === 'history' && <HistoryPage />}
          </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
};

export default MainApp;
