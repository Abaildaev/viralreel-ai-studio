import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckIcon,
  ClipboardDocumentIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { NO_ATTACHMENT, type LeadMagnet, type TelegramBot } from '../../types';
import { Button, Callout, Field, Input, Select, Switch, Textarea } from '../ui';
import AttachmentPicker from '../AttachmentPicker';
import { funnelDeepLink, slugify, type FunnelDraft } from '../../services/telegramService';
import TelegramChatPreview, { type PreviewMessage } from './TelegramChatPreview';
import FunnelStepsEditor, { newStep, type StepDraft } from './FunnelStepsEditor';
import { formatDelay, orderedSteps } from '../../supabase/functions/_shared/funnel-sequence';

const PROMPT_PARTNER_BOT_URL = 'https://t.me/Integer_ai_bot?start=REF00009284';
const PROMPT_CATALOGUE_URL = 'https://nanobanana-prompts.netlify.app/';
const TELEGRAM_CAPTION_LIMIT = 1024;

/*
  A greeting and then a separate "please subscribe" is two bubbles saying the
  same thing before the reader has been given anything. So a new funnel starts
  with no greeting at all: the gate carries the whole opening pitch, and the
  webhook sends nothing where the greeting would have been.
*/
export const blankFunnel = (botId: string): FunnelDraft => ({
  id: null,
  telegram_bot_id: botId,
  lead_magnet_id: null,
  name: '',
  slug: '',
  welcome_text: '',
  require_subscription: true,
  subscribe_button_text: 'Подписаться и забрать промпты',
  // Kept for backward compatibility with old Telegram messages. New gates are
  // automatic and no longer render a manual check button.
  check_button_text: '',
  not_subscribed_text: 'Промпты из Reels — забирайте 🎁\n\nНейросеть выдаёт слабую картинку не потому, что она плохая. Просто ей не сказали, какой нужен свет, ракурс, фактура и стиль. Всё это и есть промпт — и придумывать его самому больше не нужно.\n\nЯ открываю вам доступ к каталогу из 1000+ готовых промптов. Портрет, предметная съёмка, реклама, интерьеры, фоны — под каждую задачу уже собрана рабочая формула. Копируете, меняете героя или продукт под себя и получаете результат с первой попытки, а не с двадцатой.\n\nУсловие одно: подпишитесь на канал 👇\n\nКак только подпишетесь, бот сам пришлёт каталог.',
  is_active: true,
  is_default: false,
  ...NO_ATTACHMENT,
});

