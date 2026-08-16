import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckIcon,
  ClipboardDocumentIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import type { LeadMagnet, TelegramBot } from '../../types';
import { Button, Callout, Field, Input, Select, Switch, Textarea } from '../ui';
import { funnelDeepLink, slugify, type FunnelDraft } from '../../services/telegramService';
import TelegramChatPreview, { type PreviewMessage } from './TelegramChatPreview';

export const blankFunnel = (botId: string): FunnelDraft => ({
  id: null,
  telegram_bot_id: botId,
  lead_magnet_id: null,
  name: '',
  slug: '',
  welcome_text: 'Привет! 👋 Спасибо, что заглянули — сейчас всё отправлю.',
  require_subscription: true,
  subscribe_button_text: 'Подписаться на канал',
  check_button_text: 'Я подписался',
  not_subscribed_text: 'Остался один шаг: подпишитесь на канал, и я сразу пришлю материал 👇',
  delivery_text: 'Готово! Забирайте материал по кнопке ниже 🎁',
  delivery_url: '',
  delivery_button_text: 'Забрать материал',
  cta_text: 'Кстати, такие Reels можно собирать автоматически — попробуйте в сервисе.',
  cta_url: '',
  cta_button_text: 'Открыть сервис',
  is_active: true,
  is_default: false,
});

interface FunnelEditorModalProps {
  initial: FunnelDraft;
  bot: TelegramBot;
  leadMagnets: LeadMagnet[];
  saving: boolean;
  onClose: () => void;
  onSave: (draft: FunnelDraft) => void;
}

