import React, { useState, useEffect } from 'react';
import { LeadMagnet, InstagramAccount } from '../../types';
import { getAuthenticatedHeaders, supabase } from '../../lib/supabase';
import {
  XMarkIcon,
  PlusIcon,
  TrashIcon,
  SparklesIcon,
  ArrowPathIcon,
  InformationCircleIcon,
  FilmIcon,
  ChatBubbleLeftRightIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/24/outline';

export interface AutomationForm {
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

  useEffect(() => {
    if (form.instagram_account_id && form.media_scope === 'selected') {
      loadMedia(form.instagram_account_id);
    }
  }, [form.instagram_account_id, form.media_scope]);

  const loadMedia = async (accountId: string) => {
    setMediaLoading(true);
    try {
      const headers = await getAuthenticatedHeaders();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instagram-media?account_id=${accountId}`,
        { headers }
      );
      if (res.ok) {
        const json = await res.json();
        setMedia(json.media || []);
      }
    } catch {
      // ignore
    } finally {
      setMediaLoading(false);
    }
  };

  const addKeyword = () => {
    const kw = keywordDraft.trim().toUpperCase();
    if (kw && !form.keywords.includes(kw)) {
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

  const toggleMediaSelection = (mediaId: string) => {
    setForm((c) => {
      const exists = c.media_ids.includes(mediaId);
      const next = exists ? c.media_ids.filter((id) => id !== mediaId) : [...c.media_ids, mediaId];
      return { ...c, media_ids: next };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || form.keywords.length === 0 || !form.reply_text.trim()) return;
    onSave(form);
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
            <select
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
            </select>
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
              <select
                value={form.match_mode}
                onChange={(e) =>
                  setForm((c) => ({ ...c, match_mode: e.target.value as 'exact' | 'contains' }))
                }
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs outline-none focus:border-brand-600 font-medium"
              >
                <option value="contains">Частичное совпадение (содержит слово)</option>
                <option value="exact">Точное совпадение (только это слово)</option>
              </select>
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
            <label className="block text-xs font-semibold text-gray-700">
              Сообщение в Instagram Direct *
            </label>
            <textarea
              rows={3}
              required
              value={form.reply_text}
              onChange={(e) => setForm((c) => ({ ...c, reply_text: e.target.value }))}
              placeholder="Привет! Держи обещанный гайд по ссылке ниже 👇"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs outline-none focus:border-brand-600 resize-none leading-relaxed"
            />

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
          </div>

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
                <button
                  type="button"
                  onClick={addPublicReply}
                  className="text-xs text-brand-600 font-semibold hover:underline flex items-center gap-1"
                >
                  <PlusIcon className="w-3.5 h-3.5" /> Добавить вариант
                </button>
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
                min={1}
                max={168}
                value={form.repeat_delay_hours}
                onChange={(e) =>
                  setForm((c) => ({ ...c, repeat_delay_hours: parseInt(e.target.value) || 24 }))
                }
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
