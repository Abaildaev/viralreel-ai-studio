import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ChatBubbleLeftRightIcon,
  CheckIcon,
  DocumentTextIcon,
  ExclamationCircleIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';

const SettingsPage: React.FC = () => {
  const { user } = useAuth();
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

  useEffect(() => {
    if (!user) return;

    const loadSettings = async () => {
      // BYOK: the DeepSeek key is the user's own and stays in this browser.
      const localKey = localStorage.getItem('deepseek_api_key');
      if (localKey) setDeepseekApiKey(localKey);

      const { data: telegram } = await supabase
        .from('telegram_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (telegram) {
        setTgToken(telegram.bot_token);
        setTgChatId(telegram.chat_id);
        setTgActive(telegram.is_active);
      }
    };

    loadSettings();
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    setTestResult(null);
    localStorage.setItem('deepseek_api_key', deepseekApiKey);

    if (user) {
      if (tgToken && tgChatId) {
        const { data: existingTelegram } = await supabase
          .from('telegram_settings')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        const telegramPayload = {
          bot_token: tgToken,
          chat_id: tgChatId,
          is_active: tgActive,
          updated_at: new Date().toISOString(),
        };

        if (existingTelegram) {
          await supabase
            .from('telegram_settings')
            .update(telegramPayload)
            .eq('user_id', user.id);
        } else {
          await supabase
            .from('telegram_settings')
            .insert({ ...telegramPayload, user_id: user.id });
        }
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
          Authorization: `Bearer ${deepseekApiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-v4-flash',
          messages: [{ role: 'user', content: 'Ответь одним словом: работает' }],
          max_tokens: 10,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error?.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const answer = data.choices?.[0]?.message?.content?.trim() || '';
      setDeepseekTestResult({ success: true, message: `Ключ работает! Ответ: «${answer}»` });
    } catch (error: any) {
      setDeepseekTestResult({ success: false, message: error.message || 'Неизвестная ошибка' });
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
      const response = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: tgChatId,
          text: 'ViralReel: Тестовое сообщение. Подключение работает!',
        }),
      });
      const data = await response.json();
      setTestResult(data.ok
        ? { success: true, message: 'Сообщение отправлено!' }
        : { success: false, message: data.description || 'Ошибка отправки' });
    } catch (error: any) {
      setTestResult({ success: false, message: error.message || 'Ошибка отправки' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Настройки</h1>
        <p className="text-sm text-gray-500 mt-1">API-ключи и внешние интеграции</p>
      </div>

      <div className="space-y-6">
        <section className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center">
              <SparklesIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">DeepSeek</h2>
              <p className="text-xs text-gray-500">ИИ-генерация контента · ключ хранится только в этом браузере</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">API-ключ</label>
              <div className="flex gap-2">
                <input
                  type={showDeepseekKey ? 'text' : 'password'}
                  value={deepseekApiKey}
                  onChange={event => setDeepseekApiKey(event.target.value)}
                  placeholder="sk-..."
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowDeepseekKey(current => !current)}
                  className="px-3 py-2 border border-gray-200 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-50 whitespace-nowrap"
                >
                  {showDeepseekKey ? 'Скрыть' : 'Показать'}
                </button>
              </div>
              <div className="flex items-center justify-between mt-2">
                <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noopener noreferrer" className="text-xs text-brand-600 hover:text-brand-700 font-medium">
                  Получить API-ключ →
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
              <div className={`flex items-center gap-2 p-3 rounded-xl text-sm border ${
                deepseekTestResult.success
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : 'bg-red-50 text-red-700 border-red-200'
              }`}>
                {deepseekTestResult.success
                  ? <CheckIcon className="w-5 h-5 flex-shrink-0" />
                  : <ExclamationCircleIcon className="w-5 h-5 flex-shrink-0" />}
                <span className="break-all">{deepseekTestResult.message}</span>
              </div>
            )}

            <button
              onClick={handleTestDeepseek}
              disabled={testingDeepseek || !deepseekApiKey}
              className="w-full py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 disabled:opacity-50 text-gray-700 font-medium flex items-center justify-center gap-2"
            >
              {testingDeepseek && <ArrowPathIcon className="w-4 h-4 animate-spin" />}
              {testingDeepseek ? 'Проверяю ключ...' : 'Проверить ключ DeepSeek'}
            </button>
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center">
              <ChatBubbleLeftRightIcon className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-gray-900">Telegram</h2>
              <p className="text-xs text-gray-500">Автопубликация в Telegram-канал</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={tgActive} onChange={event => setTgActive(event.target.checked)} className="sr-only peer" />
              <span className="w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-brand-500/50 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600" />
            </label>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Токен бота</label>
              <input type="password" value={tgToken} onChange={event => setTgToken(event.target.value)} placeholder="123456789:ABCdefGHI..." className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50" />
              <p className="text-xs text-gray-400 mt-1">Получите у @BotFather в Telegram</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Chat ID</label>
              <input type="text" value={tgChatId} onChange={event => setTgChatId(event.target.value)} placeholder="@channelname или -1001234567890" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50" />
              <p className="text-xs text-gray-400 mt-1">Username канала или числовой ID чата</p>
            </div>

            {testResult && (
              <div className={`flex items-center gap-2 p-3 rounded-xl text-sm border ${
                testResult.success
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : 'bg-red-50 text-red-700 border-red-200'
              }`}>
                {testResult.success
                  ? <CheckIcon className="w-5 h-5" />
                  : <ExclamationCircleIcon className="w-5 h-5" />}
                {testResult.message}
              </div>
            )}

            <button
              onClick={handleTestTelegram}
              disabled={testing || !tgToken || !tgChatId}
              className="w-full py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 disabled:opacity-50 text-gray-700 font-medium flex items-center justify-center gap-2"
            >
              {testing && <ArrowPathIcon className="w-4 h-4 animate-spin" />}
              {testing ? 'Проверка...' : 'Проверить подключение'}
            </button>
          </div>

          <div className="mt-4 p-4 bg-gray-50 rounded-xl">
            <p className="text-sm text-gray-600 font-medium mb-2">Как настроить:</p>
            <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
              <li>Создайте бота через @BotFather и скопируйте токен</li>
              <li>Добавьте бота администратором в канал</li>
              <li>Введите @username канала или получите Chat ID</li>
              <li>Нажмите «Проверить подключение»</li>
            </ol>
          </div>
        </section>

        <button
          onClick={handleSave}
          disabled={saving}
          className={`w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2 ${
            saved
              ? 'bg-green-500 text-white'
              : 'bg-brand-600 hover:bg-brand-700 text-white shadow-lg'
          }`}
        >
          {saving && <ArrowPathIcon className="w-5 h-5 animate-spin" />}
          {saved && <CheckIcon className="w-5 h-5" />}
          {saving ? 'Сохранение...' : saved ? 'Сохранено' : 'Сохранить настройки'}
        </button>

        <section className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center flex-shrink-0">
                <DocumentTextIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Инструкция для передачи клиенту</h2>
                <p className="text-xs text-gray-500 mt-1 max-w-xl">
                  Клиент прикрепляет файл к новой сессии ИИ — агент сам проводит локальный запуск, подключает браузер, создаёт клиентские Supabase и Meta App, настраивает Webhooks и выполняет финальный тест.
                </p>
              </div>
            </div>
            <a
              href="/CLIENT_AI_SETUP_PROMPT_RU.md"
              download="CLIENT_AI_SETUP_PROMPT_RU.md"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold whitespace-nowrap"
            >
              <ArrowDownTrayIcon className="w-5 h-5" />
              Скачать файл
            </a>
          </div>
          <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-xl px-3 py-2.5 mt-4">
            В файле нет ваших токенов и паролей. Он требует создать отдельные аккаунты и ключи клиента.
          </p>
        </section>
      </div>
    </div>
  );
};

export default SettingsPage;
