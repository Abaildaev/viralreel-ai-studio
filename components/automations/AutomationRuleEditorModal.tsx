import React, { useState, useEffect, useMemo } from 'react';
import { InstagramAccount } from '../../types';
import { getAuthenticatedHeaders } from '../../lib/supabase';
import {
  XMarkIcon,
  PlusIcon,
  TrashIcon,
  ArrowPathIcon,
  CheckIcon,
  FilmIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { Callout, Skeleton } from '../ui';
import AppSelect from '../ui/AppSelect';
import AttachmentPicker from '../AttachmentPicker';
import type { MessageAttachment } from '../../types';
import { generateLeadMagnetDirectVariants } from '../../services/ai/leadMagnetDirectGenerator';
import {
  funnelDeepLink,
  funnelSlugFromLink,
  loadBot,
  loadFunnels,
} from '../../services/telegramService';

export interface AutomationForm extends MessageAttachment {
  id: string | null;
  instagram_account_id: string | null;
  title: string;
  description: string;
  keywords: string[];
  match_mode: 'exact' | 'contains';
  trigger_comments: boolean;
  trigger_dm: boolean;
  media_scope: 'all' | 'selected';
  media_ids: string[];
  public_reply_enabled: boolean;
  public_reply_variants: string[];
  reply_text: string;
  direct_reply_variants: string[];
  response_url: string;
  button_text: string;
  repeat_delay_hours: number;
  reply_delay_seconds: number;
  is_active: boolean;
}

interface InstagramMedia {
  id: string;
  caption?: string;
  media_type: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
}

interface AutomationRuleEditorModalProps {
  initialForm: AutomationForm;
  accounts: InstagramAccount[];
  saving: boolean;
  onClose: () => void;
  onSave: (form: AutomationForm) => Promise<void>;
}

const defaultPublicReplies = [
  'Отправил в Direct! Проверяйте сообщения 🚀',
  'Ссылка уже у вас в Direct 🙌',
  'Материал отправлен в личные сообщения!',
  'Если сообщение не пришло, проверьте папку «Запросы» в Direct 📩',
  'Не видите сообщение? Загляните в папку «Запросы» — иногда оно попадает туда 👀',
  'Проверьте папку «Запросы» в Direct, если сообщение не появилось сразу 🔎',
];

export const AutomationRuleEditorModal: React.FC<AutomationRuleEditorModalProps> = ({
  initialForm,
  accounts,
  saving,
  onClose,
  onSave,
}) => {
  const [form, setForm] = useState<AutomationForm>(initialForm);
  const [keywordDraft, setKeywordDraft] = useState('');
  const [media, setMedia] = useState<InstagramMedia[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState('');
  const [generatingDirectReplies, setGeneratingDirectReplies] = useState(false);
  const [directReplyError, setDirectReplyError] = useState('');
  const [botUsername, setBotUsername] = useState('');
  const [funnels, setFunnels] = useState<{ id: string; name: string; slug: string; is_active: boolean }[]>([]);

  /*
    The link is the seam between the Instagram half of the funnel and the
    Telegram half, and it used to be a bare text field: copy the deep link from
    another tab, paste it here, hope the slug matches. A wrong slug is the one
    mistake nothing downstream reports — the bot answers with its default
    funnel, and the reader gets a lead magnet they did not ask for.
  */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const bot = await loadBot();
        if (!bot || cancelled) return;
        setBotUsername(bot.bot_username);

        const list = await loadFunnels(bot.id);
        if (!cancelled) setFunnels(list);
      } catch {
        // The picker is a convenience; the URL field works without it.
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const linkedSlug = useMemo(() => funnelSlugFromLink(form.response_url), [form.response_url]);
  const linkedFunnel = funnels.find((funnel) => funnel.slug === linkedSlug);

  const funnelWarning = !linkedSlug || funnels.length === 0
    ? ''
    : !linkedFunnel
      ? `Воронки со ссылкой «${linkedSlug}» нет. Бот ответит воронкой по умолчанию, а человек получит не тот материал.`
      : !linkedFunnel.is_active
        ? `Воронка «${linkedFunnel.name}» выключена. Бот ответит воронкой по умолчанию.`
        : '';

  useEffect(() => {
    if (form.instagram_account_id && form.media_scope === 'selected') {
      loadMedia(form.instagram_account_id);
    }
  }, [form.instagram_account_id, form.media_scope]);

  /*
    The function is named `list-instagram-media` and takes a POST with the
    account id in the body. This called `instagram-media` over GET with a query
    string — wrong on all three counts, so it answered 404 and the swallowed
    error left the picker permanently empty with nothing on screen to say why.
  */
  const loadMedia = async (accountId: string) => {
    setMediaLoading(true);
    setMediaError('');
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/list-instagram-media`,
        {
          method: 'POST',
          headers: await getAuthenticatedHeaders(),
          body: JSON.stringify({ account_id: accountId }),
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.error) {
        throw new Error(json?.error || `Instagram вернул ошибку (${res.status})`);
      }
      setMedia(json.media || []);
    } catch (error: any) {
      setMedia([]);
      setMediaError(error?.message || 'Не удалось загрузить посты');
    } finally {
      setMediaLoading(false);
    }
  };

  const addKeyword = () => {
    const kw = keywordDraft.trim().replace(/\s+/g, ' ');
    const alreadyAdded = form.keywords.some(
      (existing) => existing.localeCompare(kw, 'ru', { sensitivity: 'accent' }) === 0,
    );
    if (kw && !alreadyAdded) {
      setForm((c) => ({ ...c, keywords: [...c.keywords, kw] }));
    }
    setKeywordDraft('');
  };

  const removeKeyword = (kw: string) => {
    setForm((c) => ({ ...c, keywords: c.keywords.filter((k) => k !== kw) }));
  };

  const addPublicReply = () => {
    setForm((c) => ({
      ...c,
      public_reply_variants: [...c.public_reply_variants, 'Отправил ссылку в Direct! ✨'],
    }));
  };

  const updatePublicReply = (index: number, val: string) => {
    setForm((c) => {
      const next = [...c.public_reply_variants];
      next[index] = val;
      return { ...c, public_reply_variants: next };
    });
  };

  const removePublicReply = (index: number) => {
    setForm((c) => ({
      ...c,
      public_reply_variants: c.public_reply_variants.filter((_, i) => i !== index),
    }));
  };

  const addDirectReply = () => {
    setForm((current) => ({
      ...current,
      direct_reply_variants: [...current.direct_reply_variants, ''],
    }));
  };

  const updateDirectReply = (index: number, value: string) => {
    setForm((current) => {
      const direct_reply_variants = [...current.direct_reply_variants];
      direct_reply_variants[index] = value;
      return {
        ...current,
        direct_reply_variants,
        reply_text: direct_reply_variants.find((item) => item.trim())?.trim() || '',
      };
    });
  };

  const removeDirectReply = (index: number) => {
    setForm((current) => {
      const direct_reply_variants = current.direct_reply_variants.filter((_, itemIndex) => itemIndex !== index);
      return {
        ...current,
        direct_reply_variants: direct_reply_variants.length ? direct_reply_variants : [''],
        reply_text: direct_reply_variants.find((item) => item.trim())?.trim() || '',
      };
    });
  };

  const generateDirectReplies = async () => {
    setGeneratingDirectReplies(true);
    setDirectReplyError('');
    try {
      const variants = await generateLeadMagnetDirectVariants({
        title: form.title,
        description: form.description,
        keywords: form.keywords,
        buttonText: form.button_text,
      });
      setForm((current) => ({
        ...current,
        direct_reply_variants: variants,
        reply_text: variants[0],
      }));
    } catch (error) {
      setDirectReplyError(error instanceof Error ? error.message : 'Не удалось подготовить варианты');
    } finally {
      setGeneratingDirectReplies(false);
    }
  };

  const toggleMediaSelection = (mediaId: string) => {
    setForm((c) => {
      const exists = c.media_ids.includes(mediaId);
      const next = exists ? c.media_ids.filter((id) => id !== mediaId) : [...c.media_ids, mediaId];
      return { ...c, media_ids: next };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const directReplyVariants = form.direct_reply_variants.map((value) => value.trim()).filter(Boolean);
    if (!form.title.trim() || form.keywords.length === 0 || directReplyVariants.length === 0) return;
    onSave({
      ...form,
      direct_reply_variants: directReplyVariants,
      reply_text: directReplyVariants[0],
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl border border-gray-200/90 shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur-sm z-10">
          <div>
            <h3 className="font-bold text-base text-gray-900">
              {form.id ? 'Редактировать сценарий' : 'Создать сценарий Comment-to-DM'}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Настройка триггеров кодовых слов, публичных ответов и Direct-сообщения
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Account Selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Instagram Аккаунт
            </label>
            <AppSelect
              value={form.instagram_account_id || ''}
              onChange={(e) =>
                setForm((c) => ({ ...c, instagram_account_id: e.target.value || null }))
              }
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs outline-none focus:border-brand-600 font-medium"
            >
              <option value="">Все аккаунты (Глобальное правило)</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  @{a.username}
                </option>
              ))}
            </AppSelect>
          </div>

          {/* Title & Description */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Название воронки / лид-магнита *
              </label>
              <input
                type="text"
                required
                value={form.title}
                onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))}
                placeholder="Например: Гайд по Reels 2026"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs outline-none focus:border-brand-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Режим совпадения
              </label>
              <AppSelect
                value={form.match_mode}
                onChange={(e) =>
                  setForm((c) => ({ ...c, match_mode: e.target.value as 'exact' | 'contains' }))
                }
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs outline-none focus:border-brand-600 font-medium"
              >
                <option value="contains">Частичное совпадение (содержит слово)</option>
                <option value="exact">Точное совпадение (только это слово)</option>
              </AppSelect>
            </div>
          </div>

          {/* Keywords Tag Input */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Ключевые слова (триггеры) *
            </label>
            <div className="p-2 bg-gray-50 border border-gray-200 rounded-xl flex items-center flex-wrap gap-2 focus-within:border-brand-600">
              {form.keywords.map((kw) => (
                <span
                  key={kw}
                  className="bg-blue-50 text-brand-600 border border-blue-100 px-2 py-0.5 rounded-md text-xs font-mono font-semibold flex items-center gap-1.5"
                >
                  {kw}
                  <button
                    type="button"
                    onClick={() => removeKeyword(kw)}
                    className="hover:text-red-500 text-gray-400"
                  >
                    ×
                  </button>
                </span>
              ))}

              <input
                type="text"
                value={keywordDraft}
                onChange={(e) => setKeywordDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addKeyword();
                  }
                }}
                onBlur={addKeyword}
                placeholder="Введите слово и нажмите Enter..."
                className="bg-transparent text-xs outline-none flex-1 min-w-[160px] py-1 px-1"
              />
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Например: <b>ГАЙД</b>, <b>СХЕМА</b>, <b>ХОЧУ</b> (без учета регистра)
            </p>
          </div>

          {/* Direct Message Content */}
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700">
                  Сообщения в Instagram Direct *
                </label>
                <p className="mt-1 text-[11px] leading-relaxed text-gray-400">
                  При каждом срабатывании бот случайно выберет один вариант. Ссылка будет кнопкой ниже.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={generateDirectReplies}
                  disabled={generatingDirectReplies}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-[11px] font-medium text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-100 disabled:opacity-50"
                >
                  <SparklesIcon className={`h-3.5 w-3.5 ${generatingDirectReplies ? 'animate-pulse' : ''}`} />
                  {generatingDirectReplies ? 'ИИ пишет…' : 'ИИ: 3 варианта'}
                </button>
                <button
                  type="button"
                  onClick={addDirectReply}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-700 hover:text-brand-900"
                >
                  <PlusIcon className="h-3.5 w-3.5" /> Добавить
                </button>
              </div>
            </div>

            {directReplyError && <p className="text-[11px] text-red-600">{directReplyError}</p>}

            <div className="space-y-2">
              {form.direct_reply_variants.map((variant, index) => (
                <div key={index} className="flex items-start gap-2">
                  <span className="mt-2.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-medium text-gray-500">
                    {index + 1}
                  </span>
                  <textarea
                    rows={2}
                    required={index === 0}
                    value={variant}
                    onChange={(event) => updateDirectReply(index, event.target.value)}
                    placeholder="Например: Готово — обещанный материал уже здесь. Нажмите кнопку ниже, чтобы открыть его 👇"
                    className="flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs leading-relaxed outline-none focus:border-brand-600"
                  />
                  {form.direct_reply_variants.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeDirectReply(index)}
                      className="mt-1.5 p-1 text-gray-400 transition-colors hover:text-red-500"
                      title="Удалить вариант"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={form.button_text}
                onChange={(e) => setForm((c) => ({ ...c, button_text: e.target.value }))}
                placeholder="Текст кнопки (например: Открыть гайд)"
                className="bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs outline-none focus:border-brand-600"
              />
              <input
                type="url"
                value={form.response_url}
                onChange={(e) => setForm((c) => ({ ...c, response_url: e.target.value }))}
                placeholder="Ссылка на материал (https://...)"
                className="bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs outline-none focus:border-brand-600"
              />
            </div>

            {funnels.length > 0 && botUsername && (
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-700">
                  Воронка в Telegram
                </label>
                <AppSelect
                  value={linkedFunnel?.id || ''}
                  onChange={(e) => {
                    const chosen = funnels.find((funnel) => funnel.id === e.target.value);
                    setForm((c) => ({
                      ...c,
                      /* Only the stable part of the link is stored. The worker
                         appends the event id as the Direct message goes out, so
                         every click carries its own attribution. */
                      response_url: chosen ? funnelDeepLink(botUsername, chosen.slug) : '',
                    }));
                  }}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs outline-none focus:border-brand-600 font-medium"
                >
                  <option value="">Своя ссылка (без воронки)</option>
                  {funnels.map((funnel) => (
                    <option key={funnel.id} value={funnel.id}>
                      {funnel.name}
                      {funnel.is_active ? '' : ' — выключена'}
                    </option>
                  ))}
                </AppSelect>
                <p className="text-[11px] leading-relaxed text-gray-500">
                  Выбор подставит ссылку выше. Идентификатор события бот добавит сам —
                  так каждый подписчик привязывается к кодовому слову и Reels, с которых пришёл.
                </p>
              </div>
            )}

            {funnelWarning && <Callout tone="warning">{funnelWarning}</Callout>}

            <div className="space-y-1.5">
              <label htmlFor="rule-attachment" className="block text-xs font-semibold text-gray-700">
                Файл в Direct
              </label>
              {/*
                The caveat is stated here rather than discovered in the event
                log. Instagram cannot put text and a file in one message, and a
                comment buys exactly one private reply — so for comment
                triggers the file is a second message the platform often
                refuses, while for people who write to you first it always
                arrives.
              */}
              <AttachmentPicker
                id="rule-attachment"
                value={form}
                onChange={(attachment) => setForm((c) => ({ ...c, ...attachment }))}
                hint={
                  form.trigger_comments
                    ? 'Уходит вторым сообщением после текста. По комментариям Instagram разрешает только один ответ, поэтому файл может не дойти — держите ссылку в кнопке как основной путь.'
                    : 'Уходит вторым сообщением после текста.'
                }
              />
            </div>
          </div>

          {/*
            Media scope. The webhook already honours `media_scope: 'selected'`
            by checking the comment's media id against `media_ids`, but nothing
            here could set either — so a rule saved as `selected` matched no
            comment at all, silently.
          */}
          {form.trigger_comments && (
            <div className="space-y-3 border-t border-gray-100 pt-3">
              <div>
                <p className="text-xs font-semibold text-gray-900">На каких постах ловить комментарии</p>
                <p className="mt-0.5 text-[11px] text-gray-500">
                  По умолчанию правило работает на всех постах аккаунта.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {([
                  { value: 'all', label: 'Все посты' },
                  { value: 'selected', label: 'Только выбранные' },
                ] as const).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setForm((c) => ({ ...c, media_scope: option.value }))}
                    className={`rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                      form.media_scope === option.value
                        ? 'bg-brand-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {form.media_scope === 'selected' && (
                <div className="space-y-2">
                  {!form.instagram_account_id && (
                    <Callout tone="warning">
                      Выберите Instagram-аккаунт выше, чтобы загрузить его посты.
                    </Callout>
                  )}

                  {form.instagram_account_id && mediaLoading && (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {Array.from({ length: 8 }, (_, index) => (
                        <Skeleton key={index} className="aspect-square w-full" />
                      ))}
                    </div>
                  )}

                  {form.instagram_account_id && !mediaLoading && mediaError && (
                    <Callout tone="danger">
                      {mediaError}
                      <button
                        type="button"
                        onClick={() => loadMedia(form.instagram_account_id!)}
                        className="ml-2 font-semibold underline"
                      >
                        Повторить
                      </button>
                    </Callout>
                  )}

                  {form.instagram_account_id && !mediaLoading && !mediaError && media.length === 0 && (
                    <Callout tone="info">
                      У аккаунта нет постов, доступных через Instagram API.
                    </Callout>
                  )}

                  {media.length > 0 && (
                    <>
                      <div className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
                        {media.map((item) => {
                          const selected = form.media_ids.includes(item.id);
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => toggleMediaSelection(item.id)}
                              aria-pressed={selected}
                              title={item.caption || 'Без подписи'}
                              className={`relative aspect-square overflow-hidden rounded-lg border-2 transition-colors ${
                                selected ? 'border-brand-600' : 'border-transparent hover:border-gray-300'
                              }`}
                            >
                              {item.thumbnail_url ? (
                                <img
                                  src={item.thumbnail_url}
                                  alt={item.caption || 'Пост Instagram'}
                                  loading="lazy"
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <span className="flex h-full w-full items-center justify-center bg-gray-100">
                                  <FilmIcon className="h-5 w-5 text-gray-400" />
                                </span>
                              )}
                              {selected && (
                                <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-white">
                                  <CheckIcon className="h-3 w-3" />
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[11px] text-gray-500">
                        Выбрано: {form.media_ids.length}. Пустой выбор означает, что правило не
                        сработает ни на одном комментарии.
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Public Comment Replies Pool */}
          <div className="space-y-3 pt-3 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-gray-700 flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.public_reply_enabled}
                  onChange={(e) => setForm((c) => ({ ...c, public_reply_enabled: e.target.checked }))}
                  className="rounded text-brand-600 focus:ring-0"
                />
                Отвечать в комментариях под постом (рандомный ответ из списка)
              </label>

              {form.public_reply_enabled && (
                <div className="flex items-center gap-3">
                  {/* The suggested wordings existed in this file but nothing
                      offered them, so an empty list fell back to the webhook's
                      single hardcoded line and every reply read the same. */}
                  <button
                    type="button"
                    onClick={() =>
                      setForm((c) => ({
                        ...c,
                        public_reply_variants: Array.from(
                          new Set([...c.public_reply_variants.filter(Boolean), ...defaultPublicReplies]),
                        ),
                      }))
                    }
                    className="flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-800 hover:underline"
                  >
                    <SparklesIcon className="h-3.5 w-3.5" /> Подставить примеры
                  </button>
                  <button
                    type="button"
                    onClick={addPublicReply}
                    className="text-xs text-brand-600 font-semibold hover:underline flex items-center gap-1"
                  >
                    <PlusIcon className="w-3.5 h-3.5" /> Добавить вариант
                  </button>
                </div>
              )}
            </div>

            {form.public_reply_enabled && (
              <div className="space-y-2 animate-in fade-in">
                {form.public_reply_variants.map((v, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={v}
                      onChange={(e) => updatePublicReply(i, e.target.value)}
                      className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:border-brand-600"
                    />
                    {form.public_reply_variants.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removePublicReply(i)}
                        className="text-gray-400 hover:text-red-500 p-1"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Delays & Protection */}
          <div className="grid sm:grid-cols-2 gap-4 pt-3 border-t border-gray-100">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Задержка ответа (секунды)
              </label>
              <input
                type="number"
                min={0}
                max={300}
                value={form.reply_delay_seconds}
                onChange={(e) =>
                  setForm((c) => ({ ...c, reply_delay_seconds: parseInt(e.target.value) || 0 }))
                }
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-xs outline-none"
              />
              <p className="text-[10px] text-gray-400 mt-0.5">Имитация живого ответа (0 = сразу)</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Защита от спама (часы)
              </label>
              <input
                type="number"
                min={0}
                max={168}
                value={form.repeat_delay_hours}
                onChange={(e) => {
                  const parsed = Number.parseInt(e.target.value, 10);
                  setForm((current) => ({
                    ...current,
                    repeat_delay_hours: Number.isNaN(parsed) ? 24 : Math.max(0, parsed),
                  }));
                }}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-xs outline-none"
              />
              <p className="text-[10px] text-gray-400 mt-0.5">Не слать повторно одному человеку</p>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 rounded-xl hover:bg-gray-100 transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={saving || !form.title.trim() || form.keywords.length === 0}
              className="px-5 py-2 bg-brand-600 hover:bg-brand-700 disabled:bg-gray-200 text-white font-semibold rounded-xl text-xs shadow-xs transition-all flex items-center gap-2"
            >
              {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : null}
              {form.id ? 'Сохранить изменения' : 'Создать сценарий'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AutomationRuleEditorModal;
