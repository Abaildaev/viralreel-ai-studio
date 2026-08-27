import React, { useState } from 'react';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  LinkIcon,
  MegaphoneIcon,
  ShieldCheckIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import type { TelegramBot } from '../../types';
import { Badge, Button, Callout, Card, Field, Input, Section, Switch } from '../ui';
import { useConfirm } from '../../contexts/ModalContext';
import { getErrorMessage } from '../../utils/errorMessage';
import {
  connectBot,
  disconnectBot,
  refreshWebhook,
  setBotChannel,
  updateBot,
  verifySubscriptionSetup,
} from '../../services/telegramService';

interface BotSetupTabProps {
  bot: TelegramBot | null;
  onChanged: () => Promise<void> | void;
}

const BotSetupTab: React.FC<BotSetupTabProps> = ({ bot, onChanged }) => {
  const { confirm, toast } = useConfirm();

  const [token, setToken] = useState('');
  const [channel, setChannel] = useState('');
  const [goal, setGoal] = useState(String(bot?.subscriber_goal ?? 1000));
  const [busy, setBusy] = useState<
    'connect' | 'channel' | 'subscription' | 'webhook' | 'disconnect' | 'goal' | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: typeof busy, action: () => Promise<void>, success: string) => {
    setBusy(kind);
    setError(null);
    try {
      await action();
      await onChanged();
      toast(success);
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  const handleDisconnect = async () => {
    const confirmed = await confirm({
      title: 'Отключить бота?',
      message:
        'Воронки, подписчики и рассылки будут удалены вместе с ботом. Ссылки ?start= перестанут работать.',
      variant: 'danger',
    });
    if (!confirmed) return;
    await run('disconnect', async () => {
      await disconnectBot();
    }, 'Бот отключён');
  };

  return (
    <div className="animate-in fade-in grid gap-6 lg:grid-cols-12">
      <div className="space-y-6 lg:col-span-7">
        <Section
          icon={<ShieldCheckIcon className="h-5 w-5" />}
          title="Бот Telegram"
          hint="Токен шифруется на сервере и обратно в браузер не возвращается — его можно только заменить или удалить."
        >
          {bot ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3.5">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
                  {(bot.bot_name || 'B').slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">{bot.bot_name}</p>
                  <p className="truncate text-xs text-gray-500">@{bot.bot_username}</p>
                </div>
                {bot.webhook_set_at
                  ? <Badge tone="success" dot>вебхук активен</Badge>
                  : <Badge tone="warning" dot>вебхук не установлен</Badge>}
              </div>

              {bot.last_error && (
                <Callout tone="danger">
                  Последняя ошибка: {bot.last_error}
                </Callout>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  loading={busy === 'webhook'}
                  icon={<ArrowPathIcon className="h-4 w-4" />}
                  onClick={() => run('webhook', async () => {
                    await refreshWebhook();
                  }, 'Вебхук переустановлен')}
                >
                  Переустановить вебхук
                </Button>
                <Button
                  variant="danger"
                  loading={busy === 'disconnect'}
                  icon={<TrashIcon className="h-4 w-4" />}
                  onClick={handleDisconnect}
                >
                  Отключить бота
                </Button>
              </div>

              <Switch
                checked={bot.is_active}
                onChange={(checked) => run('goal', async () => {
                  await updateBot(bot.id, { is_active: checked });
                }, checked ? 'Бот включён' : 'Бот выключен — воронки не отвечают')}
                label="Бот отвечает на сообщения"
              />
            </div>
          ) : (
            <div className="space-y-4">
              <Callout tone="info">
                Создайте бота в <span className="font-medium">@BotFather</span>, отправьте
                команду <span className="font-medium">/newbot</span> и вставьте выданный токен сюда.
              </Callout>

              <Field label="Токен бота" required>
                {({ id }) => (
                  <Input
                    id={id}
                    type="password"
                    autoComplete="off"
                    placeholder="1234567890:AA..."
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                  />
                )}
              </Field>

              <Button
                variant="primary"
                disabled={!token.trim()}
                loading={busy === 'connect'}
                onClick={() => run('connect', async () => {
                  await connectBot(token.trim());
                  setToken('');
                }, 'Бот подключён')}
              >
                Подключить бота
              </Button>
            </div>
          )}

          {error && <Callout tone="danger" className="mt-4">{error}</Callout>}
        </Section>

        {bot && (
          <Section
            icon={<MegaphoneIcon className="h-5 w-5" />}
            title="Канал для подписки"
            hint="Бот должен быть администратором канала — иначе он не сможет проверить, подписался ли человек."
          >
            {bot.channel_id ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3.5">
                  <CheckCircleIcon className="h-5 w-5 flex-shrink-0 text-green-600" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {bot.channel_title || 'Канал подключён'}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {bot.channel_username ? `@${bot.channel_username}` : bot.channel_id}
                    </p>
                  </div>
                  {bot.channel_invite_url && (
                    <a
                      href={bot.channel_invite_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900"
                    >
                      <LinkIcon className="h-3.5 w-3.5" />
                      Открыть
                    </a>
                  )}
                </div>

                <Button
                  variant="secondary"
                  loading={busy === 'subscription'}
                  icon={<ShieldCheckIcon className="h-4 w-4" />}
                  onClick={() => run('subscription', async () => {
                    await verifySubscriptionSetup();
                  }, 'Подписка работает: бот — администратор, webhook получает вступления')}
                >
                  Проверить канал и подписку
                </Button>

                <Field label="Заменить канал" hint="Укажите @имя или числовой ID">
                  {({ id }) => (
                    <Input
                      id={id}
                      value={channel}
                      placeholder="@my_channel"
                      onChange={(event) => setChannel(event.target.value)}
                    />
                  )}
                </Field>
                <Button
                  variant="secondary"
                  disabled={!channel.trim()}
                  loading={busy === 'channel'}
                  onClick={() => run('channel', async () => {
                    await setBotChannel(channel.trim());
                    setChannel('');
                  }, 'Канал обновлён')}
                >
                  Сохранить канал
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <Field label="Канал" hint="Укажите @имя канала или числовой ID" required>
                  {({ id }) => (
                    <Input
                      id={id}
                      value={channel}
                      placeholder="@my_channel"
                      onChange={(event) => setChannel(event.target.value)}
                    />
                  )}
                </Field>
                <Button
                  variant="primary"
                  disabled={!channel.trim()}
                  loading={busy === 'channel'}
                  onClick={() => run('channel', async () => {
                    await setBotChannel(channel.trim());
                    setChannel('');
                  }, 'Канал подключён')}
                >
                  Подключить канал
                </Button>
              </div>
            )}
          </Section>
        )}
      </div>

      <div className="space-y-6 lg:col-span-5">
        <Card className="border-brand-100 bg-brand-50/30">
          <h2 className="text-base font-semibold text-gray-900">Как всё связано</h2>
          <ol className="mt-5 space-y-4">
            {[
              'Человек пишет кодовое слово под Reels в Instagram.',
              'Правило Comment-to-DM отправляет ему Direct с кнопкой на бота.',
              'Бот здоровается и просит подписаться на канал.',
              'После подписки выдаёт материал и предлагает целевое действие.',
              'Дальше вы пишете подписчику рассылками — без ограничения 24 часов.',
            ].map((step, index) => (
              <li key={index} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                  {index + 1}
                </span>
                <p className="text-sm leading-relaxed text-gray-700">{step}</p>
              </li>
            ))}
          </ol>
        </Card>

        {bot && (
          <Section title="Цель по подписчикам" hint="Отображается прогрессом на вкладке «Аналитика»">
            <div className="flex items-end gap-3">
              <Field label="Цель" className="flex-1">
                {({ id }) => (
                  <Input
                    id={id}
                    type="number"
                    min={1}
                    value={goal}
                    onChange={(event) => setGoal(event.target.value)}
                  />
                )}
              </Field>
              <Button
                variant="secondary"
                loading={busy === 'goal'}
                onClick={() => run('goal', async () => {
                  const parsed = Math.max(1, Number(goal) || 1000);
                  await updateBot(bot.id, { subscriber_goal: parsed });
                  setGoal(String(parsed));
                }, 'Цель обновлена')}
                className="mb-[1.375rem]"
              >
                Сохранить
              </Button>
            </div>
          </Section>
        )}
      </div>
    </div>
  );
};

export default BotSetupTab;
