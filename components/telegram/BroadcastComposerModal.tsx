import React, { useEffect, useMemo, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import type {
  BroadcastSegment,
  TelegramBot,
  TelegramFunnel,
} from '../../types';
import { Badge, Button, Callout, Field, Input, Select, Switch, Textarea } from '../ui';
import {
  countSegment,
  SEGMENT_LABELS,
  type BroadcastDraft,
} from '../../services/telegramService';
import TelegramChatPreview, { type PreviewMessage } from './TelegramChatPreview';

export const blankBroadcast = (botId: string): BroadcastDraft => ({
  id: null,
  telegram_bot_id: botId,
  title: '',
  message_text: '',
  button_text: '',
  button_url: '',
  disable_notification: false,
  segment: 'all',
  segment_funnel_id: null,
  scheduled_at: null,
  status: 'draft',
});

/** `datetime-local` wants local wall-clock time, the database wants UTC. */
function toLocalInputValue(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

interface BroadcastComposerModalProps {
  initial: BroadcastDraft;
  bot: TelegramBot;
  funnels: TelegramFunnel[];
  saving: boolean;
  onClose: () => void;
  /** `send` decides whether the draft is handed to the worker or just stored. */
  onSave: (draft: BroadcastDraft, send: boolean) => void;
}

const BroadcastComposerModal: React.FC<BroadcastComposerModalProps> = ({
  initial,
  bot,
  funnels,
  saving,
  onClose,
  onSave,
}) => {
  const [form, setForm] = useState<BroadcastDraft>(initial);
  const [later, setLater] = useState(Boolean(initial.scheduled_at));
  const [when, setWhen] = useState(toLocalInputValue(initial.scheduled_at));
  const [recipients, setRecipients] = useState<number | null>(null);

  const set = <K extends keyof BroadcastDraft>(key: K, value: BroadcastDraft[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  /*
    The audience size is the one number that decides whether this message is
    worth sending, so it is resolved against the same filters the worker uses
    rather than estimated in the interface.
  */
  useEffect(() => {
    let cancelled = false;
    setRecipients(null);
    countSegment(bot.id, form.segment, form.segment_funnel_id)
      .then((count) => {
        if (!cancelled) setRecipients(count);
      })
      .catch(() => {
        if (!cancelled) setRecipients(null);
      });
    return () => {
      cancelled = true;
    };
  }, [bot.id, form.segment, form.segment_funnel_id]);

  const messages: PreviewMessage[] = useMemo(() => [{
    id: 'broadcast',
    text: form.message_text,
    buttons: [{ text: form.button_text, url: form.button_url }],
  }], [form.message_text, form.button_text, form.button_url]);

  const scheduledAt = later && when ? new Date(when).toISOString() : null;
  const canSend = form.message_text.trim().length > 0 && (recipients ?? 0) > 0;

  const submit = (send: boolean) => {
    if (!form.message_text.trim()) return;
    onSave({ ...form, scheduled_at: scheduledAt }, send);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/60 p-4 backdrop-blur-sm">
      <div className="animate-in fade-in zoom-in-95 my-4 w-full max-w-5xl rounded-3xl border border-gray-200/90 bg-white shadow-2xl duration-150">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 rounded-t-3xl border-b border-gray-100 bg-white/95 p-5 backdrop-blur-sm sm:p-6">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-gray-900">
              {form.id ? 'Редактировать рассылку' : 'Новая рассылка'}
            </h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Сообщение уйдёт подписчикам бота — в Telegram нет окна в 24 часа
            </p>
          </div>
          <Button
            variant="ghost"
            iconOnly
            onClick={onClose}
            title="Закрыть"
            aria-label="Закрыть"
            icon={<XMarkIcon className="h-5 w-5" />}
          />
        </div>

        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-12">
          <div className="space-y-5 lg:col-span-7">
            <Field label="Название" hint="Видно только вам, в списке рассылок">
              {({ id }) => (
                <Input
                  id={id}
                  value={form.title}
                  placeholder="Анонс вебинара"
                  onChange={(event) => set('title', event.target.value)}
                />
              )}
            </Field>

            <Field label="Текст сообщения" required>
              {({ id }) => (
                <Textarea
                  id={id}
                  required
                  rows={6}
                  value={form.message_text}
                  placeholder="Что вы хотите сказать подписчикам?"
                  onChange={(event) => set('message_text', event.target.value)}
                />
              )}
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Текст кнопки" hint="Необязательно">
                {({ id }) => (
                  <Input
                    id={id}
                    value={form.button_text}
                    onChange={(event) => set('button_text', event.target.value)}
                  />
                )}
              </Field>
              <Field label="Ссылка кнопки">
                {({ id }) => (
                  <Input
                    id={id}
                    type="url"
                    placeholder="https://"
                    value={form.button_url}
                    onChange={(event) => set('button_url', event.target.value)}
                  />
                )}
              </Field>
            </div>

            <div className="space-y-4 rounded-xl border border-gray-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900">Кому отправить</p>
                {recipients !== null && (
                  <Badge tone={recipients > 0 ? 'accent' : 'warning'}>
                    {recipients} получателей
                  </Badge>
                )}
              </div>

              <Field label="Сегмент">
                {({ id }) => (
                  <Select
                    id={id}
                    value={form.segment}
                    onChange={(event) => set('segment', event.target.value as BroadcastSegment)}
                  >
                    {(Object.keys(SEGMENT_LABELS) as BroadcastSegment[]).map((segment) => (
                      <option key={segment} value={segment}>
                        {SEGMENT_LABELS[segment]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              {form.segment === 'funnel' && (
                <Field label="Воронка">
                  {({ id }) => (
                    <Select
                      id={id}
                      value={form.segment_funnel_id ?? ''}
                      onChange={(event) => set('segment_funnel_id', event.target.value || null)}
                    >
                      <option value="">Выберите воронку</option>
                      {funnels.map((funnel) => (
                        <option key={funnel.id} value={funnel.id}>{funnel.name}</option>
                      ))}
                    </Select>
                  )}
                </Field>
              )}

              <p className="text-2xs leading-relaxed text-gray-500">
                Заблокировавшие бота и отписавшиеся исключаются автоматически — в счётчике только
                те, кто действительно получит сообщение.
              </p>
            </div>

            <div className="space-y-4 rounded-xl border border-gray-200 p-4">
              <Switch
                checked={later}
                onChange={setLater}
                label="Запланировать на время"
              />

              {later && (
                <Field label="Дата и время" hint="В вашем часовом поясе">
                  {({ id }) => (
                    <Input
                      id={id}
                      type="datetime-local"
                      value={when}
                      onChange={(event) => setWhen(event.target.value)}
                    />
                  )}
                </Field>
              )}

              <Switch
                checked={form.disable_notification}
                onChange={(checked) => set('disable_notification', checked)}
                label="Без звука"
              />
            </div>

            {recipients === 0 && (
              <Callout tone="warning">
                В этом сегменте пока никого нет. Рассылку можно сохранить черновиком и отправить,
                когда появятся подписчики.
              </Callout>
            )}
          </div>

          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-24">
              <TelegramChatPreview
                botName={bot.bot_name}
                botUsername={bot.bot_username}
                messages={messages}
                emptyHint="Напишите текст — здесь появится сообщение так, как его увидит подписчик."
              />

              <div className="mt-4 space-y-2">
                <Button
                  variant="primary"
                  fullWidth
                  loading={saving}
                  disabled={!canSend}
                  onClick={() => submit(true)}
                >
                  {later ? 'Запланировать отправку' : 'Отправить сейчас'}
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    fullWidth
                    disabled={saving || !form.message_text.trim()}
                    onClick={() => submit(false)}
                  >
                    Сохранить черновик
                  </Button>
                  <Button variant="ghost" fullWidth onClick={onClose}>
                    Отмена
                  </Button>
                </div>
              </div>

              <p className="mt-3 text-2xs leading-relaxed text-gray-500">
                Отправка идёт на сервере примерно 25 сообщений в секунду. Вкладку можно закрыть —
                рассылка продолжится и переживёт перезапуск.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BroadcastComposerModal;
