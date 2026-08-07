import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useAccount } from '../contexts/AccountContext';
import { LeadMagnet, InstagramAccount } from '../types';
import {
  SparklesIcon,
  ChatBubbleLeftRightIcon,
  CheckIcon,
  ArrowPathIcon,
  ExclamationCircleIcon,
  GiftIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

interface LeadMagnetFormState {
  id: string | null;
  instagram_account_id: string | null;
  title: string;
  description: string;
  codeword: string;
  is_active: boolean;
}

const EMPTY_FORM: LeadMagnetFormState = {
  id: null,
  instagram_account_id: null,
  title: '',
  description: '',
  codeword: '',
  is_active: true,
};

const SettingsPage: React.FC = () => {
  const { user } = useAuth();
  const { accounts } = useAccount();
  const [deepseekApiKey, setDeepseekApiKey] = useState('');
  const [tgToken, setTgToken] = useState('');
  const [tgChatId, setTgChatId] = useState('');
  const [tgActive, setTgActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showDeepseekKey, setShowDeepseekKey] = useState(false);
  const [testingDeepseek, setTestingDeepseek] = useState(false);
  const [deepseekTestResult, setDeepseekTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [leadMagnets, setLeadMagnets] = useState<LeadMagnet[]>([]);
  const [showLmForm, setShowLmForm] = useState(false);
  const [lmForm, setLmForm] = useState<LeadMagnetFormState>(EMPTY_FORM);
  const [lmSaving, setLmSaving] = useState(false);

  useEffect(() => {
    if (user) {
      loadDeepseekKey();
      loadTelegramSettings();
      loadLeadMagnets();
    }
  }, [user]);

  const loadDeepseekKey = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('deepseek_api_key')
      .eq('id', user.id)
      .maybeSingle();
    if (data?.deepseek_api_key) {
      setDeepseekApiKey(data.deepseek_api_key);
      localStorage.setItem('deepseek_api_key', data.deepseek_api_key);
    } else {
      const local = localStorage.getItem('deepseek_api_key');
      if (local) setDeepseekApiKey(local);
    }
  };

  const loadTelegramSettings = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('telegram_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    if (data) {
      setTgToken(data.bot_token);
      setTgChatId(data.chat_id);
      setTgActive(data.is_active);
    }
  };

  const loadLeadMagnets = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('lead_magnets')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (data) setLeadMagnets(data as LeadMagnet[]);
  };

  const handleSave = async () => {
    setSaving(true);
    setTestResult(null);

    localStorage.setItem('deepseek_api_key', deepseekApiKey);

    if (user) {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();
      if (existingProfile) {
        await supabase
          .from('profiles')
          .update({ deepseek_api_key: deepseekApiKey })
          .eq('id', user.id);
      } else {
        await supabase
          .from('profiles')
          .insert({ id: user.id, deepseek_api_key: deepseekApiKey });
      }
    }

    if (user && tgToken && tgChatId) {
      const { data: existing } = await supabase
        .from('telegram_settings')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('telegram_settings')
          .update({
            bot_token: tgToken,
            chat_id: tgChatId,
            is_active: tgActive,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id);
      } else {
        await supabase
          .from('telegram_settings')
          .insert({
            user_id: user.id,
            bot_token: tgToken,
            chat_id: tgChatId,
            is_active: tgActive,
          });
      }
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setDeepseekTestResult(null);
  };

  const handleTestDeepseek = async () => {
    if (!deepseekApiKey) {
      setDeepseekTestResult({ success: false, message: 'Введите API ключ' });
      return;
    }

    setTestingDeepseek(true);
    setDeepseekTestResult(null);

    try {
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${deepseekApiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-v4-flash',
          messages: [{ role: 'user', content: 'Ответь одним словом: работает' }],
          max_tokens: 10,
        }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData?.error?.message || `HTTP ${response.status}`);
      }
      const data = await response.json();
      const text = data.choices?.[0]?.message?.content?.trim() || '';
      setDeepseekTestResult({ success: true, message: `✅ Ключ работает! Ответ: "${text}"` });
    } catch (error: any) {
      const msg = error.message || 'Неизвестная ошибка';
      setDeepseekTestResult({ success: false, message: `❌ ${msg}` });
    } finally {
      setTestingDeepseek(false);
    }
  };

  const handleTestTelegram = async () => {
    if (!tgToken || !tgChatId) {
      setTestResult({ success: false, message: 'Введите токен бота и Chat ID' });
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const response = await fetch(
        `https://api.telegram.org/bot${tgToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: tgChatId,
            text: 'ViralReel: Тестовое сообщение. Подключение работает!',
          }),
        }
      );

      const data = await response.json();

      if (data.ok) {
        setTestResult({ success: true, message: 'Сообщение отправлено!' });
      } else {
        setTestResult({ success: false, message: data.description || 'Ошибка отправки' });
      }
    } catch (error: any) {
      setTestResult({ success: false, message: error.message });
    } finally {
      setTesting(false);
    }
  };

  const openAddForm = () => {
    setLmForm(EMPTY_FORM);
    setShowLmForm(true);
  };

  const openEditForm = (lm: LeadMagnet) => {
    setLmForm({
      id: lm.id,
      instagram_account_id: lm.instagram_account_id,
      title: lm.title,
      description: lm.description,
      codeword: lm.codeword,
      is_active: lm.is_active,
    });
    setShowLmForm(true);
  };

  const handleSaveLm = async () => {
    if (!user || !lmForm.title || !lmForm.codeword) return;
    setLmSaving(true);

    if (lmForm.id) {
      await supabase
        .from('lead_magnets')
        .update({
          instagram_account_id: lmForm.instagram_account_id,
          title: lmForm.title,
          description: lmForm.description,
          codeword: lmForm.codeword.toUpperCase(),
          is_active: lmForm.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq('id', lmForm.id);
    } else {
      await supabase
        .from('lead_magnets')
        .insert({
          user_id: user.id,
          instagram_account_id: lmForm.instagram_account_id,
          title: lmForm.title,
          description: lmForm.description,
          codeword: lmForm.codeword.toUpperCase(),
          is_active: lmForm.is_active,
        });
    }

    setLmSaving(false);
    setShowLmForm(false);
    setLmForm(EMPTY_FORM);
    await loadLeadMagnets();
  };

  const handleDeleteLm = async (id: string) => {
    if (!confirm('Удалить лид-магнит?')) return;
    await supabase.from('lead_magnets').delete().eq('id', id);
    await loadLeadMagnets();
  };

  const toggleLmActive = async (lm: LeadMagnet) => {
    await supabase
      .from('lead_magnets')
      .update({ is_active: !lm.is_active, updated_at: new Date().toISOString() })
      .eq('id', lm.id);
    setLeadMagnets(prev =>
      prev.map(l => l.id === lm.id ? { ...l, is_active: !lm.is_active } : l)
    );
  };

  const getAccountName = (accountId: string | null): string => {
    if (!accountId) return 'Все аккаунты';
    const acc = accounts.find(a => a.id === accountId);
    return acc ? `@${acc.username}` : 'Неизвестный';
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Настройки</h1>
        <p className="text-gray-500">Настройка API ключей и интеграций</p>
      </div>

      <div className="space-y-6">
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
              <SparklesIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">DeepSeek</h3>
              <p className="text-xs text-gray-500">ИИ генерация контента (DeepSeek V4-Flash)</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">API Ключ</label>
              <div className="flex gap-2">
                <input
                  type={showDeepseekKey ? 'text' : 'password'}
                  value={deepseekApiKey}
                  onChange={(e) => setDeepseekApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowDeepseekKey(!showDeepseekKey)}
                  className="px-3 py-2 border border-gray-200 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors whitespace-nowrap"
                >
                  {showDeepseekKey ? '🙈 Скрыть' : '👁 Показать'}
                </button>
              </div>
              <div className="flex items-center justify-between mt-2">
                <a
                  href="https://platform.deepseek.com/api_keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-teal-600 hover:text-teal-500 font-medium"
                >
                  Получить API ключ →
                </a>
                {deepseekApiKey && (
                  <button
                    type="button"
                    onClick={() => {
                      localStorage.removeItem('deepseek_api_key');
                      setDeepseekApiKey('');
                      setDeepseekTestResult(null);
                    }}
                    className="text-xs text-red-500 hover:text-red-600 font-medium"
                  >
                    Очистить ключ
                  </button>
                )}
              </div>
            </div>

            {deepseekTestResult && (
              <div className={`flex items-center gap-2 p-3 rounded-xl text-sm ${
                deepseekTestResult.success
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {deepseekTestResult.success ? (
                  <CheckIcon className="w-5 h-5 flex-shrink-0" />
                ) : (
                  <ExclamationCircleIcon className="w-5 h-5 flex-shrink-0" />
                )}
                <span className="break-all">{deepseekTestResult.message}</span>
              </div>
            )}

            <button
              onClick={handleTestDeepseek}
              disabled={testingDeepseek || !deepseekApiKey}
              className="w-full py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 disabled:opacity-50 text-gray-700 font-medium transition-colors flex items-center justify-center gap-2"
            >
              {testingDeepseek ? (
                <>
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                  Проверяю ключ...
                </>
              ) : (
                '⚡ Проверить ключ DeepSeek'
              )}
            </button>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center">
              <ChatBubbleLeftRightIcon className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">Telegram</h3>
              <p className="text-xs text-gray-500">Автопубликация в Telegram канал</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={tgActive}
                onChange={(e) => setTgActive(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-teal-500/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
            </label>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Токен бота</label>
              <input
                type="password"
                value={tgToken}
                onChange={(e) => setTgToken(e.target.value)}
                placeholder="123456789:ABCdefGHI..."
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500"
              />
              <p className="text-xs text-gray-400 mt-1">Получите у @BotFather в Telegram</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Chat ID</label>
              <input
                type="text"
                value={tgChatId}
                onChange={(e) => setTgChatId(e.target.value)}
                placeholder="@channelname или -1001234567890"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500"
              />
              <p className="text-xs text-gray-400 mt-1">Username канала или числовой ID чата</p>
            </div>

            {testResult && (
              <div className={`flex items-center gap-2 p-3 rounded-xl text-sm ${
                testResult.success
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {testResult.success ? (
                  <CheckIcon className="w-5 h-5" />
                ) : (
                  <ExclamationCircleIcon className="w-5 h-5" />
                )}
                {testResult.message}
              </div>
            )}

            <button
              onClick={handleTestTelegram}
              disabled={testing || !tgToken || !tgChatId}
              className="w-full py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 disabled:opacity-50 text-gray-700 font-medium transition-colors flex items-center justify-center gap-2"
            >
              {testing ? (
                <>
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                  Проверка...
                </>
              ) : (
                'Проверить подключение'
              )}
            </button>
          </div>

          <div className="mt-4 p-4 bg-gray-50 rounded-xl">
            <p className="text-sm text-gray-600 font-medium mb-2">Как настроить:</p>
            <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
              <li>Создайте бота через @BotFather и скопируйте токен</li>
              <li>Добавьте бота администратором в канал</li>
              <li>Введите @username канала или получите Chat ID</li>
              <li>Нажмите "Проверить подключение"</li>
            </ol>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
              <GiftIcon className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">Лид-магниты</h3>
              <p className="text-xs text-gray-500">Для каждого аккаунта свой лид-магнит</p>
            </div>
            <button
              onClick={openAddForm}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-teal-600 border border-teal-200 rounded-lg hover:bg-teal-50 transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              Добавить
            </button>
          </div>

          {showLmForm && (
            <div className="mb-5 border border-gray-200 rounded-xl p-4 bg-gray-50">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold text-gray-800">
                  {lmForm.id ? 'Редактировать лид-магнит' : 'Новый лид-магнит'}
                </p>
                <button
                  onClick={() => { setShowLmForm(false); setLmForm(EMPTY_FORM); }}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Аккаунт</label>
                  <select
                    value={lmForm.instagram_account_id ?? ''}
                    onChange={(e) => setLmForm(f => ({ ...f, instagram_account_id: e.target.value || null }))}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500"
                  >
                    <option value="">Все аккаунты</option>
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>@{acc.username}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">Лид-магнит будет использоваться только для выбранного аккаунта</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Название</label>
                  <input
                    type="text"
                    value={lmForm.title}
                    onChange={(e) => setLmForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="Гайд по энергетике, Чек-лист утренних практик..."
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Описание</label>
                  <textarea
                    value={lmForm.description}
                    onChange={(e) => setLmForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="PDF с 10 техниками для повышения энергии..."
                    rows={2}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Кодовое слово</label>
                  <input
                    type="text"
                    value={lmForm.codeword}
                    onChange={(e) => setLmForm(f => ({ ...f, codeword: e.target.value.toUpperCase() }))}
                    placeholder="ЭНЕРГИЯ, ЕДА, СТАРТ..."
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 uppercase font-semibold tracking-wider"
                  />
                </div>

                {lmForm.title && lmForm.codeword && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-xs text-amber-700">
                      CTA: Напиши «{lmForm.codeword}» в директ — отправлю {lmForm.title}.
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={lmForm.is_active}
                      onChange={(e) => setLmForm(f => ({ ...f, is_active: e.target.checked }))}
                      className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                    />
                    <span className="text-xs text-gray-600">Активен</span>
                  </label>

                  <button
                    onClick={handleSaveLm}
                    disabled={lmSaving || !lmForm.title || !lmForm.codeword}
                    className="px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    {lmSaving ? (
                      <>
                        <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                        Сохраняю...
                      </>
                    ) : (
                      'Сохранить'
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {leadMagnets.length === 0 && !showLmForm ? (
            <div className="text-center py-6 border border-dashed border-gray-200 rounded-xl">
              <GiftIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">Нет лид-магнитов</p>
              <p className="text-xs text-gray-400 mt-1">Добавьте лид-магнит для CTA с кодовым словом</p>
            </div>
          ) : (
            <div className="space-y-3">
              {leadMagnets.map(lm => (
                <div
                  key={lm.id}
                  className={`border rounded-xl p-4 transition-all ${
                    lm.is_active
                      ? 'border-gray-200 bg-white'
                      : 'border-gray-100 bg-gray-50 opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-semibold text-gray-900 truncate">{lm.title}</span>
                        <span className="text-xs font-bold tracking-widest text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100 flex-shrink-0">
                          {lm.codeword}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">{getAccountName(lm.instagram_account_id)}</span>
                        {lm.description && (
                          <span className="text-xs text-gray-400 truncate">· {lm.description}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => toggleLmActive(lm)}
                        className={`px-2 py-1 rounded-lg text-xs font-medium border transition-colors ${
                          lm.is_active
                            ? 'border-green-200 text-green-600 hover:bg-green-50'
                            : 'border-gray-200 text-gray-400 hover:bg-gray-50'
                        }`}
                      >
                        {lm.is_active ? 'Вкл' : 'Выкл'}
                      </button>
                      <button
                        onClick={() => openEditForm(lm)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                      >
                        <PencilIcon className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteLm(lm.id)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className={`w-full py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${
            saved
              ? 'bg-green-500 text-white'
              : 'bg-teal-600 hover:bg-teal-500 text-white shadow-lg shadow-teal-600/20'
          }`}
        >
          {saving ? (
            <>
              <ArrowPathIcon className="w-5 h-5 animate-spin" />
              Сохранение...
            </>
          ) : saved ? (
            <>
              <CheckIcon className="w-5 h-5" />
              Сохранено
            </>
          ) : (
            'Сохранить настройки'
          )}
        </button>
      </div>
    </div>
  );
};

export default SettingsPage;
