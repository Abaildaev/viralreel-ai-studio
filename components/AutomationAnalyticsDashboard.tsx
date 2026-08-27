import React, { useEffect, useMemo, useState } from 'react';
import { LeadMagnet } from '../types';
import { LiveAutomationEvent } from './AutomationLiveFeed';
import LeadDetailModal from './LeadDetailModal';
import LeadAvatar from './LeadAvatar';
import { supabase } from '../lib/supabase';
import { getErrorMessage } from '../utils/errorMessage';
import {
  ChatBubbleBottomCenterTextIcon,
  EnvelopeIcon,
  ArrowTrendingUpIcon,
  ArrowDownTrayIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';

interface AutomationAnalyticsDashboardProps {
  view?: 'analytics' | 'leads';
  rules: LeadMagnet[];
}

type CrmContact = LiveAutomationEvent & {
  interaction_count: number;
  sent_count: number;
  failed_count: number;
  search_text: string;
};

interface AutomationAnalyticsData {
  total_triggers: number;
  total_comments: number;
  total_dms: number;
  sent_dms: number;
  failed_dms: number;
  daily: Array<{ date: string; comments: number; sent: number; total: number }>;
  codewords: Array<{
    codeword: string;
    title: string;
    triggers_count: number;
    sent_count: number;
  }>;
  media: Array<{ media_id: string; leads_count: number; last_trigger: string }>;
  ab_test: {
    started_at: string | null;
    control_exposures: number;
    control_telegram_starts: number;
    quick_reply_exposures: number;
    quick_reply_clicks: number;
    quick_reply_link_deliveries: number;
    quick_reply_telegram_starts: number;
  };
}

interface AutomationLeadRpcRow {
  id: string;
  trigger_type: 'dm' | 'comment';
  incoming_text: string;
  commenter_username: string | null;
  sender_igsid: string | null;
  status: LiveAutomationEvent['status'];
  public_reply_status: LiveAutomationEvent['public_reply_status'];
  dm_status: LiveAutomationEvent['dm_status'];
  error_message: string | null;
  created_at: string;
  media_id: string | null;
  lead_magnet_title: string | null;
  lead_magnet_codeword: string | null;
  lead_magnet_response_url: string | null;
  instagram_username: string | null;
  interaction_count: number;
  sent_count: number;
  failed_count: number;
  total_count: number;
}

const LEADS_PAGE_SIZE = 50;

const EMPTY_ANALYTICS: AutomationAnalyticsData = {
  total_triggers: 0,
  total_comments: 0,
  total_dms: 0,
  sent_dms: 0,
  failed_dms: 0,
  daily: [],
  codewords: [],
  media: [],
  ab_test: {
    started_at: null,
    control_exposures: 0,
    control_telegram_starts: 0,
    quick_reply_exposures: 0,
    quick_reply_clicks: 0,
    quick_reply_link_deliveries: 0,
    quick_reply_telegram_starts: 0,
  },
};

export const AutomationAnalyticsDashboard: React.FC<AutomationAnalyticsDashboardProps> = ({
  view = 'analytics',
  rules,
}) => {
  const [timeRange, setTimeRange] = useState<'7d' | '14d' | '30d'>('7d');
  const [crmSearch, setCrmSearch] = useState('');
  const [crmStatusFilter, setCrmStatusFilter] = useState<'all' | 'sent' | 'failed'>('all');
  const [selectedLeadModal, setSelectedLeadModal] = useState<LiveAutomationEvent | null>(null);
  const [analytics, setAnalytics] = useState<AutomationAnalyticsData>(EMPTY_ANALYTICS);
  const [crmLeads, setCrmLeads] = useState<CrmContact[]>([]);
  const [crmPage, setCrmPage] = useState(0);
  const [crmTotal, setCrmTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (view !== 'analytics') return;
    let cancelled = false;
    setLoading(true);
    setLoadError('');

    void (async () => {
      try {
        const { data, error } = await supabase.rpc('get_automation_analytics', {
          p_days: 30,
          p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        });
        if (error) throw error;
        if (!cancelled) {
          setAnalytics((data as unknown as AutomationAnalyticsData) ?? EMPTY_ANALYTICS);
        }
      } catch (error) {
        if (!cancelled) setLoadError(getErrorMessage(error, 'Не удалось загрузить аналитику'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [view]);

  useEffect(() => {
    if (view !== 'leads') return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setLoadError('');
      try {
        const { data, error } = await supabase.rpc('get_automation_leads', {
          p_limit: LEADS_PAGE_SIZE,
          p_offset: crmPage * LEADS_PAGE_SIZE,
          p_search: crmSearch.trim(),
          p_status: crmStatusFilter,
        });
        if (error) throw error;
        if (cancelled) return;

        const rows = (data ?? []) as unknown as AutomationLeadRpcRow[];
        setCrmTotal(Number(rows[0]?.total_count ?? 0));
        setCrmLeads(rows.map((row) => ({
          id: row.id,
          trigger_type: row.trigger_type,
          incoming_text: row.incoming_text,
          commenter_username: row.commenter_username,
          sender_igsid: row.sender_igsid,
          status: row.status,
          public_reply_status: row.public_reply_status,
          dm_status: row.dm_status,
          error_message: row.error_message,
          created_at: row.created_at,
          media_id: row.media_id,
          lead_magnets: row.lead_magnet_title || row.lead_magnet_codeword
            ? {
                title: row.lead_magnet_title ?? 'Лид-магнит',
                codeword: row.lead_magnet_codeword ?? '',
                response_url: row.lead_magnet_response_url ?? undefined,
              }
            : null,
          instagram_accounts: row.instagram_username ? { username: row.instagram_username } : null,
          interaction_count: Number(row.interaction_count),
          sent_count: Number(row.sent_count),
          failed_count: Number(row.failed_count),
          search_text: '',
        })));
      } catch (error) {
        if (!cancelled) setLoadError(getErrorMessage(error, 'Не удалось загрузить лиды'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [view, crmPage, crmSearch, crmStatusFilter]);

  const contactLabel = (lead: LiveAutomationEvent) => {
    if (lead.commenter_username) return `@${lead.commenter_username}`;
    return lead.trigger_type === 'dm'
      ? `Пользователь · ${lead.sender_igsid?.slice(-6) || 'Direct'}`
      : 'Пользователь Instagram';
  };

  const totalComments = Number(analytics.total_comments ?? 0);
  const totalDMs = Number(analytics.total_dms ?? 0);
  const totalTriggers = Number(analytics.total_triggers ?? 0);
  const sentDMs = Number(analytics.sent_dms ?? 0);
  const failedDMs = Number(analytics.failed_dms ?? 0);
  const deliveryRate = totalTriggers > 0 ? Math.round((sentDMs / totalTriggers) * 100) : 100;
  const abTest = analytics.ab_test ?? EMPTY_ANALYTICS.ab_test;
  const controlTelegramRate = Number(abTest.control_exposures) > 0
    ? Math.round((Number(abTest.control_telegram_starts) / Number(abTest.control_exposures)) * 100)
    : 0;
  const quickReplyClickRate = Number(abTest.quick_reply_exposures) > 0
    ? Math.round((Number(abTest.quick_reply_clicks) / Number(abTest.quick_reply_exposures)) * 100)
    : 0;
  const quickReplyTelegramRate = Number(abTest.quick_reply_exposures) > 0
    ? Math.round((Number(abTest.quick_reply_telegram_starts) / Number(abTest.quick_reply_exposures)) * 100)
    : 0;
  const hasAbTestData = Number(abTest.control_exposures) + Number(abTest.quick_reply_exposures) > 0;

  // Postgres groups the retained history; the browser only selects the visible
  // 7/14/30-day tail and formats its labels.
  const chartDaysCount = timeRange === '7d' ? 7 : timeRange === '14d' ? 14 : 30;
  const chartData = useMemo(() => {
    const labelFormatter = new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'short',
    });
    return analytics.daily.slice(-chartDaysCount).map((day) => ({
      dateLabel: labelFormatter.format(new Date(`${day.date}T00:00:00Z`)),
      comments: Number(day.comments),
      dms: Number(day.sent),
      total: Number(day.total),
    }));
  }, [analytics.daily, chartDaysCount]);

  const maxChartVal = Math.max(...chartData.map((d) => Math.max(d.comments, d.dms)), 5);

  // Codeword Conversion Leaderboard
  const codewordStats = useMemo(() => {
    const map = new Map<
      string,
      {
        codeword: string;
        title: string;
        triggersCount: number;
        sentCount: number;
        conversionRate: number;
      }
    >();

    rules.forEach((rule) => {
      const code = (rule.codeword || 'БЕЗ СЛОВА').toUpperCase();
      map.set(code, {
        codeword: code,
        title: rule.title,
        triggersCount: 0,
        sentCount: 0,
        conversionRate: 0,
      });
    });

    analytics.codewords.forEach((item) => {
      const code = (item.codeword || 'ДРУГИЕ').toUpperCase();
      const curr = map.get(code) || {
        codeword: code,
        title: item.title || 'Лид-магнит',
        triggersCount: 0,
        sentCount: 0,
        conversionRate: 0,
      };
      curr.triggersCount = Number(item.triggers_count);
      curr.sentCount = Number(item.sent_count);
      curr.conversionRate =
        curr.triggersCount > 0 ? Math.round((curr.sentCount / curr.triggersCount) * 100) : 0;
      map.set(code, curr);
    });

    return Array.from(map.values()).sort((a, b) => b.triggersCount - a.triggersCount);
  }, [rules, analytics.codewords]);

  const mediaStats = useMemo(() => analytics.media.map((item) => ({
    mediaId: item.media_id,
    leadsCount: Number(item.leads_count),
    lastTrigger: item.last_trigger,
  })), [analytics.media]);

  const crmPageCount = Math.max(1, Math.ceil(crmTotal / LEADS_PAGE_SIZE));

  // Export CSV
  const handleExportCSV = () => {
    const headers = ['Instagram Username / ID', 'Тип', 'Обращений', 'Кодовое слово', 'Последний текст', 'Доставлено', 'Ошибок', 'Последняя активность'];
    const csvCell = (value: unknown) => {
      const text = String(value ?? '');
      return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const rows = crmLeads.map((lead) => [
      lead.commenter_username ? `@${lead.commenter_username}` : lead.sender_igsid || 'Неизвестно',
      lead.trigger_type === 'comment' ? 'Комментарий' : 'Direct',
      lead.interaction_count,
      lead.lead_magnets?.codeword || '',
      lead.incoming_text || '',
      lead.sent_count,
      lead.failed_count,
      new Date(lead.created_at).toLocaleString('ru-RU'),
    ]);

    const csvContent = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `leads_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
        {view === 'analytics' ? 'Считаю аналитику…' : 'Загружаю контакты…'}
      </div>
    );
  }

  if (loadError) {
    return (
      <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {loadError}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {view !== 'leads' && (
        <>
      {/* 4 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-gray-200/70 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Всего обращений</span>
            <ChatBubbleBottomCenterTextIcon className="w-4 h-4 text-gray-400" />
          </div>
          <p className="text-2xl font-semibold text-gray-900 mt-2">{totalTriggers}</p>
          <p className="text-xs text-gray-400 mt-1">{totalComments} под Reels • {totalDMs} direct</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-200/70 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Доставлено в Direct</span>
            <EnvelopeIcon className="w-4 h-4 text-gray-400" />
          </div>
          <p className="text-2xl font-semibold text-gray-900 mt-2">{sentDMs}</p>
          <p className="text-xs text-gray-400 mt-1">Мгновенная отправка</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-200/70 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Конверсия доставки</span>
            <ArrowTrendingUpIcon className="w-4 h-4 text-gray-400" />
          </div>
          <p className="text-2xl font-semibold text-gray-900 mt-2">{deliveryRate}%</p>
          <p className="text-xs text-gray-400 mt-1">
            {failedDMs === 0 ? 'Без сбоев' : `${failedDMs} ошибок`}
          </p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-200/70 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Активных воронок</span>
            <FunnelIcon className="w-4 h-4 text-gray-400" />
          </div>
          <p className="text-2xl font-semibold text-gray-900 mt-2">{rules.filter((r) => r.is_active).length}</p>
          <p className="text-xs text-gray-400 mt-1">Comment-to-DM</p>
        </div>
      </div>

      {hasAbTestData && (
        <div className="rounded-2xl border border-violet-200 bg-violet-50/40 p-5 shadow-xs">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-violet-950">A/B-тест выдачи материала</h3>
              <p className="mt-0.5 text-xs text-violet-700">
                Главная метрика — запуск Telegram после сообщения в Instagram.
              </p>
            </div>
            {abTest.started_at && (
              <span className="text-[11px] text-violet-600">
                Старт: {new Date(abTest.started_at).toLocaleDateString('ru-RU')}
              </span>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-xs font-semibold text-gray-900">Контроль · ссылка сразу</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xl font-semibold text-gray-900">{abTest.control_exposures}</p>
                  <p className="text-[11px] text-gray-500">доставок</p>
                </div>
                <div>
                  <p className="text-xl font-semibold text-gray-900">{controlTelegramRate}%</p>
                  <p className="text-[11px] text-gray-500">
                    {abTest.control_telegram_starts} стартов Telegram
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-violet-200 bg-white p-4">
              <p className="text-xs font-semibold text-violet-900">Эксперимент · Quick Reply</p>
              <div className="mt-3 grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xl font-semibold text-gray-900">{abTest.quick_reply_exposures}</p>
                  <p className="text-[11px] text-gray-500">доставок</p>
                </div>
                <div>
                  <p className="text-xl font-semibold text-gray-900">{quickReplyClickRate}%</p>
                  <p className="text-[11px] text-gray-500">
                    {abTest.quick_reply_clicks} нажатий
                  </p>
                </div>
                <div>
                  <p className="text-xl font-semibold text-gray-900">{quickReplyTelegramRate}%</p>
                  <p className="text-[11px] text-gray-500">
                    {abTest.quick_reply_telegram_starts} стартов Telegram
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-violet-600">
                Ссылка доставлена после нажатия: {abTest.quick_reply_link_deliveries}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Chart Section */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200/70 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              Динамика комментариев и доставок
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Количество полученных триггеров и отправленных материалов
            </p>
          </div>

          <div className="flex items-center bg-gray-100 p-0.5 rounded-xl text-xs font-medium">
            {(['7d', '14d', '30d'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  timeRange === r ? 'bg-white text-gray-900 shadow-xs font-semibold' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {r === '7d' ? '7 дней' : r === '14d' ? '14 дней' : '30 дней'}
              </button>
            ))}
          </div>
        </div>

        {/* Bar Chart */}
        <div className="h-40 flex items-end justify-between gap-2 pt-4 border-b border-gray-100 px-2 select-none">
          {chartData.map((d, i) => {
            const commentHeight = (d.comments / maxChartVal) * 100;
            const dmHeight = (d.dms / maxChartVal) * 100;

            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative h-full justify-end">
                <div className="absolute -top-9 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-[10px] py-1 px-2 rounded pointer-events-none z-10 whitespace-nowrap shadow-sm">
                  {d.dateLabel}: {d.comments} коммент. / {d.dms} direct
                </div>

                <div className="w-full flex items-end justify-center gap-1 h-28">
                  <div
                    className="w-3 bg-gray-200 group-hover:bg-gray-300 rounded-t transition-all"
                    style={{ height: `${Math.max(4, commentHeight)}%` }}
                  />
                  <div
                    className="w-3 bg-gray-800 group-hover:bg-gray-700 rounded-t transition-all"
                    style={{ height: `${Math.max(4, dmHeight)}%` }}
                  />
                </div>

                <span className="text-[10px] text-gray-400 font-normal mt-1">{d.dateLabel}</span>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center justify-end gap-5 mt-3.5 text-xs text-gray-500">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-gray-200" />
            <span>Комментарии</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-gray-800" />
            <span className="text-gray-800 font-medium">Direct отправлено</span>
          </div>
        </div>
      </div>

      {/* Two Columns: Codewords & Top Reels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Codewords Conversion Leaderboard */}
        <div className="bg-white rounded-2xl p-5 border border-gray-200/70 shadow-xs flex flex-col">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900">
              Кодовые слова
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">Конверсия по ключевым фразам</p>
          </div>

          <div className="flex-1 space-y-2">
            {codewordStats.length === 0 ? (
              <div className="text-center py-8 text-xs text-gray-400">Нет данных</div>
            ) : (
              codewordStats.slice(0, 5).map((item, idx) => (
                <div key={idx} className="p-3 bg-gray-50/70 hover:bg-gray-100/70 rounded-xl border border-gray-200/60 flex items-center justify-between gap-3 transition-colors">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-5 h-5 rounded-md bg-white border border-gray-200 text-gray-600 font-medium text-[11px] flex items-center justify-center flex-shrink-0">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-900 truncate">
                        {item.codeword}
                      </p>
                      <p className="text-[11px] text-gray-500 truncate">{item.title}</p>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <span className="text-xs font-medium text-gray-700 bg-white border border-gray-200 px-2 py-0.5 rounded-md">
                      {item.sentCount} доставок ({item.conversionRate}%)
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Top Reels Leaderboard */}
        <div className="bg-white rounded-2xl p-5 border border-gray-200/70 shadow-xs flex flex-col">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900">
              Топ Reels по лидам
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">Публикации с наибольшим откликом</p>
          </div>

          <div className="flex-1 space-y-2">
            {mediaStats.length === 0 ? (
              <div className="text-center py-8 text-xs text-gray-400">
                Лиды будут сгруппированы по ID роликов
              </div>
            ) : (
              mediaStats.map((item, idx) => (
                <div key={idx} className="p-3 bg-gray-50/70 hover:bg-gray-100/70 rounded-xl border border-gray-200/60 flex items-center justify-between gap-3 transition-colors">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-5 h-5 rounded-md bg-white border border-gray-200 text-gray-600 font-medium text-[11px] flex items-center justify-center flex-shrink-0">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-900 truncate">Reel ID: {item.mediaId}</p>
                      <p className="text-[11px] text-gray-400">{new Date(item.lastTrigger).toLocaleDateString('ru-RU')}</p>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <span className="text-xs font-medium text-gray-800 bg-white border border-gray-200 px-2 py-0.5 rounded-md">
                      {item.leadsCount} срабатываний
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

        </>
      )}

      {/* Leads CRM Table */}
      {view !== 'analytics' && (
        <>
      <div className="bg-white rounded-2xl border border-gray-200/70 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3 bg-gray-50/40">
          <div>
            <h3 className="font-semibold text-sm text-gray-900">
              База контактов (CRM)
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Один пользователь — одна карточка со всей активностью · {crmTotal} контактов
            </p>
          </div>

          {/* Search, Filter & CSV Export */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Поиск по @username..."
                value={crmSearch}
                onChange={(e) => {
                  setCrmSearch(e.target.value);
                  setCrmPage(0);
                }}
                className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400 bg-white"
              />
            </div>

            <div className="flex items-center bg-gray-100 p-0.5 rounded-xl text-xs font-medium">
              {(['all', 'sent', 'failed'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setCrmStatusFilter(s);
                    setCrmPage(0);
                  }}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    crmStatusFilter === s ? 'bg-white text-gray-900 shadow-xs font-semibold' : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {s === 'all' ? 'Все' : s === 'sent' ? 'Доставлено' : 'Ошибки'}
                </button>
              ))}
            </div>

            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <ArrowDownTrayIcon className="w-3.5 h-3.5" />
              Экспорт страницы
            </button>
          </div>
        </div>

        {/* Clean CRM Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50/70 text-gray-400 font-medium border-b border-gray-100">
              <tr>
                <th className="px-5 py-3">Пользователь</th>
                <th className="px-4 py-3">Кодовое слово</th>
                <th className="px-4 py-3">Комментарий / Запрос</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3">Дата</th>
                <th className="px-5 py-3 text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-700">
              {crmLeads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-gray-400">
                    Лиды не найдены
                  </td>
                </tr>
              ) : (
                crmLeads.map((lead) => {
                  const username = lead.commenter_username || `direct_${lead.sender_igsid?.slice(-6) || 'user'}`;
                  const isDirectWithoutUsername = lead.trigger_type === 'dm' && !lead.commenter_username;

                  return (
                    <tr
                      key={lead.id}
                      onClick={() => setSelectedLeadModal(lead)}
                      className="hover:bg-gray-50/80 cursor-pointer transition-colors"
                    >
                      {/* User Profile Column */}
                      <td className="px-5 py-3.5 flex items-center gap-2.5">
                        <LeadAvatar username={username} size="sm" />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-gray-900 text-xs">{contactLabel(lead)}</span>
                            <span className="text-[10px] font-semibold text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded-md">
                              {lead.interaction_count} {lead.interaction_count === 1 ? 'обращение' : 'обращений'}
                            </span>
                          </div>
                          <span className="text-[11px] text-gray-400">
                            Последнее: {lead.trigger_type === 'comment' ? 'комментарий' : 'direct'}
                          </span>
                        </div>
                      </td>

                      {/* Codeword */}
                      <td className="px-4 py-3.5">
                        <span className="inline-block bg-gray-100 text-gray-700 font-medium px-2 py-0.5 rounded text-[11px] border border-gray-200/60">
                          {lead.lead_magnets?.codeword || '—'}
                        </span>
                      </td>

                      {/* Comment text */}
                      <td className="px-4 py-3.5 max-w-xs truncate text-gray-600">
                        «{lead.incoming_text}»
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5">
                        <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium inline-flex items-center gap-1 ${
                          lead.status === 'sent' || lead.dm_status === 'sent'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                            : lead.status === 'failed' || lead.dm_status === 'failed'
                            ? 'bg-red-50 text-red-700 border border-red-200/60'
                            : 'bg-gray-100 text-gray-600 border border-gray-200/60'
                        }`}>
                          {lead.status === 'sent' || lead.dm_status === 'sent' ? (
                            'Доставлено'
                          ) : lead.status === 'failed' || lead.dm_status === 'failed' ? (
                            'Ошибка'
                          ) : (
                            'В обработке'
                          )}
                        </span>
                      </td>

                      {/* Date */}
                      <td className="px-4 py-3.5 text-gray-400 whitespace-nowrap text-[11px]">
                        {new Date(lead.created_at).toLocaleString('ru-RU', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedLeadModal(lead)}
                            className="px-2.5 py-1 bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-lg text-xs font-medium transition-colors"
                          >
                            Диалог
                          </button>

                          {!isDirectWithoutUsername && Boolean(lead.commenter_username) && (
                            <a
                              href={`https://instagram.com/${username}`}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                              title="Открыть в Instagram"
                            >
                              <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {crmPageCount > 1 && (
          <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-5 py-3 text-xs text-gray-500">
            <span>
              Страница {crmPage + 1} из {crmPageCount}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={crmPage === 0}
                onClick={() => setCrmPage((page) => Math.max(0, page - 1))}
                className="rounded-lg border border-gray-200 px-3 py-1.5 font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Назад
              </button>
              <button
                type="button"
                disabled={crmPage + 1 >= crmPageCount}
                onClick={() => setCrmPage((page) => Math.min(crmPageCount - 1, page + 1))}
                className="rounded-lg border border-gray-200 px-3 py-1.5 font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Далее
              </button>
            </div>
          </div>
        )}
      </div>

        </>
      )}

      {/* CRM Lead Modal Drawer */}
      {view === 'leads' && selectedLeadModal && (
        <LeadDetailModal
          lead={selectedLeadModal}
          onClose={() => setSelectedLeadModal(null)}
        />
      )}
    </div>
  );
};

export default AutomationAnalyticsDashboard;