/*
  What a brand-new funnel sends: the promised material, then — with no delay,
  so both land while the reader is still in the chat — where to put it to use.
  Zero-delay steps go out in one pass, which is why the second needs no timer.

  Then three nudges over two days. Handing over the material is easy; getting
  someone to actually use it is the hard half, and it does not happen on the
  first evening. Each nudge comes from a different angle — friction, then
  usefulness, then a plain last call — because the same angle three times reads
  as nagging and gets the bot blocked.
*/
export const defaultSteps = (): StepDraft[] => [
  {
    ...newStep(1, 0),
    title: 'Каталог 1000+ промптов',
    body: 'Готово — каталог ваш 🎁\n\nВнутри 1000+ промптов, разложенных по задачам: портрет, предметная съёмка, реклама, интерьер, фон, свет и стиль. В каждой формуле уже прописаны те детали, из-за которых обычно и получается «не то».\n\nКак пользоваться:\n\n1. Выберите категорию под свою задачу.\n2. Скопируйте промпт целиком, без сокращений.\n3. Замените только героя, продукт или деталь — остальное уже настроено за вас.\n\nСохраните ссылку в закладки. Это не разовый файл: каталог будет под рукой каждый раз, когда нужна картинка, и начинать с чистого листа вам больше не придётся.',
    button_text: 'Открыть 1000+ промптов',
    button_url: PROMPT_CATALOGUE_URL,
  },
  {
    ...newStep(2, 0),
    title: 'Где запускать промпты',
    body: 'И ещё кое-что 👇\n\nПромпт сам по себе картинку не нарисует — его нужно где-то запустить. Чтобы вам не регистрироваться в пяти сервисах и не платить за каждый отдельно, вот бот, где основные нейросети для изображений и видео собраны в одном месте.\n\nИ 2 генерации в нём — бесплатно, в подарок от меня. Ровно столько, чтобы проверить промпт из каталога и увидеть результат своими глазами.\n\nСделайте прямо сейчас, пока не отложилось:\n\nПервую генерацию запустите промптом как есть — увидите, каким должен быть результат. Во второй замените героя на свой продукт. На этой паре сразу видно, как формула работает под вашу задачу.',
    button_text: 'Забрать 2 генерации бесплатно',
    button_url: PROMPT_PARTNER_BOT_URL,
  },
  {
    ...newStep(3, 180),
    title: 'Дожим 1 · две минуты',
    body: 'Загляните на минуту 👀\n\nЕсли каталог ушёл в закладки — это нормально, так делают почти все. И почти все потом к нему не возвращаются.\n\nПоэтому давайте сейчас, пока помните. Не «изучить каталог», а один промпт: откройте бота, вставьте первый попавшийся, нажмите отправить. Две минуты.\n\nПервая картинка — это момент, после которого промпты перестают быть теорией. Пока её нет, каталог остаётся просто ссылкой.',
    button_text: 'Вставить промпт в бота',
    button_url: PROMPT_PARTNER_BOT_URL,
  },
  {
    ...newStep(4, 1260),
    title: 'Дожим 2 · одна деталь за раз',
    body: 'Небольшая хитрость 🧠\n\nОдин промпт из каталога — это не одна картинка. Это десяток, если менять в нём по одной детали за раз.\n\nВозьмите любую формулу и попробуйте так:\n\n1. Запустите как есть.\n2. Поменяйте только фон — та же сцена окажется в другом месте.\n3. Поменяйте только свет — «утро» вместо «студии».\n4. Поменяйте героя на свой продукт.\n\nКаждый раз меняйте одну вещь. За пару минут станет понятно, какая часть промпта за что отвечает, — и дальше вы будете собирать свои формулы сами, уже без инструкции.\n\nПодарочные генерации на месте, если вы их ещё не тратили.',
    button_text: 'Попробовать в боте',
    button_url: PROMPT_PARTNER_BOT_URL,
  },
  {
    ...newStep(5, 1440),
    title: 'Дожим 3 · последнее напоминание',
    body: 'Последнее напоминание, и я отстану 🙌\n\nДва дня назад вы забрали каталог. Дальше есть два варианта.\n\nПервый: ссылка так и лежит в закладках, а визуал вы делаете как раньше — или не делаете вовсе.\n\nВторой: вы тратите десять минут, прогоняете два-три промпта и оставляете себе рабочий инструмент, к которому будете возвращаться каждый раз, когда нужна картинка.\n\nВся разница — один клик по кнопке ниже. Подарочные генерации ждут там же.',
    button_text: 'Открыть бота',
    button_url: PROMPT_PARTNER_BOT_URL,
  },
];

interface FunnelEditorModalProps {
  initial: FunnelDraft;
  initialSteps: StepDraft[];
  bot: TelegramBot;
  leadMagnets: LeadMagnet[];
  saving: boolean;
  onClose: () => void;
  onSave: (draft: FunnelDraft, steps: StepDraft[]) => void;
}

