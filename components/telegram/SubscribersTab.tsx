import React, { useMemo, useState } from 'react';
import { CheckBadgeIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import type { TelegramSubscriber } from '../../types';
import { Badge, Button, EmptyState, SearchInput, Select, SkeletonList } from '../ui';

type SubscriberFilter = 'all' | 'instagram' | 'delivered' | 'stuck' | 'blocked';

const FILTER_LABELS: Record<SubscriberFilter, string> = {
  all: 'Все',
  instagram: 'Из Instagram',
  delivered: 'Получили материал',
  stuck: 'Застряли на подписке',
  blocked: 'Заблокировали бота',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface SubscribersTabProps {
  subscribers: TelegramSubscriber[];
  loading: boolean;
  onMarkSignedUp: (subscriber: TelegramSubscriber) => void;
}

const SubscribersTab: React.FC<SubscribersTabProps> = ({
  subscribers,
  loading,
  onMarkSignedUp,
}) => {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SubscriberFilter>('all');

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return subscribers.filter((subscriber) => {
      if (filter === 'instagram' && subscriber.source !== 'instagram') return false;
      if (filter === 'delivered' && !subscriber.delivered_at) return false;
      // Started the funnel but never got the material — the group worth a nudge.
      if (filter === 'stuck' && (subscriber.delivered_at || subscriber.is_blocked)) return false;
      if (filter === 'blocked' && !subscriber.is_blocked) return false;

      if (!needle) return true;
      return (
        subscriber.username.toLowerCase().includes(needle) ||
        subscriber.first_name.toLowerCase().includes(needle) ||
        subscriber.telegram_user_id.includes(needle)
      );
    });
  }, [subscribers, query, filter]);

  if (loading) return <SkeletonList rows={4} />;

  return (
    <div className="animate-in fade-in space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Имя, @ник или ID…"
          className="flex-1"
        />
        <Select
          value={filter}
          onChange={(event) => setFilter(event.target.value as SubscriberFilter)}
          className="sm:w-64"
          aria-label="Фильтр подписчиков"
        >
          {(Object.keys(FILTER_LABELS) as SubscriberFilter[]).map((key) => (
            <option key={key} value={key}>{FILTER_LABELS[key]}</option>
          ))}
        </Select>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<UserGroupIcon className="h-6 w-6" />}
          title={subscribers.length === 0 ? 'Подписчиков пока нет' : 'Никто не подошёл под фильтр'}
          description={
            subscribers.length === 0
              ? 'Как только человек перейдёт из Instagram Direct и нажмёт «Начать», он появится здесь вместе с кодовым словом, которое его привело.'
              : 'Попробуйте другой фильтр или очистите поиск.'
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="scroll-x">
            <table className="w-full min-w-[46rem] text-left">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr className="text-2xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-2.5 font-medium">Подписчик</th>
                  <th className="px-4 py-2.5 font-medium">Источник</th>
                  <th className="px-4 py-2.5 font-medium">Воронка</th>
                  <th className="px-4 py-2.5 font-medium">Прогресс</th>
                  <th className="px-4 py-2.5 font-medium">Пришёл</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map((subscriber) => (
                  <tr key={subscriber.id} className="align-middle">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-2xs font-semibold text-gray-600">
                          {(subscriber.first_name || subscriber.username || '?')
                            .slice(0, 1)
                            .toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-gray-900">
                            {subscriber.first_name || 'Без имени'}
                          </p>
                          <p className="truncate text-2xs text-gray-500">
                            {subscriber.username ? `@${subscriber.username}` : subscriber.telegram_user_id}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      {subscriber.source === 'instagram'
                        ? <Badge tone="accent">Instagram</Badge>
                        : <Badge tone="neutral">по ссылке</Badge>}
                    </td>

                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-600">
                        {subscriber.telegram_funnels?.name ?? '—'}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1">
                        {subscriber.is_blocked
                          ? <Badge tone="danger">заблокировал</Badge>
                          : (
                            <>
                              <Badge tone={subscriber.subscribed_at ? 'success' : 'neutral'}>
                                подписка
                              </Badge>
                              <Badge tone={subscriber.delivered_at ? 'success' : 'neutral'}>
                                материал
                              </Badge>
                              <Badge tone={subscriber.signed_up_at ? 'success' : 'neutral'}>
                                сервис
                              </Badge>
                            </>
                          )}
                      </div>
                    </td>

                    <td className="tabular px-4 py-3 text-2xs text-gray-500">
                      {formatDate(subscriber.started_at)}
                    </td>

                    <td className="px-4 py-3 text-right">
                      {!subscriber.signed_up_at && !subscriber.is_blocked && (
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Отметить регистрацию в сервисе"
                          onClick={() => onMarkSignedUp(subscriber)}
                          icon={<CheckBadgeIcon className="h-4 w-4" />}
                        >
                          Дошёл
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-2xs text-gray-500">
        Показаны последние 500 подписчиков. «Дошёл» отмечает регистрацию в сервисе вручную —
        это последний шаг воронки в аналитике.
      </p>
    </div>
  );
};

export default SubscribersTab;
