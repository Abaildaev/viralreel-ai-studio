import React, { useEffect, useMemo, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import type {
  BroadcastSegment,
  TelegramBot,
  TelegramFunnel,
} from '../../types';
import { Badge, Button, Callout, Field, Input, Select, Switch, Textarea } from '../ui';
import AttachmentPicker from '../AttachmentPicker';
import { NO_ATTACHMENT, type MessageAttachment } from '../../types';
import CustomDatePicker from '../CustomDatePicker';
import CustomTimePicker from '../CustomTimePicker';
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
  ...NO_ATTACHMENT,
});

const pad = (value: number) => String(value).padStart(2, '0');

/** The pickers speak local wall-clock time; the database stores UTC. */
function toLocalParts(iso: string | null): { date: string; time: string } {
  const value = iso ? new Date(iso) : null;
  const base = value && !Number.isNaN(value.getTime()) ? value : null;
  if (!base) return { date: '', time: '' };

  return {
    date: `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`,
    time: `${pad(base.getHours())}:${pad(base.getMinutes())}`,
  };
}

/**
 * Rebuilds an instant from the two pickers.
 *
 * Constructed field by field rather than by parsing a joined string, because
 * `new Date("2026-08-16T09:00")` is interpreted differently across engines —
 * and a broadcast that goes out at the wrong hour is not a bug anyone catches
 * before the readers do.
 */
function toIso(date: string, time: string): string | null {
  if (!date) return null;
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = (time || '12:00').split(':').map(Number);
  if (!year || !month || !day) return null;

  return new Date(year, month - 1, day, hour || 0, minute || 0, 0, 0).toISOString();
}

function todayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * A default that is never already in the past.
 *
 * Opening the scheduler on "today at noon" greets anyone working in the
 * afternoon with a warning about a time that has gone — the form complaining
 * about a value it chose itself. An hour from now, rounded up to the half
 * hour, is always valid and usually close to what was meant.
 */
function defaultWhen(): { date: string; time: string } {
  const when = new Date(Date.now() + 60 * 60 * 1000);
  when.setMinutes(when.getMinutes() > 30 ? 60 : 30, 0, 0);

  return {
    date: `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`,
    time: `${pad(when.getHours())}:${pad(when.getMinutes())}`,
  };
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
  const [when, setWhen] = useState(() => {
    const parts = toLocalParts(initial.scheduled_at);
    // A fresh schedule opens on a valid moment rather than empty, so turning
    // the switch on is one decision instead of three.
    return parts.date ? parts : defaultWhen();
  });
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
    attachment: {
      attachment_type: form.attachment_type,
      attachment_path: form.attachment_path,
      attachment_name: form.attachment_name,
    },
  }], [
    form.message_text,
    form.button_text,
    form.button_url,
    form.attachment_type,
    form.attachment_path,
    form.attachment_name,
  ]);

  const scheduledAt = later ? toIso(when.date, when.time) : null;
  const inThePast = Boolean(scheduledAt && new Date(scheduledAt).getTime() < Date.now());
  /* A photo with no words is a legitimate broadcast, so "has something to
     say" means text or a file — not text alone. */
  const hasContent = form.message_text.trim().length > 0 || form.attachment_type !== 'none';
  const canSend = hasContent && (recipients ?? 0) > 0;

  const submit = (send: boolean) => {
    if (!hasContent) return;
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

            <Field label="Вложение">
              {({ id }) => (
                <AttachmentPicker
                  id={id}
                  value={form}
                  onChange={(attachment: MessageAttachment) =>
                    setForm((current) => ({ ...current, ...attachment }))}
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
                <div className="space-y-2">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <CustomDatePicker
                      label="Дата"
                      value={when.date}
                      minDate={todayString()}
                      onChange={(date) => setWhen((current) => ({ ...current, date }))}
                    />
                    <CustomTimePicker
                      label="Время"
                      value={when.time}
                      onChange={(time) => setWhen((current) => ({ ...current, time }))}
                    />
                  </div>

                  <p className="text-2xs text-gray-500">
                    Время местное — {Intl.DateTimeFormat().resolvedOptions().timeZone}
                  </p>

                  {inThePast && (
                    <Callout tone="warning">
                      Это время уже прошло — рассылка уйдёт сразу после сохранения.
                    </Callout>
                  )}
                </div>
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
                    disabled={saving || !hasContent}
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