const FunnelEditorModal: React.FC<FunnelEditorModalProps> = ({
  initial,
  initialSteps,
  bot,
  leadMagnets,
  saving,
  onClose,
  onSave,
}) => {
  const [form, setForm] = useState<FunnelDraft>(initial);
  const [steps, setSteps] = useState<StepDraft[]>(initialSteps);
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
  const greeting = form.welcome_text.trim();
  const subscriptionOwnsFirstAttachment = form.require_subscription && !greeting;
  const hasFirstAttachment = form.attachment_type !== 'none' && Boolean(form.attachment_path);
  const subscriptionCaptionTooLong = subscriptionOwnsFirstAttachment &&
    hasFirstAttachment &&
    form.not_subscribed_text.length > TELEGRAM_CAPTION_LIMIT;

  const messages: PreviewMessage[] = useMemo(() => {
    const channelUrl = bot.channel_invite_url ||
      (bot.channel_username ? `https://t.me/${bot.channel_username.replace(/^@/, '')}` : '');

    const list: PreviewMessage[] = [];

    /*
      Both choices here mirror `handleStart` in the telegram-bot function, and
      have to keep mirroring it: an empty greeting with no file is not a blank
      message but no message at all, and the funnel's picture rides on whichever
      message the reader actually sees first. Preview either one differently and
      the author designs a conversation the bot will not hold.
    */
    const file = {
      attachment_type: form.attachment_type,
      attachment_path: form.attachment_path,
      attachment_name: form.attachment_name,
    };
    const hasFile = form.attachment_type !== 'none' && Boolean(form.attachment_path);
    const greeting = form.welcome_text.trim();

    if (greeting || (hasFile && !gated)) {
      list.push({
        id: 'welcome',
        step: `Шаг ${list.length + 1} · Приветствие`,
        text: form.welcome_text,
        attachment: file,
      });
    }

    if (gated) {
      list.push({
        id: 'gate',
        step: `Шаг ${list.length + 1} · Просьба подписаться`,
        conditional: true,
        text: form.not_subscribed_text,
        buttons: [{ text: form.subscribe_button_text, url: channelUrl }],
        attachment: greeting ? undefined : file,
      });
    }

    /*
      The sequence, rendered as the conversation it becomes. Inactive steps are
      kept but dimmed rather than hidden — an author toggling a lesson off wants
      to see the hole it leaves, not have it silently vanish from the preview.
    */
    const offset = list.length;
    const active = new Set(orderedSteps(
      steps.map((step) => ({ ...step, id: step.id ?? step.key })),
    ).map((step) => step.id));

    steps.forEach((step, index) => {
      const key = step.id ?? step.key;
      list.push({
        id: key,
        step: `Шаг ${offset + index + 1} · ${step.title || 'без названия'}`,
        text: step.body,
        buttons: [{ text: step.button_text, url: step.button_url }],
        attachment: {
          attachment_type: step.attachment_type,
          attachment_path: step.attachment_path,
          attachment_name: step.attachment_name,
        },
        delay: step.delay_minutes > 0 ? formatDelay(step.delay_minutes) : undefined,
        muted: !active.has(key),
      });
    });

    return list;
  }, [form, gated, bot, steps]);

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
    if (!form.name.trim() || slug.length < 2 || subscriptionCaptionTooLong) return;
    onSave({ ...form, slug }, steps);
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

            <Field
              label="Приветствие"
              hint="Можно оставить пустым — тогда первым сообщением будет сразу просьба подписаться"
            >
              {({ id }) => (
                <Textarea
                  id={id}
                  rows={3}
                  value={form.welcome_text}
                  onChange={(event) => set('welcome_text', event.target.value)}
                />
              )}
            </Field>

            {!subscriptionOwnsFirstAttachment && (
              <Field
                label={greeting ? 'Изображение к приветствию' : 'Изображение первого сообщения'}
                hint="Telegram отправит изображение вместе с текстом этого сообщения."
              >
                {({ id }) => (
                  <AttachmentPicker
                    id={id}
                    value={form}
                    onChange={(attachment) => setForm((current) => ({ ...current, ...attachment }))}
                  />
                )}
              </Field>
            )}

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

                  {subscriptionOwnsFirstAttachment && (
                    <Field
                      label="Изображение к сообщению с подпиской"
                      hint="Изображение, текст выше и кнопка на канал уйдут одним сообщением."
                    >
                      {({ id }) => (
                        <AttachmentPicker
                          id={id}
                          value={form}
                          onChange={(attachment) => setForm((current) => ({ ...current, ...attachment }))}
                        />
                      )}
                    </Field>
                  )}

                  {subscriptionOwnsFirstAttachment && hasFirstAttachment && (
                    <Callout tone={subscriptionCaptionTooLong ? 'warning' : 'success'}>
                      {subscriptionCaptionTooLong
                        ? `Текст длиннее ${TELEGRAM_CAPTION_LIMIT} символов — Telegram разделит изображение и текст. Сократите ещё на ${form.not_subscribed_text.length - TELEGRAM_CAPTION_LIMIT}.`
                        : `Одно сообщение подтверждено: изображение + ${form.not_subscribed_text.length}/${TELEGRAM_CAPTION_LIMIT} символов текста + кнопка подписки.`}
                    </Callout>
                  )}

                  <Field label="Кнопка на канал">
                    {({ id }) => (
                      <Input
                        id={id}
                        value={form.subscribe_button_text}
                        onChange={(event) => set('subscribe_button_text', event.target.value)}
                      />
                    )}
                  </Field>

                  <p className="text-2xs leading-relaxed text-gray-500">
                    После вступления бот сам увидит подписку и сразу отправит материал. Отдельная
                    кнопка проверки подписчику не нужна.
                  </p>

                  <Field
                    label="Материал после подписки"
                    hint="Файл прикрепится к первому сообщению в разделе «Что бот отправит» и уйдёт сразу после подтверждения подписки."
                  >
                    {({ id }) => steps[0] ? (
                      <AttachmentPicker
                        id={id}
                        value={steps[0]}
                        onChange={(attachment) => setSteps((current) => (
                          current.map((step, index) => (
                            index === 0 ? { ...step, ...attachment } : step
                          ))
                        ))}
                      />
                    ) : (
                      <Callout tone="info">
                        Сначала добавьте первый шаг выдачи материала ниже.
                      </Callout>
                    )}
                  </Field>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 p-4">
              <FunnelStepsEditor
                steps={steps}
                onChange={setSteps}
                hideFirstAttachment={form.require_subscription}
              />
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
                  disabled={subscriptionCaptionTooLong}
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
