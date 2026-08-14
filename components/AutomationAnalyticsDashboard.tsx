import React, { useState, useMemo } from 'react';
import { LeadMagnet, LeadMagnetStats } from '../types';
import { LiveAutomationEvent } from './AutomationLiveFeed';
import LeadDetailModal from './LeadDetailModal';
import LeadAvatar from './LeadAvatar';
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
  events: LiveAutomationEvent[];
  rules: LeadMagnet[];
  stats: LeadMagnetStats[];
}

export const AutomationAnalyticsDashboard: React.FC<AutomationAnalyticsDashboardProps> = ({
  events,
  rules,
  stats,
}) => {
  const [timeRange, setTimeRange] = useState<'7d' | '14d' | '30d'>('7d');
  const [crmSearch, setCrmSearch] = useState('');
  const [crmStatusFilter, setCrmStatusFilter] = useState<'all' | 'sent' | 'failed'>('all');
  const [selectedLeadModal, setSelectedLeadModal] = useState<LiveAutomationEvent | null>(null);

  // Key KPI Aggregations
  const totalComments = events.filter((e) => e.trigger_type === 'comment').length;
  const totalDMs = events.filter((e) => e.trigger_type === 'dm').length;
  const totalTriggers = events.length;
  const sentDMs = events.filter((e) => e.status === 'sent' || e.dm_status === 'sent').length;
  const failedDMs = events.filter((e) => e.status === 'failed' || e.dm_status === 'failed').length;
  const deliveryRate = totalTriggers > 0 ? Math.round((sentDMs / totalTriggers) * 100) : 100;

  // Chart Data: Group events by day for the selected period
  const chartDaysCount = timeRange === '7d' ? 7 : timeRange === '14d' ? 14 : 30;
  const chartData = useMemo(() => {
    const days: { dateLabel: string; comments: number; dms: number; total: number }[] = [];
    const now = new Date();

    for (let i = chartDaysCount - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayLabel = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

      const dayEvents = events.filter((e) => e.created_at.startsWith(dateStr));
      const comments = dayEvents.filter((e) => e.trigger_type === 'comment').length;
      const dms = dayEvents.filter((e) => e.status === 'sent' || e.dm_status === 'sent').length;

      days.push({
        dateLabel: dayLabel,
        comments,
        dms,
        total: dayEvents.length,
      });
    }
    return days;
  }, [events, chartDaysCount]);

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

    events.forEach((evt) => {
      const code = (evt.lead_magnets?.codeword || 'ДРУГИЕ').toUpperCase();
      const curr = map.get(code) || {
        codeword: code,
        title: evt.lead_magnets?.title || 'Лид-магнит',
        triggersCount: 0,
        sentCount: 0,
        conversionRate: 0,
      };
      curr.triggersCount += 1;
      if (evt.status === 'sent' || evt.dm_status === 'sent') {
        curr.sentCount += 1;
      }
      curr.conversionRate =
        curr.triggersCount > 0 ? Math.round((curr.sentCount / curr.triggersCount) * 100) : 0;
      map.set(code, curr);
    });

    return Array.from(map.values()).sort((a, b) => b.triggersCount - a.triggersCount);
  }, [rules, events]);

  // Top Performing Media / Reels
  const mediaStats = useMemo(() => {
    const map = new Map<string, { mediaId: string; leadsCount: number; lastTrigger: string }>();

    events.forEach((evt) => {
      const mediaId = evt.media_id || 'general';
      const curr = map.get(mediaId) || {
        mediaId,
        leadsCount: 0,
        lastTrigger: evt.created_at,
      };
      curr.leadsCount += 1;
      map.set(mediaId, curr);
    });

    return Array.from(map.values())
      .filter((m) => m.mediaId !== 'general')
      .sort((a, b) => b.leadsCount - a.leadsCount)
      .slice(0, 5);
  }, [events]);

  // Filtered CRM Leads
  const crmLeads = useMemo(() => {
    return events.filter((e) => {
      if (crmStatusFilter === 'sent' && !(e.status === 'sent' || e.dm_status === 'sent')) return false;
      if (crmStatusFilter === 'failed' && !(e.status === 'failed' || e.dm_status === 'failed')) return false;
      if (crmSearch.trim()) {
        const q = crmSearch.toLowerCase();
        const user = (e.commenter_username || '').toLowerCase();
        const text = (e.incoming_text || '').toLowerCase();
        const code = (e.lead_magnets?.codeword || '').toLowerCase();
        return user.includes(q) || text.includes(q) || code.includes(q);
      }
      return true;
    });
  }, [events, crmStatusFilter, crmSearch]);

  // Export CSV
  const handleExportCSV = () => {
    const headers = ['Instagram Username', 'Тип', 'Кодовое слово', 'Входящий текст', 'Статус', 'Дата и время'];
    const rows = crmLeads.map((lead) => [
      `@${lead.commenter_username || 'инкогнито'}`,
      lead.trigger_type === 'comment' ? 'Комментарий' : 'Direct',
      lead.lead_magnets?.codeword || '',
      `"${(lead.incoming_text || '').replace(/"/g, '""')}"`,
      lead.status === 'sent' ? 'Доставлено' : lead.status === 'failed' ? 'Ошибка' : 'В обработке',
      new Date(lead.created_at).toLocaleString('ru-RU'),
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `leads_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* 4 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-gray-200/70 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Всего комментариев</span>
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
                      {item.sentCount} лидов ({item.conversionRate}%)
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
                      {item.leadsCount} лидов
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Leads CRM Table */}
      <div className="bg-white rounded-2xl border border-gray-200/70 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3 bg-gray-50/40">
          <div>
            <h3 className="font-semibold text-sm text-gray-900">
              База контактов (CRM)
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Пользователи, оставившие комментарий с кодовым словом
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
                onChange={(e) => setCrmSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400 bg-white"
              />
            </div>

            <div className="flex items-center bg-gray-100 p-0.5 rounded-xl text-xs font-medium">
              {(['all', 'sent', 'failed'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setCrmStatusFilter(s)}
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
              Экспорт CSV
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
                  const username = lead.commenter_username || 'инкогнито';

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
                          <span className="font-semibold text-gray-900 text-xs">
                            @{username}
                          </span>
                          <span className="text-[11px] text-gray-400 ml-1.5">
                            {lead.trigger_type === 'comment' ? 'комментарий' : 'direct'}
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

                          {username !== 'инкогнито' && (
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
      </div>

      {/* CRM Lead Modal Drawer */}
      {selectedLeadModal && (
        <LeadDetailModal
          lead={selectedLeadModal}
          onClose={() => setSelectedLeadModal(null)}
        />
      )}
    </div>
  );
};

export default AutomationAnalyticsDashboard;
