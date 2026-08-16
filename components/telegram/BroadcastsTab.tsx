import React from 'react';
import {
  PaperAirplaneIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import type { BroadcastStatus, TelegramBroadcast } from '../../types';
import { Badge, Button, EmptyState, SkeletonList, type BadgeTone } from '../ui';
import { SEGMENT_LABELS } from '../../services/telegramService';

const STATUS_LABELS: Record<BroadcastStatus, { text: string; tone: BadgeTone }> = {
  draft: { text: 'черновик', tone: 'neutral' },
  scheduled: { text: 'запланирована', tone: 'accent' },
  sending: { text: 'отправляется', tone: 'warning' },
  sent: { text: 'отправлена', tone: 'success' },
  failed: { text: 'ошибка', tone: 'danger' },
  cancelled: { text: 'отменена', tone: 'neutral' },
};

function formatWhen(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface BroadcastsTabProps {
  broadcasts: TelegramBroadcast[];
  loading: boolean;
  onCreate: () => void;
  onEdit: (broadcast: TelegramBroadcast) => void;
  onCancel: (broadcast: TelegramBroadcast) => void;
  onDelete: (broadcast: TelegramBroadcast) => void;
}

const BroadcastsTab: React.FC<BroadcastsTabProps> = ({
  broadcasts,
  loading,
  onCreate,
  onEdit,
  onCancel,
  onDelete,
}) => {
  if (loading) return <SkeletonList rows={3} />;

  if (broadcasts.length === 0) {
    return (
      <EmptyState
        icon={<PaperAirplaneIcon className="h-6 w-6" />}
        title="Рассылок пока нет"
        description="Подписчик в Telegram остаётся доступен навсегда — в отличие от Instagram, где написать можно только в течение 24 часов после его сообщения."
        action={
          <Button variant="primary" onClick={onCreate} icon={<PlusIcon className="h-4 w-4" />}>
            Создать рассылку
          </Button>
        }
      />
    );
  }

  return (
    <div className="animate-in fade-in space-y-3">
      {broadcasts.map((broadcast) => {
        const status = STATUS_LABELS[broadcast.status];
        const inFlight = broadcast.status === 'sending';
        const progress = broadcast.total_recipients > 0
          ? Math.round(((broadcast.sent_count + broadcast.failed_count) / broadcast.total_recipients) * 100)
          : 0;

        return (
          <div key={broadcast.id} className="card p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-sm font-semibold text-gray-900">
                    {broadcast.title || 'Без названия'}
                  </h3>
                  <Badge tone={status.tone} dot={inFlight}>{status.text}</Badge>
                </div>

                <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-gray-600">
                  {broadcast.message_text || '—'}
                </p>

                <p className="mt-2 text-2xs text-gray-500">
                  {SEGMENT_LABELS[broadcast.segment]}
                  {broadcast.scheduled_at && ` · ${formatWhen(broadcast.scheduled_at)}`}
                  {broadcast.total_recipients > 0 && ` · ${broadcast.total_recipients} получателей`}
                </p>

                {broadcast.error_message && (
                  <p className="mt-2 text-2xs text-red-600">{broadcast.error_message}</p>
                )}
              </div>

              <div className="flex flex-shrink-0 items-center gap-1">
                {(broadcast.status === 'draft' || broadcast.status === 'scheduled' ||
                  broadcast.status === 'failed' || broadcast.status === 'cancelled') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    title="Редактировать"
                    onClick={() => onEdit(broadcast)}
                    icon={<PencilSquareIcon className="h-4 w-4" />}
                  />
                )}
                {broadcast.status === 'scheduled' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    title="Отменить отправку"
                    onClick={() => onCancel(broadcast)}
                    icon={<XCircleIcon className="h-4 w-4" />}
                  />
                )}
                {!inFlight && (
                  <Button
                    variant="danger"
                    size="sm"
                    iconOnly
                    title="Удалить"
                    onClick={() => onDelete(broadcast)}
                    icon={<TrashIcon className="h-4 w-4" />}
                  />
                )}
              </div>
            </div>

            {(inFlight || broadcast.status === 'sent') && broadcast.total_recipients > 0 && (
              <div className="mt-4 border-t border-gray-100 pt-3">
                <div className="mb-1.5 flex items-center justify-between text-2xs text-gray-500">
                  <span>
                    Доставлено <span className="tabular font-medium text-gray-700">{broadcast.sent_count}</span>
                    {broadcast.failed_count > 0 && (
                      <> · не дошло <span className="tabular font-medium text-gray-700">{broadcast.failed_count}</span></>
                    )}
                  </span>
                  <span className="tabular">{progress}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-brand-600 transition-all duration-500"
                    style={{ width: `${Math.min(progress, 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default BroadcastsTab;
