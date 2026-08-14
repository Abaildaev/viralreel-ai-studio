import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useConfirm } from '../contexts/ModalContext';
import {
  ArrowDownTrayIcon,
  ChatBubbleLeftRightIcon,
  DocumentTextIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import {
  Button,
  Callout,
  Card,
  Field,
  Input,
  PageHeader,
  PageShell,
  Section,
  Switch,
} from '../components/ui';

type TestResult = { success: boolean; message: string } | null;

const SettingsPage: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useConfirm();
  const [deepseekApiKey, setDeepseekApiKey] = useState('');
  const [tgToken, setTgToken] = useState('');
  const [tgChatId, setTgChatId] = useState('');
  const [tgActive, setTgActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult>(null);
  const [showDeepseekKey, setShowDeepseekKey] = useState(false);
  const [testingDeepseek, setTestingDeepseek] = useState(false);
  const [deepseekTestResult, setDeepseekTestResult] = useState<TestResult>(null);

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

    let telegramError: string | null = null;

    if (user && tgToken && tgChatId) {
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

      // The result used to be discarded, so a rejected write still reported
      // "Сохранено" and the settings silently reverted on the next load.
      const { error } = existingTelegram
        ? await supabase.from('telegram_settings').update(telegramPayload).eq('user_id', user.id)
        : await supabase.from('telegram_settings').insert({ ...telegramPayload, user_id: user.id });

      if (error) telegramError = error.message;
    }

    setSaving(false);
    setDeepseekTestResult(null);

    if (telegramError) {
      toast({ message: `Не удалось сохранить настройки Telegram: ${telegramError}`, tone: 'error' });
    } else {
      toast('Настройки сохранены');
    }
  };

  const handleTestDeepseek = async () => {
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
      setTestResult(
        data.ok
          ? { success: true, message: 'Сообщение отправлено!' }
          : { success: false, message: data.description || 'Ошибка отправки' },
      );
    } catch (error: any) {
      setTestResult({ success: false, message: error.message || 'Ошибка отправки' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <PageShell width="narrow">
      <PageHeader title="Настройки" description="API-ключи и внешние интеграции" />

      <div className="space-y-5">
        <Section
          icon={<SparklesIcon className="h-5 w-5" />}
          title="DeepSeek"
          hint="ИИ-генерация контента · ключ хранится только в этом браузере"
        >
          <div className="space-y-3">
            <Field label="API-ключ">
              {({ id, describedBy }) => (
                <div className="flex gap-2">
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    type={showDeepseekKey ? 'text' : 'password'}
                    value={deepseekApiKey}
                    onChange={(event) => setDeepseekApiKey(event.target.value)}
                    placeholder="sk-..."
                    className="flex-1 font-mono"
                  />
                  <Button onClick={() => setShowDeepseekKey((current) => !current)}>
                    {showDeepseekKey ? 'Скрыть' : 'Показать'}
                  </Button>
                </div>
              )}
            </Field>

            <div className="flex items-center justify-between gap-3">
              <a
                href="https://platform.deepseek.com/api_keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                Получить API-ключ →
              </a>
              {deepseekApiKey && (
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem('deepseek_api_key');
                    setDeepseekApiKey('');
                    setDeepseekTestResult(null);
                    toast('Ключ удалён из браузера');
                  }}
                  className="text-xs font-medium text-red-500 hover:text-red-600"
                >
                  Очистить ключ
                </button>
              )}
            </div>

            {deepseekTestResult && (
              <Callout tone={deepseekTestResult.success ? 'success' : 'danger'}>
                <span className="break-all">{deepseekTestResult.message}</span>
              </Callout>
            )}

            <Button
              fullWidth
              onClick={handleTestDeepseek}
              loading={testingDeepseek}
              disabled={!deepseekApiKey}
            >
              {testingDeepseek ? 'Проверяю ключ…' : 'Проверить ключ DeepSeek'}
            </Button>
          </div>
        </Section>

        <Section
          icon={<ChatBubbleLeftRightIcon className="h-5 w-5" />}
          title="Telegram"
          hint="Автопубликация в Telegram-канал"
          action={
            <Switch
              checked={tgActive}
              onChange={setTgActive}
              label="Публиковать в Telegram"
              hideLabel
            />
          }
        >
          <div className="space-y-4">
            <Field label="Токен бота" hint="Получите у @BotFather в Telegram">
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  type="password"
                  value={tgToken}
                  onChange={(event) => setTgToken(event.target.value)}
                  placeholder="123456789:ABCdefGHI…"
                />
              )}
            </Field>

            <Field label="Chat ID" hint="Username канала или числовой ID чата">
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  value={tgChatId}
                  onChange={(event) => setTgChatId(event.target.value)}
                  placeholder="@channelname или -1001234567890"
                />
              )}
            </Field>

            {testResult && (
              <Callout tone={testResult.success ? 'success' : 'danger'}>{testResult.message}</Callout>
            )}

            <Button
              fullWidth
              onClick={handleTestTelegram}
              loading={testing}
              disabled={!tgToken || !tgChatId}
            >
              {testing ? 'Проверка…' : 'Проверить подключение'}
            </Button>
          </div>

          <div className="mt-4 rounded-xl bg-gray-50 p-4">
            <p className="mb-2 text-sm font-medium text-gray-600">Как настроить:</p>
            <ol className="list-inside list-decimal space-y-1 text-xs text-gray-500">
              <li>Создайте бота через @BotFather и скопируйте токен</li>
              <li>Добавьте бота администратором в канал</li>
              <li>Введите @username канала или получите Chat ID</li>
              <li>Нажмите «Проверить подключение»</li>
            </ol>
          </div>
        </Section>

        <Button variant="primary" size="lg" fullWidth onClick={handleSave} loading={saving}>
          {saving ? 'Сохранение…' : 'Сохранить настройки'}
        </Button>

        <Card>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
                <DocumentTextIcon className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  Инструкция для передачи клиенту
                </h2>
                <p className="mt-1 max-w-xl text-xs leading-relaxed text-gray-500">
                  Клиент прикрепляет файл к новой сессии ИИ — агент сам проводит локальный запуск,
                  подключает браузер, создаёт клиентские Supabase и Meta App, настраивает Webhooks и
                  выполняет финальный тест.
                </p>
              </div>
            </div>
            <a
              href="/CLIENT_AI_SETUP_PROMPT_RU.md"
              download="CLIENT_AI_SETUP_PROMPT_RU.md"
              className="btn btn-primary btn-lg flex-shrink-0"
            >
              <ArrowDownTrayIcon className="h-5 w-5" />
              Скачать файл
            </a>
          </div>
          <Callout tone="success" className="mt-4">
            В файле нет ваших токенов и паролей. Он требует создать отдельные аккаунты и ключи
            клиента.
          </Callout>
        </Card>
      </div>
    </PageShell>
  );
};

export default SettingsPage;
