import React, { useCallback, useEffect, useState } from 'react';
import {
  ChartBarIcon,
  Cog6ToothIcon,
  FunnelIcon,
  PaperAirplaneIcon,
  PlusIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useConfirm } from '../contexts/ModalContext';
import type {
  LeadMagnet,
  TelegramBot,
  TelegramBroadcast,
  TelegramFunnel,
  TelegramFunnelStats,
  TelegramSubscriber,
} from '../types';
import { Badge, Button, Callout, PageHeader, PageShell, cn } from '../components/ui';
import BotSetupTab from '../components/telegram/BotSetupTab';
import FunnelsTab from '../components/telegram/FunnelsTab';
import FunnelEditorModal, { blankFunnel, defaultSteps } from '../components/telegram/FunnelEditorModal';
import { newStep, type StepDraft } from '../components/telegram/FunnelStepsEditor';
import BroadcastsTab from '../components/telegram/BroadcastsTab';
import BroadcastComposerModal, { blankBroadcast } from '../components/telegram/BroadcastComposerModal';
import SubscribersTab from '../components/telegram/SubscribersTab';
import TelegramAnalyticsTab, { DAYS_SHOWN } from '../components/telegram/TelegramAnalyticsTab';
import {
  cancelBroadcast,
  deleteBroadcast,
  deleteFunnel,
  loadBot,
  loadBroadcasts,
  loadFunnels,
  loadFunnelStats,
  loadFunnelSteps,
  saveFunnelSteps,
  loadSignupDates,
  loadSubscriberTotals,
  loadSubscribers,
  markSignedUp,
  saveBroadcast,
  saveFunnel,
  scheduleBroadcast,
  toFunnelDraft,
  type BroadcastDraft,
  type FunnelDraft,
  type SubscriberTotals,
} from '../services/telegramService';

const EMPTY_TOTALS: SubscriberTotals = {
  started: 0,
  subscribed: 0,
  delivered: 0,
  signedUp: 0,
  fromInstagram: 0,
  blocked: 0,
  active: 0,
  channelLeft: 0,
};

type Tab = 'bot' | 'funnels' | 'broadcasts' | 'subscribers' | 'analytics';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'bot', label: 'Бот', icon: <Cog6ToothIcon className="h-4 w-4" /> },
  { id: 'funnels', label: 'Воронки', icon: <FunnelIcon className="h-4 w-4" /> },
  { id: 'broadcasts', label: 'Рассылки', icon: <PaperAirplaneIcon className="h-4 w-4" /> },
  { id: 'subscribers', label: 'Подписчики', icon: <UserGroupIcon className="h-4 w-4" /> },
  { id: 'analytics', label: 'Аналитика', icon: <ChartBarIcon className="h-4 w-4" /> },
];

function pluralizeRu(count: number, one: string, few: string, many: string): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