const FunnelEditorModal: React.FC<FunnelEditorModalProps> = ({
  initial,
  bot,
  leadMagnets,
  saving,
  onClose,
  onSave,
}) => {
  const [form, setForm] = useState<FunnelDraft>(initial);
  const [copied, setCopied] = useState(false);
  /* An edited funnel keeps the slug its links already point at; only a new one
     tracks the name, and only until the owner types a slug of their own. */
  const [slugTouched, setSlugTouched] = useState(Boolean(initial.id));

  const set = <K extends keyof FunnelDraft>(key: K, value: FunnelDraft[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const deepLink = funnelDeepLink(bot.bot_username, form.slug || 'slug');
  const gated = form.require_subscription && Boolean(bot.channel_id);

  const messages: PreviewMessage[] = useMemo(() => {
    const channelUrl = bot.channel_invite_url ||
      (bot.channel_username ? `https://t.me/${bot.channel_username.replace(/^@/, '')}` : '');

    const list: PreviewMessage[] = [
      { id: 'welcome', step: 'Шаг 1 · Приветствие', text: form.welcome_text },
    ];

    if (gated) {
      list.push({
        id: 'gate',
        step: 'Шаг 2 · Просьба подписаться',
        conditional: true,
        text: form.not_subscribed_text,
        buttons: [
          { text: form.subscribe_button_text, url: channelUrl },
          { text: form.check_button_text, callback: true },
        ],
      });
    }

    list.push({
      id: 'delivery',
      step: `Шаг ${gated ? 3 : 2} · Выдача лид-магнита`,
      text: form.delivery_text,
      buttons: [{ text: form.delivery_button_text, url: form.delivery_url }],
    });

    if (form.cta_text.trim()) {
      list.push({
        id: 'cta',
        step: `Шаг ${gated ? 4 : 3} · Целевое действие`,
        text: form.cta_text,
        buttons: [{ text: form.cta_button_text, url: form.cta_url }],
      });
    }

    return list;
  }, [form, gated, bot]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(deepLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be denied; the link is selectable in the field.
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const slug = slugify(form.slug || form.name);
    if (!form.name.trim() || slug.length < 2) return;
    onSave({ ...form, slug });
  };

  const slugError = form.slug && slugify(form.slug).length < 2
    ? 'Минимум 2 символа: латиница и цифры'
    : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/60 p-4 backdrop-blur-sm">
      <div className="animate-in fade-in zoom-in-95 my-4 w-full max-w-6xl rounded-3xl border border-gray-200/90 bg-white shadow-2xl duration-150">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 rounded-t-3xl border-b border-gray-100 bg-white/95 p-5 backdrop-blur-sm sm:p-6">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-gray-900">
              {form.id ? 'Редактировать воронку' : 'Новая воронка в Telegram'}
            </h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Сценарий, который бот отыграет после перехода из Instagram
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

        <form onSubmit={handleSubmit} className="grid gap-6 p-5 sm:p-6 lg:grid-cols-12">
          <div className="space-y-5 lg:col-span-7">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Название воронки" required>
                {({ id }) => (
                  <Input
                    id={id}
                    required
                    value={form.name}
                    placeholder="Гайд по Reels"
                    onChange={(event) => {
                      const name = event.target.value;
                      setForm((current) => ({
                        ...current,
                        name,
                        slug: slugTouched ? current.slug : slugify(name),
                      }));
                    }}
                  />
                )}
              </Field>

              <Field
                label="Код ссылки"
                error={slugError}
                hint="Латиница и цифры — попадёт в ссылку после ?start="
                required
              >
                {({ id, invalid }) => (
                  <Input
                    id={id}
                    required
                    invalid={invalid}
                    value={form.slug}
                    placeholder="guide"
                    onChange={(event) => {
                      setSlugTouched(true);
                      set('slug', slugify(event.target.value));
                    }}
                  />
                )}
              </Field>
            </div>

            {/*
              The link is the whole integration: paste it into the Instagram
              rule's button and the two halves become one funnel. Putting it at
              the top of the editor is the difference between an obvious next
              step and a feature nobody connects.
            */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3.5">
              <p className="mb-2 text-xs font-medium text-gray-700">
                Ссылка для кнопки в Instagram Direct
              </p>
              <div className="flex items-center gap-2">
                <code className="scroll-x min-w-0 flex-1 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-2xs text-gray-700">
                  {bot.bot_username ? deepLink : 'Сначала подключите бота на вкладке «Бот»'}
                </code>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleCopy}
                  disabled={!bot.bot_username}
                  icon={
                    copied
                      ? <CheckIcon className="h-3.5 w-3.5" />
                      : <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                  }
                >
                  {copied ? 'Скопировано' : 'Копировать'}
                </Button>
              </div>
              <p className="mt-2 text-2xs leading-relaxed text-gray-500">
                Сервис сам добавит к ссылке идентификатор события — благодаря ему видно, какое
                кодовое слово и какой Reels привели каждого подписчика.
              </p>
            </div>

            <Field
              label="Кодовое слово в Instagram"
              hint="Связывает воронку с правилом Comment-to-DM для сквозной аналитики"
            >
              {({ id }) => (
                <Select
                  id={id}
                  value={form.lead_magnet_id ?? ''}
                  onChange={(event) => set('lead_magnet_id', event.target.value || null)}
                >
                  <option value="">Не связывать</option>
                  {leadMagnets.map((magnet) => (
                    <option key={magnet.id} value={magnet.id}>
                      {magnet.title}
                      {magnet.keywords?.length ? ` · ${magnet.keywords.join(', ')}` : ''}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Приветствие" required>
              {({ id }) => (
                <Textarea
                  id={id}
                  required
                  rows={3}
                  value={form.welcome_text}
                  onChange={(event) => set('welcome_text', event.target.value)}
                />
              )}
            </Field>

            <div className="space-y-4 rounded-xl border border-gray-200 p-4">
              <Switch
                checked={form.require_subscription}
                onChange={(checked) => set('require_subscription', checked)}
                label="Выдавать материал только после подписки на канал"
              />

              {form.require_subscription && !bot.channel_id && (
                <Callout tone="warning">
                  Канал не подключён — пока бот не станет его администратором, проверка подписки
                  не сработает и материал уйдёт сразу. Подключите канал на вкладке «Бот».
                </Callout>
              )}

              {form.require_subscription && (
                <div className="space-y-4">
                  <Field label="Текст просьбы подписаться">
                    {({ id }) => (
                      <Textarea
                        id={id}
                        rows={2}
                        value={form.not_subscribed_text}
                        onChange={(event) => set('not_subscribed_text', event.target.value)}
                      />
                    )}
                  </Field>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Кнопка на канал">
                      {({ id }) => (
                        <Input
                          id={id}
                          value={form.subscribe_button_text}
                          onChange={(event) => set('subscribe_button_text', event.target.value)}
                        />
                      )}
                    </Field>
                    <Field label="Кнопка проверки">
                      {({ id }) => (
                        <Input
                          id={id}
                          value={form.check_button_text}
                          onChange={(event) => set('check_button_text', event.target.value)}
                        />
                      )}
                    </Field>
                  </div>

                  <p className="text-2xs leading-relaxed text-gray-500">
                    Кнопку можно и не нажимать: бот замечает вступление в канал сам и отправляет
                    материал в тот же момент.
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-4 rounded-xl border border-gray-200 p-4">
              <p className="text-sm font-semibold text-gray-900">Выдача материала</p>

              <Field label="Текст">
                {({ id }) => (
                  <Textarea
                    id={id}
                    rows={2}
                    value={form.delivery_text}
                    onChange={(event) => set('delivery_text', event.target.value)}
                  />
                )}
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Ссылка на материал" hint="PDF, Notion, папка — что угодно">
                  {({ id }) => (
                    <Input
                      id={id}
                      type="url"
                      placeholder="https://"
                      value={form.delivery_url}
                      onChange={(event) => set('delivery_url', event.target.value)}
                    />
                  )}
                </Field>
                <Field label="Текст кнопки">
                  {({ id }) => (
                    <Input
                      id={id}
                      value={form.delivery_button_text}
                      onChange={(event) => set('delivery_button_text', event.target.value)}
                    />
                  )}
                </Field>
              </div>
            </div>

            <div className="space-y-4 rounded-xl border border-gray-200 p-4">
              <p className="text-sm font-semibold text-gray-900">
                Целевое действие
                <span className="ml-2 text-xs font-normal text-gray-500">необязательно</span>
              </p>

              <Field label="Текст" hint="Второе сообщение, когда материал уже у человека">
                {({ id }) => (
                  <Textarea
                    id={id}
                    rows={2}
                    value={form.cta_text}
                    onChange={(event) => set('cta_text', event.target.value)}
                  />
                )}
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Ссылка">
                  {({ id }) => (
                    <Input
                      id={id}
                      type="url"
                      placeholder="https://"
                      value={form.cta_url}
                      onChange={(event) => set('cta_url', event.target.value)}
                    />
                  )}
                </Field>
                <Field label="Текст кнопки">
                  {({ id }) => (
                    <Input
                      id={id}
                      value={form.cta_button_text}
                      onChange={(event) => set('cta_button_text', event.target.value)}
                    />
                  )}
                </Field>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <Switch
                checked={form.is_active}
                onChange={(checked) => set('is_active', checked)}
                label="Воронка включена"
              />
              <Switch
                checked={form.is_default}
                onChange={(checked) => set('is_default', checked)}
                label="Отвечать на /start без ссылки"
              />
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-24">
              <TelegramChatPreview
                botName={bot.bot_name}
                botUsername={bot.bot_username}
                messages={messages}
              />

              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="secondary" onClick={onClose} fullWidth className="sm:w-auto">
                  Отмена
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  loading={saving}
                  fullWidth
                  className="sm:w-auto"
                >
                  {form.id ? 'Сохранить' : 'Создать воронку'}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default FunnelEditorModal;
