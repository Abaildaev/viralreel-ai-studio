import React, { useState, useEffect, lazy, Suspense } from 'react';
import {
  SparklesIcon,
  ChatBubbleLeftRightIcon,
  CurrencyDollarIcon,
  FilmIcon,
} from '@heroicons/react/24/outline';
import { SkeletonList } from '../components/ui';

const GeneratorPage = lazy(() => import('./GeneratorPage'));
const AiShowcasePage = lazy(() => import('./AiShowcasePage'));
const BudgetReelsPage = lazy(() => import('./BudgetReelsPage'));
const CtaOutroGenerator = lazy(() => import('../components/CtaOutroGenerator'));

export type StudioTab = 'generator' | 'aishowcase' | 'budget' | 'outro';

interface ReelsStudioPageProps {
  initialTab?: StudioTab;
}

interface TabItem {
  id: StudioTab;
  label: string;
  badge?: string;
  icon: React.ReactNode;
  description: string;
}

const STUDIO_TABS: TabItem[] = [
  {
    id: 'generator',
    label: 'Генератор Reels',
    icon: <SparklesIcon className="h-4 w-4" />,
    description: 'AI-генерация хуков и наложений на видео',
  },
  {
    id: 'aishowcase',
    label: 'AI Showcase',
    icon: <ChatBubbleLeftRightIcon className="h-4 w-4" />,
    description: 'Карточки в стиле ChatGPT, Claude, Gemini',
  },
  {
    id: 'budget',
    label: 'Бюджет Reels',
    icon: <CurrencyDollarIcon className="h-4 w-4" />,
    description: 'Пакетная генерация на подложках',
  },
  {
    id: 'outro',
    label: 'CTA Концовки',
    badge: 'Новинка',
    icon: <FilmIcon className="h-4 w-4" />,
    description: 'Склейка готового видео с призывом «Пиши "слово"»',
  },
];

export const ReelsStudioPage: React.FC<ReelsStudioPageProps> = ({ initialTab = 'generator' }) => {
  const [activeTab, setActiveTab] = useState<StudioTab>(() => {
    // Check URL hash if specific sub-tab requested (e.g. #outro, #budget, #aishowcase, #generator)
    const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
    if (hash === 'outro' || hash === 'aishowcase' || hash === 'budget' || hash === 'generator') {
      return hash as StudioTab;
    }
    return initialTab;
  });

  // Sync with address bar hash changes
  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
      if (hash === 'outro' || hash === 'aishowcase' || hash === 'budget' || hash === 'generator') {
        setActiveTab(hash as StudioTab);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const handleTabChange = (tabId: StudioTab) => {
    setActiveTab(tabId);
    window.location.hash = `#/${tabId}`;
  };

  return (
    <div className="min-h-screen bg-canvas">
      {/* Top Studio Header & Sub-Navigation Tabs */}
      <div className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-white text-xs font-bold shadow-sm">
                RS
              </span>
              <div>
                <h1 className="text-sm font-bold text-gray-900 leading-none">
                  Студия Reels
                </h1>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Все инструменты генерации и монтажа роликов
                </p>
              </div>
            </div>

            {/* Segmented Pill Tabs */}
            <div className="flex overflow-x-auto rounded-xl bg-gray-100 p-1 scrollbar-none">
              {STUDIO_TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    className={`relative flex flex-shrink-0 items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-950/5'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <span className={isActive ? 'text-brand-600' : 'text-gray-400'}>
                      {tab.icon}
                    </span>
                    <span>{tab.label}</span>
                    {tab.badge && (
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.2 text-[10px] font-bold text-amber-800">
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Main Studio View Content */}
      <div className="py-2">
        <Suspense
          fallback={
            <div className="p-4 sm:p-6 lg:p-8">
              <SkeletonList rows={4} className="mx-auto max-w-5xl" />
            </div>
          }
        >
          {activeTab === 'generator' && <GeneratorPage />}
          {activeTab === 'aishowcase' && <AiShowcasePage />}
          {activeTab === 'budget' && <BudgetReelsPage />}
          {activeTab === 'outro' && <CtaOutroGenerator />}
        </Suspense>
      </div>
    </div>
  );
};

export default ReelsStudioPage;