export default function TelegramPage() {
  const { user } = useAuth();
  const { confirm, toast } = useConfirm();

  const [activeTab, setActiveTab] = useState<Tab>('bot');
  const [bot, setBot] = useState<TelegramBot | null>(null);
  const [funnels, setFunnels] = useState<TelegramFunnel[]>([]);
  const [stats, setStats] = useState<TelegramFunnelStats[]>([]);
  const [subscribers, setSubscribers] = useState<TelegramSubscriber[]>([]);
  const [totals, setTotals] = useState<SubscriberTotals>(EMPTY_TOTALS);
  const [signupDates, setSignupDates] = useState<Date[]>([]);
  const [broadcasts, setBroadcasts] = useState<TelegramBroadcast[]>([]);
  const [leadMagnets, setLeadMagnets] = useState<LeadMagnet[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [funnelDraft, setFunnelDraft] = useState<FunnelDraft | null>(null);
  const [funnelSteps, setFunnelSteps] = useState<StepDraft[]>([]);
  const [broadcastDraft, setBroadcastDraft] = useState<BroadcastDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoadError(null);

    try {
      const currentBot = await loadBot();
      setBot(currentBot);

      if (!currentBot) {
        setFunnels([]);
        setSubscribers([]);
        setTotals(EMPTY_TOTALS);
        setSignupDates([]);
        setBroadcasts([]);
        setStats([]);
        return;
      }

      const [
        funnelRows,
        subscriberRows,
        totalRow,
        dates,
        broadcastRows,
        statRows,
        magnets,
      ] = await Promise.all([
        loadFunnels(currentBot.id),
        loadSubscribers(currentBot.id),
        loadSubscriberTotals(currentBot.id),
        loadSignupDates(currentBot.id, DAYS_SHOWN),
        loadBroadcasts(currentBot.id),
        loadFunnelStats(),
        supabase.from('lead_magnets').select('*').eq('user_id', user.id),
      ]);

      setFunnels(funnelRows);
      setSubscribers(subscriberRows);
      setTotals(totalRow);
      setSignupDates(dates);
      setBroadcasts(broadcastRows);
      setStats(statRows);
      setLeadMagnets((magnets.data ?? []) as LeadMagnet[]);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [user, refresh]);

  /*
    A send in flight is the one thing on this page that changes without the
    reader touching anything, so the list refreshes itself while it runs — and
    stops the moment nothing is moving.
  */
  useEffect(() => {
    const sending = broadcasts.some((broadcast) => broadcast.status === 'sending');
    if (!sending || !bot) return;

    const timer = setInterval(() => {
      loadBroadcasts(bot.id).then(setBroadcasts).catch(() => undefined);
    }, 5000);
    return () => clearInterval(timer);
  }, [broadcasts, bot]);

  const openNewFunnel = () => {
    if (!bot) return;
    setFunnelDraft(blankFunnel(bot.id));
    setFunnelSteps(defaultSteps());
  };

  /*
    Steps are fetched before the editor opens, not after. The modal seeds its
    own state from `initialSteps` on mount, so opening first and filling in
    afterwards would show whichever funnel was edited last — and then save
    those steps onto this funnel.

    Loaded here rather than with the funnel list because the editor is the only
    place steps are read; a page with twenty funnels should not fetch every
    sequence just to render summaries.
  */
  const openFunnel = async (funnel: TelegramFunnel) => {
    let steps: StepDraft[];

    try {
      const rows = await loadFunnelSteps(funnel.id);
      steps = rows.map((row) => ({
        id: row.id,
        key: row.id,
        position: row.position,
        title: row.title,
        body: row.body,
        button_text: row.button_text,
        button_url: row.button_url,
        delay_minutes: row.delay_minutes,
        is_active: row.is_active,
        attachment_type: row.attachment_type,
        attachment_path: row.attachment_path,
        attachment_name: row.attachment_name,
      }));
    } catch (error) {
      toast({
        message: error instanceof Error ? error.message : 'Не удалось загрузить шаги воронки',
        tone: 'error',
      });
      return;
    }

    setFunnelSteps(steps.length > 0 ? steps : [newStep(1, 0)]);
    setFunnelDraft(toFunnelDraft(funnel));
  };

  const handleSaveFunnel = async (draft: FunnelDraft, steps: StepDraft[]) => {
    if (!user) return;
    setSaving(true);
    try {
      const funnelId = await saveFunnel(draft, user.id);
      await saveFunnelSteps(funnelId, user.id, steps.map((step) => ({
        id: step.id,
        position: step.position,
        title: step.title,
        body: step.body,
        button_text: step.button_text,
        button_url: step.button_url,
        delay_minutes: step.delay_minutes,
        is_active: step.is_active,
        attachment_type: step.attachment_type,
        attachment_path: step.attachment_path,
        attachment_name: step.attachment_name,
      })));
      setFunnelDraft(null);
      await refresh();
      toast(draft.id ? 'Воронка сохранена' : 'Воронка создана');
    } catch (error) {
      toast({
        message: error instanceof Error ? error.message : 'Не удалось сохранить воронку',
        tone: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFunnel = async (funnel: TelegramFunnel) => {
    const confirmed = await confirm({
      title: 'Удалить воронку?',
      message: `«${funnel.name}» перестанет отвечать, а ссылки на неё приведут к воронке по умолчанию.`,
      variant: 'danger',
    });
    if (!confirmed) return;

    await deleteFunnel(funnel.id);
    await refresh();
    toast('Воронка удалена');
  };

  const handleToggleFunnel = async (funnel: TelegramFunnel, active: boolean) => {
    await supabase.from('telegram_funnels').update({ is_active: active }).eq('id', funnel.id);
    await refresh();
  };

  const handleSaveBroadcast = async (draft: BroadcastDraft, send: boolean) => {
    if (!user) return;
    setSaving(true);
    try {
      const broadcastId = await saveBroadcast(draft, user.id);
      if (send) await scheduleBroadcast(broadcastId, draft.scheduled_at);

      setBroadcastDraft(null);
      await refresh();
      toast(
        send
          ? draft.scheduled_at
            ? 'Рассылка запланирована'
            : 'Рассылка запущена — отправка идёт на сервере'
          : 'Черновик сохранён',
      );
    } catch (error) {
      toast({
        message: error instanceof Error ? error.message : 'Не удалось сохранить рассылку',
        tone: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCancelBroadcast = async (broadcast: TelegramBroadcast) => {
    const stopped = await cancelBroadcast(broadcast.id);
    await refresh();
    toast(
      stopped
        ? 'Рассылка отменена'
        : 'Отправка уже началась — часть подписчиков сообщение получила',
    );
  };

  const handleDeleteBroadcast = async (broadcast: TelegramBroadcast) => {
    const confirmed = await confirm({
      title: 'Удалить рассылку?',
      message: 'Запись и статистика доставки будут удалены.',
      variant: 'danger',
    });
    if (!confirmed) return;

    await deleteBroadcast(broadcast.id);
    await refresh();
    toast('Рассылка удалена');
  };

  const handleMarkSignedUp = async (subscriber: TelegramSubscriber) => {
    await markSignedUp(subscriber.id);
    await refresh();
  };

  const needsBot = !loading && !bot;
  const currentTab = needsBot ? 'bot' : activeTab;

  return (
    <PageShell width="wide" className="telegram-page space-y-8">
      <PageHeader
        title="Telegram"
        description="Свяжите Instagram с Telegram: бот встретит человека, выдаст материал и поможет довести его до заявки."
        className="mb-0"
        actions={
          bot && currentTab === 'funnels' ? (
            <Button
              variant="primary"
              icon={<PlusIcon className="h-4 w-4" />}
              onClick={openNewFunnel}
            >
              Создать воронку
            </Button>
          ) : bot && currentTab === 'broadcasts' ? (
            <Button
              variant="primary"
              icon={<PlusIcon className="h-4 w-4" />}
              onClick={() => setBroadcastDraft(blankBroadcast(bot.id))}
            >
              Новая рассылка
            </Button>
          ) : undefined
        }
      />

      <div className="scroll-x flex w-full max-w-full items-center gap-1.5 rounded-2xl border border-gray-200/60 bg-gray-100/90 p-1.5">
        {TABS.map((tab) => {
          const disabled = !bot && tab.id !== 'bot';
          const count = tab.id === 'funnels'
            ? funnels.length
            : tab.id === 'broadcasts'
              ? broadcasts.length
              : tab.id === 'subscribers'
                ? totals.active
                : null;
          return (
            <button
              key={tab.id}
              type="button"
              disabled={disabled}
              onClick={() => setActiveTab(tab.id)}
              aria-current={currentTab === tab.id ? 'page' : undefined}
              className={cn(
                'flex min-w-[8.25rem] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition-all',
                currentTab === tab.id
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-500 hover:text-gray-900',
                disabled && 'cursor-not-allowed opacity-40 hover:text-gray-500',
              )}
            >
              {tab.icon}
              {tab.label}
              {count !== null && bot && (
                <span className={cn(
                  'rounded-full px-1.5 py-0.5 text-xs font-semibold tabular',
                  currentTab === tab.id ? 'bg-brand-50 text-brand-700' : 'bg-white/70 text-gray-500',
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-brand-100 bg-brand-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-xs">
            <PaperAirplaneIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-base font-semibold text-gray-900">Путь подписчика</p>
            <p className="mt-0.5 text-sm leading-relaxed text-gray-600">
              Instagram → бот → подписка → материал → целевое действие
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Badge tone={bot ? (bot.is_active ? 'success' : 'warning') : 'neutral'} dot>
            {bot ? (bot.is_active ? 'Бот активен' : 'Бот выключен') : 'Бот не подключён'}
          </Badge>
          {bot && (
            <Badge tone="neutral">
              {funnels.length} {pluralizeRu(funnels.length, 'воронка', 'воронки', 'воронок')}
            </Badge>
          )}
          {bot && (
            <Badge tone="neutral">
              {totals.active} {pluralizeRu(totals.active, 'подписчик', 'подписчика', 'подписчиков')}
            </Badge>
          )}
        </div>
      </div>

      {loadError && <Callout tone="danger">{loadError}</Callout>}

      {needsBot && currentTab === 'bot' && (
        <Callout tone="info">
          Подключите бота — после этого станут доступны воронки, рассылки и аналитика.
        </Callout>
      )}

      {currentTab === 'bot' && <BotSetupTab bot={bot} onChanged={refresh} />}

      {bot && currentTab === 'funnels' && (
        <FunnelsTab
          bot={bot}
          funnels={funnels}
          stats={stats}
          loading={loading}
          onCreate={openNewFunnel}
          onEdit={openFunnel}
          onDelete={handleDeleteFunnel}
          onToggleActive={handleToggleFunnel}
        />
      )}

      {bot && currentTab === 'broadcasts' && (
        <BroadcastsTab
          broadcasts={broadcasts}
          loading={loading}
          onCreate={() => setBroadcastDraft(blankBroadcast(bot.id))}
          onEdit={(broadcast) => setBroadcastDraft({ ...broadcast })}
          onCancel={handleCancelBroadcast}
          onDelete={handleDeleteBroadcast}
        />
      )}

      {bot && currentTab === 'subscribers' && (
        <SubscribersTab
          subscribers={subscribers}
          loading={loading}
          onMarkSignedUp={handleMarkSignedUp}
        />
      )}

      {bot && currentTab === 'analytics' && (
        <TelegramAnalyticsTab
          bot={bot}
          stats={stats}
          totals={totals}
          signupDates={signupDates}
        />
      )}

      {funnelDraft && bot && (
        <FunnelEditorModal
          initial={funnelDraft}
          initialSteps={funnelSteps}
          bot={bot}
          leadMagnets={leadMagnets}
          saving={saving}
          onClose={() => setFunnelDraft(null)}
          onSave={handleSaveFunnel}
        />
      )}

      {broadcastDraft && bot && (
        <BroadcastComposerModal
          initial={broadcastDraft}
          bot={bot}
          funnels={funnels}
          saving={saving}
          onClose={() => setBroadcastDraft(null)}
          onSave={handleSaveBroadcast}
        />
      )}
    </PageShell>
  );
}
