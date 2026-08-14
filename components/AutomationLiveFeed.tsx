import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import LeadAvatar from './LeadAvatar';
import {
  ChatBubbleLeftRightIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';

export interface LiveAutomationEvent {
  id: string;
  trigger_type: 'dm' | 'comment';
  incoming_text: string;
  commenter_username: string | null;
  status: 'received' | 'ignored' | 'sent' | 'failed';
  public_reply_status: 'pending' | 'sent' | 'skipped' | 'failed';
  dm_status: 'pending' | 'sent' | 'skipped' | 'failed';
  error_message: string | null;
  created_at: string;
  media_id?: string | null;
  lead_magnets: { title: string; codeword: string; response_url?: string } | null;
  instagram_accounts: { username: string } | null;
}

interface AutomationLiveFeedProps {
  initialEvents: LiveAutomationEvent[];
  selectedAccountId?: string | null;
  onRefresh?: () => void;
}

function timeAgo(dateString: string): string {
  const seconds = Math.floor((new Date().getTime() - new Date(dateString).getTime()) / 1000);
  if (seconds < 10) return 'только что';
  if (seconds < 60) return `${seconds}с назад`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}м назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}ч назад`;
  return `${Math.floor(hours / 24)}д назад`;
}

export const AutomationLiveFeed: React.FC<AutomationLiveFeedProps> = ({
  initialEvents,
  selectedAccountId,
  onRefresh,
}) => {
  const [events, setEvents] = useState<LiveAutomationEvent[]>(initialEvents);
  const [selectedLead, setSelectedLead] = useState<LiveAutomationEvent | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'sent' | 'received' | 'failed'>('all');
  const [isLiveActive, setIsLiveActive] = useState(true);
  const [newEventFlashId, setNewEventFlashId] = useState<string | null>(null);

  // Synchronize with parent events
  useEffect(() => {
    setEvents(initialEvents);
  }, [initialEvents]);

  // Subscribe to Supabase Realtime Stream
  useEffect(() => {
    const channel = supabase
      .channel('realtime:automation_events')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'instagram_automation_events',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newRow = payload.new as any;
            const formattedEvent: LiveAutomationEvent = {
              id: newRow.id,
              trigger_type: newRow.trigger_type || 'comment',
              incoming_text: newRow.incoming_text || '',
              commenter_username: newRow.commenter_username,
              status: newRow.status,
              public_reply_status: newRow.public_reply_status || 'skipped',
              dm_status: newRow.dm_status || 'pending',
              error_message: newRow.error_message,
              created_at: newRow.created_at || new Date().toISOString(),
              media_id: newRow.media_id,
              lead_magnets: newRow.lead_magnet_id
                ? { title: 'Лид-магнит', codeword: 'КЛЮЧ' }
                : null,
              instagram_accounts: null,
            };

            setEvents((prev) => [formattedEvent, ...prev]);
            setNewEventFlashId(formattedEvent.id);
            setTimeout(() => setNewEventFlashId(null), 3000);
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as any;
            setEvents((prev) =>
              prev.map((e) =>
                e.id === updated.id
                  ? {
                      ...e,
                      status: updated.status,
                      public_reply_status: updated.public_reply_status,
                      dm_status: updated.dm_status,
                      error_message: updated.error_message,
                    }
                  : e
              )
            );
          }
        }
      )
      .subscribe((status) => {
        setIsLiveActive(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filteredEvents = events.filter((e) => {
    if (statusFilter !== 'all' && e.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const user = (e.commenter_username || '').toLowerCase();
      const text = (e.incoming_text || '').toLowerCase();
      const codeword = (e.lead_magnets?.codeword || '').toLowerCase();
      return user.includes(q) || text.includes(q) || codeword.includes(q);
    }
    return true;
  });

  return (
    <div className="bg-white rounded-2xl border border-gray-200/70 shadow-xs overflow-hidden flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 bg-gray-50/40 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className={`w-2 h-2 rounded-full ${isLiveActive ? 'bg-emerald-500' : 'bg-gray-400'}`} />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900 text-sm">
                Лента активности
              </h3>
              <span className="text-[11px] text-gray-500 font-medium bg-gray-100 px-2 py-0.5 rounded">
                Realtime
              </span>
            </div>
            <p className="text-xs text-gray-400">
              {isLiveActive ? 'Отслеживание комментариев и сообщений' : 'Подключение...'}
            </p>
          </div>
        </div>

        {/* Filter Chips & Refresh */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-gray-100 p-0.5 rounded-xl text-xs font-medium">
            {(['all', 'sent', 'received', 'failed'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  statusFilter === s
                    ? 'bg-white text-gray-900 shadow-xs font-semibold'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {s === 'all'
                  ? 'Все'
                  : s === 'sent'
                  ? 'Доставлено'
                  : s === 'received'
                  ? 'В обработке'
                  : 'Ошибки'}
              </button>
            ))}
          </div>

          {onRefresh && (
            <button
              onClick={onRefresh}
              className="p-1.5 hover:bg-gray-100 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
              title="Обновить"
            >
              <ArrowPathIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Search Bar */}
      <div className="p-3 border-b border-gray-100 bg-white">
        <div className="relative">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Поиск по @username или кодовому слову..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-8 py-1.5 text-xs border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Live Stream List */}
      <div className="max-h-[480px] overflow-y-auto divide-y divide-gray-100">
        {filteredEvents.length === 0 ? (
          <div className="text-center py-12 px-4">
            <ChatBubbleLeftRightIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-xs font-medium text-gray-600">Нет входящей активности</p>
            <p className="text-xs text-gray-400 mt-0.5">
              События появятся здесь в реальном времени при комментариях пользователей
            </p>
          </div>
        ) : (
          filteredEvents.map((evt) => {
            const isFlash = newEventFlashId === evt.id;
            const isSent = evt.status === 'sent' || evt.dm_status === 'sent';
            const isFailed = evt.status === 'failed' || evt.dm_status === 'failed';

            return (
              <div
                key={evt.id}
                onClick={() => setSelectedLead(evt)}
                className={`p-3.5 hover:bg-gray-50/80 cursor-pointer transition-colors flex items-start gap-3 ${
                  isFlash ? 'bg-gray-100/70' : ''
                }`}
              >
                <LeadAvatar username={evt.commenter_username} size="md" />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-gray-900 text-xs">
                        @{evt.commenter_username || 'инкогнито'}
                      </span>
                      <span className="text-[11px] text-gray-400">
                        • {evt.trigger_type === 'comment' ? 'комментарий' : 'direct'}
                      </span>
                    </div>

                    <span className="text-[11px] text-gray-400 whitespace-nowrap">
                      {timeAgo(evt.created_at)}
                    </span>
                  </div>

                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="text-xs text-gray-700 bg-gray-50 border border-gray-200/60 px-2 py-0.5 rounded truncate max-w-sm">
                      «{evt.incoming_text}»
                    </span>

                    {evt.lead_magnets?.codeword && (
                      <span className="text-[11px] font-medium bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded flex-shrink-0">
                        {evt.lead_magnets.codeword}
                      </span>
                    )}
                  </div>

                  <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                    {isSent ? (
                      <span className="text-emerald-700 font-medium bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-md">
                        Доставлено {evt.lead_magnets ? `(«${evt.lead_magnets.title}»)` : ''}
                      </span>
                    ) : isFailed ? (
                      <span className="text-red-700 font-medium bg-red-50 border border-red-200/60 px-2 py-0.5 rounded-md">
                        Ошибка: {evt.error_message || 'Неизвестно'}
                      </span>
                    ) : (
                      <span className="text-gray-600 bg-gray-100 px-2 py-0.5 rounded-md">
                        В процессе...
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Mini Lead Drawer */}
      {selectedLead && (
        <div
          className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedLead(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <LeadAvatar username={selectedLead.commenter_username} size="lg" />
                <div>
                  <h3 className="font-semibold text-sm text-gray-900">
                    @{selectedLead.commenter_username || 'инкогнито'}
                  </h3>
                  <p className="text-xs text-gray-400">
                    {new Date(selectedLead.created_at).toLocaleString('ru-RU')}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedLead(null)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 transition-colors"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs text-gray-700">
              <div className="bg-gray-50 rounded-xl p-3 border border-gray-200/60">
                <span className="text-[11px] text-gray-400 block mb-1">
                  Входящий запрос
                </span>
                <p className="font-medium text-gray-900">
                  «{selectedLead.incoming_text}»
                </p>
              </div>

              {selectedLead.lead_magnets && (
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-200/60">
                  <span className="text-[11px] text-gray-400 block mb-1">
                    Отправленный лид-магнит
                  </span>
                  <p className="font-medium text-gray-900">
                    {selectedLead.lead_magnets.title}
                  </p>
                </div>
              )}

              {selectedLead.commenter_username && (
                <a
                  href={`https://instagram.com/${selectedLead.commenter_username}`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-2 bg-gray-900 hover:bg-gray-800 text-white font-medium rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                >
                  <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                  Открыть профиль @{selectedLead.commenter_username}
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AutomationLiveFeed;
