import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { supabase } from '../../lib/supabase';
import type { InstagramQueueHealth } from '../../types';
import { cn } from '../ui';

/*
  A backlog older than this is not a delay any longer. The worker runs every
  minute and takes fifty events a tick, so anything still waiting after ten
  minutes means it is not being drained — Meta throttling the account, an
  expired token, or a worker that stopped.
*/
const STALL_MINUTES = 10;

const REFRESH_MS = 30_000;

function minutesSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
}

function formatAge(minutes: number): string {
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч`;
  return `${Math.floor(hours / 24)} дн`;
}

/**
 * The state of the comment queue, in one line.
 *
 * Deliberately quiet when there is nothing to say: a healthy queue is a thin
 * grey line, and only a genuine stall or a run of failures earns colour. A
 * status strip that shouts on every render is one people stop reading, which
 * defeats the point of having it.
 *
 * Split from its loader so the states that matter — a stall, a run of
 * failures — can be rendered and looked at without arranging for a real
 * backlog to exist first.
 */
export const QueueHealthStrip: React.FC<{ rows: InstagramQueueHealth[] }> = ({ rows }) => {
  if (rows.length === 0) return null;

  return (
    <div className="space-y-2">
      {rows.map((row) => {
        // Events waiting on their own reply delay are not a backlog.
        const active = Math.max(row.pending_count - row.waiting_count, 0);
        const age = minutesSince(row.oldest_pending_at);
        const stalled = active > 0 && age >= STALL_MINUTES;
        const failing = row.failed_24h > 0;

        return (
          <div
            key={row.instagram_account_id}
            className={cn(
              'flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-3.5 py-2.5 text-xs',
              stalled
                ? 'border-red-200 bg-red-50 text-red-700'
                : failing
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-gray-200 bg-gray-50 text-gray-600',
            )}
          >
            <span className="flex items-center gap-1.5 font-medium">
              {stalled
                ? <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0" />
                : failing
                ? <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0" />
                : active > 0
                ? <ArrowPathIcon className="h-4 w-4 flex-shrink-0 animate-spin" />
                : <CheckCircleIcon className="h-4 w-4 flex-shrink-0 text-green-600" />}
              @{row.username}
            </span>

            {stalled ? (
              <span>
                Очередь не разбирается: <span className="tabular font-medium">{active}</span>{' '}
                {active === 1 ? 'событие ждёт' : 'событий ждут'} уже {formatAge(age)}.
                Проверьте токен на вкладке «Аккаунты».
              </span>
            ) : active > 0 ? (
              <span className="flex items-center gap-1.5">
                <ClockIcon className="h-3.5 w-3.5" />
                В обработке <span className="tabular font-medium">{active}</span>
              </span>
            ) : (
              <span>Очередь пуста</span>
            )}

            {row.waiting_count > 0 && (
              <span className="text-gray-500">
                ждут паузы: <span className="tabular">{row.waiting_count}</span>
              </span>
            )}

            <span className={cn('ml-auto flex items-center gap-4', stalled && 'text-red-700')}>
              <span>
                за час <span className="tabular font-medium">{row.sent_last_hour}</span>
              </span>
              <span>
                за сутки <span className="tabular font-medium">{row.sent_24h}</span>
              </span>
              {failing && (
                <span className="font-medium">
                  ошибок <span className="tabular">{row.failed_24h}</span>
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
};

/** Loads the queue state and keeps it current while the page is open. */
const AutomationQueueHealth: React.FC = () => {
  const [rows, setRows] = useState<InstagramQueueHealth[]>([]);

  const load = useCallback(async () => {
    const { data } = await supabase.from('instagram_queue_health').select('*');
    setRows((data ?? []) as InstagramQueueHealth[]);
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  return <QueueHealthStrip rows={rows} />;
};

export default AutomationQueueHealth;
