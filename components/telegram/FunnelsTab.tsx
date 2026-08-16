import React, { useState } from 'react';
import {
  CheckIcon,
  ClipboardDocumentIcon,
  FunnelIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import type { TelegramBot, TelegramFunnel, TelegramFunnelStats } from '../../types';
import { Badge, Button, EmptyState, SkeletonList, Switch } from '../ui';
import { funnelDeepLink } from '../../services/telegramService';

interface FunnelsTabProps {
  bot: TelegramBot;
  funnels: TelegramFunnel[];
  stats: TelegramFunnelStats[];
  loading: boolean;
  onCreate: () => void;
  onEdit: (funnel: TelegramFunnel) => void;
  onDelete: (funnel: TelegramFunnel) => void;
  onToggleActive: (funnel: TelegramFunnel, active: boolean) => void;
}

const FunnelsTab: React.FC<FunnelsTabProps> = ({
  bot,
  funnels,
  stats,
  loading,
  onCreate,
  onEdit,
  onDelete,
  onToggleActive,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyLink = async (funnel: TelegramFunnel) => {
    try {
      await navigator.clipboard.writeText(funnelDeepLink(bot.bot_username, funnel.slug));
      setCopiedId(funnel.id);
      setTimeout(() => setCopiedId(null), 1600);
    } catch {
      // Clipboard permission can be denied; the link is visible in the card.
    }
  };

  if (loading) return <SkeletonList rows={3} />;

  if (funnels.length === 0) {
    return (
      <EmptyState
        icon={<FunnelIcon className="h-6 w-6" />}
        title="Воронок пока нет"
        description="Воронка — это то, что бот отвечает человеку, пришедшему из Instagram: приветствие, просьба подписаться и выдача материала."
        action={
          <Button variant="primary" onClick={onCreate} icon={<PlusIcon className="h-4 w-4" />}>
            Создать первую воронку
          </Button>
        }
      />
    );
  }

  return (
    <div className="animate-in fade-in space-y-3">
      {funnels.map((funnel) => {
        const funnelStats = stats.find((row) => row.funnel_id === funnel.id);
        const started = funnelStats?.started_count ?? 0;
        const delivered = funnelStats?.delivered_count ?? 0;
        const conversion = started > 0 ? Math.round((delivered / started) * 100) : 0;

        return (
          <div key={funnel.id} className="card card-interactive p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-sm font-semibold text-gray-900">
                    {funnel.name || 'Без названия'}
                  </h3>
                  {funnel.is_default && <Badge tone="accent">по умолчанию</Badge>}
                  {funnel.require_subscription
                    ? <Badge tone="neutral">с подпиской</Badge>
                    : <Badge tone="neutral">без подписки</Badge>}
                  {!funnel.is_active && <Badge tone="warning">выключена</Badge>}
                </div>

                {funnel.lead_magnets && (
                  <p className="mt-1.5 text-xs text-gray-500">
                    Кодовое слово в Instagram:{' '}
                    <span className="font-medium text-gray-700">
                      {funnel.lead_magnets.codeword || funnel.lead_magnets.title}
                    </span>
                  </p>
                )}

                <div className="mt-3 flex items-center gap-2">
                  <code className="scroll-x min-w-0 flex-1 whitespace-nowrap rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-2xs text-gray-600">
                    {funnelDeepLink(bot.bot_username, funnel.slug)}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    title="Скопировать ссылку"
                    onClick={() => copyLink(funnel)}
                    icon={
                      copiedId === funnel.id
                        ? <CheckIcon className="h-4 w-4 text-green-600" />
                        : <ClipboardDocumentIcon className="h-4 w-4" />
                    }
                  />
                </div>
              </div>

              <div className="flex flex-shrink-0 items-center gap-4 sm:flex-col sm:items-end sm:gap-2">
                <div className="flex items-center gap-4 sm:gap-5">
                  <div className="text-right">
                    <p className="tabular text-lg font-semibold text-gray-900">{started}</p>
                    <p className="text-2xs text-gray-500">пришли</p>
                  </div>
                  <div className="text-right">
                    <p className="tabular text-lg font-semibold text-gray-900">{delivered}</p>
                    <p className="text-2xs text-gray-500">получили</p>
                  </div>
                  <div className="text-right">
                    <p className="tabular text-lg font-semibold text-gray-900">{conversion}%</p>
                    <p className="text-2xs text-gray-500">дошли</p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    title="Редактировать"
                    onClick={() => onEdit(funnel)}
                    icon={<PencilSquareIcon className="h-4 w-4" />}
                  />
                  <Button
                    variant="danger"
                    size="sm"
                    iconOnly
                    title="Удалить"
                    onClick={() => onDelete(funnel)}
                    icon={<TrashIcon className="h-4 w-4" />}
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 border-t border-gray-100 pt-3">
              <Switch
                checked={funnel.is_active}
                onChange={(checked) => onToggleActive(funnel, checked)}
                label="Воронка активна"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default FunnelsTab;
