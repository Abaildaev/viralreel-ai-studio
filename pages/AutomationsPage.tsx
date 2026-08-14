import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getAuthenticatedHeaders, supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useAccount } from '../contexts/AccountContext';
import { LeadMagnet, LeadMagnetStats } from '../types';
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  BoltIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  LinkIcon,
  PaperAirplaneIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

interface AutomationForm {
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

interface TestResult {
  blockers: string[];
  matched: {
    id: string;
    title: string;
    keyword: string;
    delay_seconds: number;
    direct_text: string;
    button_text: string | null;
    response_url: string | null;
    public_reply: string | null;
  } | null;
  considered: { id: string; title: string; reason: string }[];
}

interface InstagramMedia {
  id: string;
  caption: string;
  media_type: string;
  media_product_type: string;
  thumbnail_url: string;
  permalink: string;
  timestamp: string;
}

interface AutomationEvent {
  id: string;
  trigger_type: 'dm' | 'comment';
  incoming_text: string;
  commenter_username: string | null;
  status: 'received' | 'ignored' | 'sent' | 'failed';
  public_reply_status: 'pending' | 'sent' | 'skipped' | 'failed';
  dm_status: 'pending' | 'sent' | 'skipped' | 'failed';
  error_message: string | null;
  created_at: string;
  lead_magnets: { title: string; codeword: string } | null;
  instagram_accounts: { username: string } | null;
}

const defaultPublicReplies = [
  'Готово 🙌 Отправил вам в Direct',
  'Уже летит в Direct 🚀',
  'Проверьте сообщения — всё отправил ✨',
];

const createEmptyForm = (accountId: string | null = null): AutomationForm => ({
  id: null,
  instagram_account_id: accountId,
  title: '',
  description: '',
  keywords: [],
  match_mode: 'contains',
  trigger_comments: true,
  trigger_dm: false,
  media_scope: 'all',
  media_ids: [],
  public_reply_enabled: true,
  public_reply_variants: defaultPublicReplies,
  reply_text: 'Привет! Спасибо за интерес 🙌\n\nЗабирайте обещанный материал по кнопке ниже.',
  response_url: '',
  button_text: 'Получить материал',
  repeat_delay_hours: 24,
  reply_delay_seconds: 0,
  is_active: true,
});

const EVENTS_PAGE_SIZE = 20;

const statusMeta = {
  sent: { label: 'Доставлено', className: 'bg-green-50 text-green-700 border-green-200' },
  failed: { label: 'Ошибка', className: 'bg-red-50 text-red-700 border-red-200' },
  ignored: { label: 'Пропущено', className: 'bg-gray-50 text-gray-600 border-gray-200' },
  received: { label: 'Обработка', className: 'bg-blue-50 text-blue-700 border-blue-200' },
};

const AutomationsPage: React.FC = () => {
  const { user } = useAuth();
  const { accounts, selectedAccount, refreshAccounts } = useAccount();
  const [rules, setRules] = useState<LeadMagnet[]>([]);
  const [events, setEvents] = useState<AutomationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState<AutomationForm>(() => createEmptyForm());
  const [keywordDraft, setKeywordDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ success: boolean; message: string } | null>(null);
  const [media, setMedia] = useState<InstagramMedia[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [stats, setStats] = useState<LeadMagnetStats[]>([]);
  const [eventAccountId, setEventAccountId] = useState('');
  const [eventLimit, setEventLimit] = useState(EVENTS_PAGE_SIZE);
  const [eventsTotal, setEventsTotal] = useState(0);
  const [testText, setTestText] = useState('');
  const [testTrigger, setTestTrigger] = useState<'comment' | 'dm'>('comment');
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);

  const loadDashboard = useCallback(async (quiet = false) => {
    if (!user) return;
    quiet ? setRefreshing(true) : setLoading(true);

    let eventsQuery = supabase
      .from('instagram_automation_events')
      .select(
        'id,trigger_type,incoming_text,commenter_username,status,public_reply_status,dm_status,error_message,created_at,lead_magnets(title,codeword),instagram_accounts(username)',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .limit(eventLimit);
    if (eventAccountId) eventsQuery = eventsQuery.eq('instagram_account_id', eventAccountId);

    const [rulesResult, eventsResult, statsResult] = await Promise.all([
      supabase.from('lead_magnets').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      eventsQuery,
      supabase.from('lead_magnet_stats').select('*'),
    ]);

    if (rulesResult.error || eventsResult.error) {
      setNotice({ success: false, message: rulesResult.error?.message || eventsResult.error?.message || 'Не удалось загрузить данные' });
    }
    setRules((rulesResult.data || []) as LeadMagnet[]);
    setEvents((eventsResult.data || []) as unknown as AutomationEvent[]);
    setEventsTotal(eventsResult.count ?? 0);
    setStats((statsResult.data || []) as LeadMagnetStats[]);
    setLoading(false);
    setRefreshing(false);
  }, [user, eventAccountId, eventLimit]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const statsByRule = useMemo(
    () => new Map(stats.map(row => [row.lead_magnet_id, row])),
    [stats],
  );

  const activeRules = rules.filter(rule => rule.is_active).length;
  // Counted across the whole history, not just the page of events on screen.
  const sentCount = stats.reduce((total, row) => total + Number(row.sent_count || 0), 0);
  const failedCount = stats.reduce((total, row) => total + Number(row.failed_count || 0), 0);
  const attempts = sentCount + failedCount;
  const deliverability = attempts ? Math.round((sentCount / attempts) * 100) : 100;
  const readyAccounts = accounts.filter(account => account.webhook_subscribed_at && !account.webhook_error).length;

  const loadMedia = useCallback(async (accountId: string | null) => {
    if (!accountId) {
      setMedia([]);
      return;
    }
    setMediaLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/list-instagram-media`, {
        method: 'POST',
        headers: await getAuthenticatedHeaders(),
        body: JSON.stringify({ account_id: accountId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Не удалось получить публикации');
      setMedia(result.media || []);
    } catch (error: any) {
      setNotice({ success: false, message: error.message || 'Не удалось получить публикации' });
      setMedia([]);
    } finally {
      setMediaLoading(false);
    }
  }, []);

  useEffect(() => {
    if (editorOpen && form.media_scope === 'selected') loadMedia(form.instagram_account_id);
  }, [editorOpen, form.instagram_account_id, form.media_scope, loadMedia]);

  const openCreate = () => {
    setForm(createEmptyForm(selectedAccount?.id || accounts[0]?.id || null));
    setKeywordDraft('');
    setNotice(null);
    setTestResult(null);
    setTestText('');
    setEditorOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openEdit = (rule: LeadMagnet) => {
    setForm({
      id: rule.id,
      instagram_account_id: rule.instagram_account_id,
      title: rule.title,
      description: rule.description || '',
      keywords: rule.keywords?.length ? rule.keywords : [rule.codeword],
      match_mode: rule.match_mode || 'contains',
      trigger_comments: rule.trigger_comments ?? true,
      trigger_dm: rule.trigger_dm ?? false,
      media_scope: rule.media_scope || 'all',
      media_ids: rule.media_ids || [],
      public_reply_enabled: rule.public_reply_enabled ?? true,
      public_reply_variants: rule.public_reply_variants?.length ? rule.public_reply_variants : defaultPublicReplies,
      reply_text: rule.reply_text || '',
      response_url: rule.response_url || '',
      button_text: rule.button_text || 'Получить материал',
      repeat_delay_hours: rule.repeat_delay_hours ?? 24,
      reply_delay_seconds: rule.reply_delay_seconds ?? 0,
      is_active: rule.is_active,
    });
    setTestResult(null);
    setTestText('');
    setKeywordDraft('');
    setEditorOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const addKeyword = () => {
    const keyword = keywordDraft.trim().toUpperCase();
    if (keyword && !form.keywords.includes(keyword)) {
      setForm(current => ({ ...current, keywords: [...current.keywords, keyword] }));
    }
    setKeywordDraft('');
  };

  const saveRule = async () => {
    if (!user || !form.title.trim() || !form.keywords.length || !form.reply_text.trim()) return;
    setSaving(true);
    setNotice(null);
    try {
      const variants = form.public_reply_variants.map(item => item.trim()).filter(Boolean);
      const payload = {
        instagram_account_id: form.instagram_account_id,
        title: form.title.trim(),
        description: form.description.trim(),
        codeword: form.keywords[0],
        keywords: form.keywords,
        match_mode: form.match_mode,
        trigger_comments: form.trigger_comments,
        trigger_dm: form.trigger_dm,
        media_scope: form.media_scope,
        media_ids: form.media_scope === 'selected' ? form.media_ids : [],
        public_reply_enabled: form.trigger_comments && form.public_reply_enabled,
        public_reply_variants: variants.length ? variants : defaultPublicReplies,
        reply_text: form.reply_text.trim(),
        response_url: form.response_url.trim(),
        button_text: (form.button_text || '').trim() || 'Получить материал',
        repeat_delay_hours: form.repeat_delay_hours,
        reply_delay_seconds: form.reply_delay_seconds,
        is_active: form.is_active,
        updated_at: new Date().toISOString(),
      };
      const result = form.id
        ? await supabase.from('lead_magnets').update(payload).eq('id', form.id)
        : await supabase.from('lead_magnets').insert({ ...payload, user_id: user.id });
      if (result.error) throw result.error;

      setEditorOpen(false);
      setNotice({ success: true, message: 'Автоматизация сохранена и уже слушает новые комментарии.' });
      await loadDashboard(true);
    } catch (error: any) {
      setNotice({ success: false, message: error.message || 'Не удалось сохранить автоматизацию' });
    } finally {
      setSaving(false);
    }
  };

  /**
   * Runs the real matcher on the server against the saved rules, so the result
   * reflects what the webhook would do — not a re-implementation in the client.
   */
  const runTest = async () => {
    if (!form.instagram_account_id || !testText.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/test-automation`, {
        method: 'POST',
        headers: await getAuthenticatedHeaders(),
        body: JSON.stringify({
          account_id: form.instagram_account_id,
          text: testText,
          trigger_type: testTrigger,
          media_id: form.media_scope === 'selected' ? form.media_ids[0] : undefined,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Не удалось выполнить проверку');
      setTestResult(result as TestResult);
    } catch (error: any) {
      setNotice({ success: false, message: error.message || 'Не удалось выполнить проверку' });
    } finally {
      setTesting(false);
    }
  };

  const toggleRule = async (rule: LeadMagnet) => {
    const { error } = await supabase.from('lead_magnets').update({ is_active: !rule.is_active }).eq('id', rule.id);
    if (error) setNotice({ success: false, message: error.message });
    else setRules(current => current.map(item => item.id === rule.id ? { ...item, is_active: !item.is_active } : item));
  };

  const deleteRule = async (rule: LeadMagnet) => {
    if (!confirm(`Удалить автоматизацию «${rule.title}»?`)) return;
    const { error } = await supabase.from('lead_magnets').delete().eq('id', rule.id);
    if (error) setNotice({ success: false, message: error.message });
    else setRules(current => current.filter(item => item.id !== rule.id));
  };

  const formatDate = (value: string) => new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));

  const selectedMedia = useMemo(() => media.filter(item => form.media_ids.includes(item.id)), [media, form.media_ids]);

  const editorAccount = accounts.find(account => account.id === form.instagram_account_id);
  // A rule saved against an unsubscribed account never fires, silently.
  const accountBlockers = editorAccount
    ? [
      !editorAccount.is_active && 'Аккаунт отключён в разделе «Аккаунты»',
      !editorAccount.webhook_subscribed_at && 'Нет подписки на webhook — Instagram не пришлёт события. Переподключите аккаунт.',
      editorAccount.webhook_error && `Ошибка подписки: ${editorAccount.webhook_error}`,
    ].filter(Boolean) as string[]
    : [];

  if (editorOpen) {
    return (
      <div className="min-h-screen bg-canvas">
        <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-200 px-6 lg:px-8 py-4">
          <div className="max-w-6xl mx-auto flex items-center gap-4">
            <button onClick={() => setEditorOpen(false)} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500"><ArrowLeftIcon className="w-5 h-5" /></button>
            <div className="min-w-0">
              <p className="text-xs font-medium text-teal-600">КОНСТРУКТОР АВТОМАТИЗАЦИИ</p>
              <h1 className="text-xl font-bold text-gray-900 truncate">{form.id ? form.title : 'Новый лид-магнит'}</h1>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <label className="hidden sm:flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={event => setForm(current => ({ ...current, is_active: event.target.checked }))} className="rounded text-teal-600" />
                Активен
              </label>
              <button
                onClick={saveRule}
                disabled={saving || !form.instagram_account_id || !form.title.trim() || !form.keywords.length || !form.reply_text.trim() || (!form.trigger_comments && !form.trigger_dm) || (form.trigger_comments && form.media_scope === 'selected' && !form.media_ids.length)}
                className="px-5 py-2.5 rounded-xl bg-gray-900 hover:bg-black disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold flex items-center gap-2"
              >
                {saving && <ArrowPathIcon className="w-4 h-4 animate-spin" />}
                Сохранить и запустить
              </button>
            </div>
          </div>
        </header>

        <div className="max-w-6xl mx-auto p-6 lg:p-8 grid xl:grid-cols-[minmax(0,1fr)_360px] gap-8">
          <main className="space-y-5">
            {notice && (
              <div className={`flex gap-3 p-4 rounded-xl border ${notice.success ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                {notice.success ? <CheckCircleIcon className="w-5 h-5 flex-shrink-0" /> : <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0" />}
                <p className="text-sm">{notice.message}</p>
                <button onClick={() => setNotice(null)} className="ml-auto"><XMarkIcon className="w-4 h-4" /></button>
              </div>
            )}
            <BuilderSection number="1" title="Где запускается сценарий" subtitle="Выберите аккаунт и событие, которое запустит автоматизацию.">
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Instagram-аккаунт</label>
                  <select value={form.instagram_account_id || ''} onChange={event => setForm(current => ({ ...current, instagram_account_id: event.target.value || null, media_ids: [] }))} className="field">
                    <option value="">Выберите аккаунт</option>
                    {accounts.map(account => <option key={account.id} value={account.id}>@{account.username}</option>)}
                  </select>
                  {accountBlockers.length > 0 && (
                    <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
                      <p className="text-sm font-medium text-amber-900 flex items-center gap-2">
                        <ExclamationTriangleIcon className="w-4 h-4" /> Сценарий сохранится, но не сработает
                      </p>
                      <ul className="mt-1.5 space-y-1">
                        {accountBlockers.map(blocker => (
                          <li key={blocker} className="text-xs text-amber-800">• {blocker}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <ChoiceCard active={form.trigger_comments} title="Комментарий под Reels" description="Ключевое слово в комментарии" onClick={() => setForm(current => ({ ...current, trigger_comments: !current.trigger_comments }))} />
                <ChoiceCard active={form.trigger_dm} title="Сообщение в Direct" description="Ключевое слово в личке" onClick={() => setForm(current => ({ ...current, trigger_dm: !current.trigger_dm }))} />
              </div>

              {form.trigger_comments && (
                <div className="mt-5 pt-5 border-t border-gray-100">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Какие публикации отслеживать</label>
                  <div className="flex gap-2 p-1 bg-gray-100 rounded-xl w-fit">
                    <button onClick={() => setForm(current => ({ ...current, media_scope: 'all', media_ids: [] }))} className={`px-4 py-2 rounded-lg text-sm font-medium ${form.media_scope === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Все Reels и посты</button>
                    <button onClick={() => setForm(current => ({ ...current, media_scope: 'selected' }))} className={`px-4 py-2 rounded-lg text-sm font-medium ${form.media_scope === 'selected' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Только выбранные</button>
                  </div>
                  {form.media_scope === 'selected' && (
                    <div className="mt-4">
                      {mediaLoading ? <div className="h-28 bg-gray-100 rounded-xl animate-pulse" /> : media.length === 0 ? (
                        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">Не удалось загрузить публикации или их пока нет.</p>
                      ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                          {media.map(item => {
                            const selected = form.media_ids.includes(item.id);
                            return (
                              <button key={item.id} onClick={() => setForm(current => ({ ...current, media_ids: selected ? current.media_ids.filter(id => id !== item.id) : [...current.media_ids, item.id] }))} className={`relative aspect-square rounded-xl overflow-hidden border-2 ${selected ? 'border-teal-500 ring-2 ring-teal-100' : 'border-transparent'}`}>
                                {item.thumbnail_url ? <img src={item.thumbnail_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-gray-200" />}
                                {selected && <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-teal-500 text-white flex items-center justify-center"><CheckCircleIcon className="w-4 h-4" /></span>}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <p className="text-xs text-gray-400 mt-2">Выбрано: {form.media_ids.length}</p>
                    </div>
                  )}
                </div>
              )}
            </BuilderSection>

            <BuilderSection number="2" title="Кодовые слова" subtitle="Добавьте одно или несколько слов, на которые должен реагировать бот.">
              <div className="flex gap-2">
                <input
                  value={keywordDraft}
                  onChange={event => setKeywordDraft(event.target.value)}
                  onKeyDown={event => { if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); addKeyword(); } }}
                  placeholder="Например: ГАЙД"
                  className="field uppercase font-semibold"
                />
                <button onClick={addKeyword} disabled={!keywordDraft.trim()} className="px-4 rounded-xl bg-teal-600 disabled:bg-gray-200 text-white font-semibold">Добавить</button>
              </div>
              <div className="flex flex-wrap gap-2 mt-3 min-h-8">
                {form.keywords.map(keyword => (
                  <span key={keyword} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-sm font-semibold">
                    {keyword}
                    <button onClick={() => setForm(current => ({ ...current, keywords: current.keywords.filter(item => item !== keyword) }))}><XMarkIcon className="w-3.5 h-3.5" /></button>
                  </span>
                ))}
                {!form.keywords.length && <p className="text-sm text-gray-400">Добавьте хотя бы одно кодовое слово</p>}
              </div>
              <div className="mt-4 flex items-center gap-4">
                <label className="text-sm text-gray-600 flex items-center gap-2"><input type="radio" checked={form.match_mode === 'contains'} onChange={() => setForm(current => ({ ...current, match_mode: 'contains' }))} /> Слово встречается в тексте</label>
                <label className="text-sm text-gray-600 flex items-center gap-2"><input type="radio" checked={form.match_mode === 'exact'} onChange={() => setForm(current => ({ ...current, match_mode: 'exact' }))} /> Точное совпадение</label>
              </div>
            </BuilderSection>

            {form.trigger_comments && (
              <BuilderSection number="3" title="Ответ под комментарием" subtitle="Человек сразу увидит реакцию под вашим Reels. Один вариант выбирается случайно.">
                <label className="flex items-center justify-between p-3 rounded-xl bg-gray-50 mb-4 cursor-pointer">
                  <div><p className="text-sm font-medium text-gray-800">Публично отвечать</p><p className="text-xs text-gray-500">Повышает вовлечённость публикации</p></div>
                  <input type="checkbox" checked={form.public_reply_enabled} onChange={event => setForm(current => ({ ...current, public_reply_enabled: event.target.checked }))} className="w-5 h-5 rounded text-teal-600" />
                </label>
                {form.public_reply_enabled && (
                  <div className="space-y-2">
                    {form.public_reply_variants.map((variant, index) => (
                      <div key={index} className="flex gap-2">
                        <input value={variant} maxLength={300} onChange={event => setForm(current => ({ ...current, public_reply_variants: current.public_reply_variants.map((item, itemIndex) => itemIndex === index ? event.target.value : item) }))} className="field" />
                        <button onClick={() => setForm(current => ({ ...current, public_reply_variants: current.public_reply_variants.filter((_, itemIndex) => itemIndex !== index) }))} className="p-3 text-gray-400 hover:text-red-500"><TrashIcon className="w-4 h-4" /></button>
                      </div>
                    ))}
                    <button onClick={() => setForm(current => ({ ...current, public_reply_variants: [...current.public_reply_variants, ''] }))} className="text-sm font-medium text-teal-600 flex items-center gap-1"><PlusIcon className="w-4 h-4" /> Добавить вариант</button>
                  </div>
                )}
              </BuilderSection>
            )}

            <BuilderSection number={form.trigger_comments ? '4' : '3'} title="Сообщение в Direct" subtitle="Главное сообщение с вашим лид-магнитом придёт человеку в личку.">
              <div className="grid gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Название автоматизации</label>
                  <input value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} placeholder="Гайд по созданию Reels" className="field" />
                </div>
                <div>
                  <div className="flex justify-between mb-2"><label className="text-sm font-medium text-gray-700">Текст сообщения</label><span className="text-xs text-gray-400">{form.reply_text.length}/800</span></div>
                  <textarea value={form.reply_text} onChange={event => setForm(current => ({ ...current, reply_text: event.target.value }))} maxLength={800} rows={6} className="field resize-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Ссылка на материал</label>
                  <div className="relative"><LinkIcon className="absolute left-3 top-3 w-4 h-4 text-gray-400" /><input type="url" value={form.response_url} onChange={event => setForm(current => ({ ...current, response_url: event.target.value }))} placeholder="https://ваш-сайт.ru/guide" className="field pl-9" /></div>
                </div>
                {form.response_url && (
                  <div>
                    <div className="flex justify-between mb-2"><label className="text-sm font-medium text-gray-700">Текст кнопки</label><span className="text-xs text-gray-400">до 20 символов</span></div>
                    <input value={form.button_text} maxLength={20} onChange={event => setForm(current => ({ ...current, button_text: event.target.value }))} placeholder="Получить материал" className="field" />
                  </div>
                )}
              </div>
            </BuilderSection>

            <BuilderSection number={form.trigger_comments ? '5' : '4'} title="Поведение бота" subtitle="Частота повторов и пауза перед ответом.">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Повторный запуск для того же человека</label>
                  <select value={form.repeat_delay_hours} onChange={event => setForm(current => ({ ...current, repeat_delay_hours: Number(event.target.value) }))} className="field">
                    <option value={0}>без ограничения</option>
                    <option value={1}>через 1 час</option>
                    <option value={24}>через 24 часа</option>
                    <option value={168}>через 7 дней</option>
                    <option value={720}>через 30 дней</option>
                    <option value={8760}>через 1 год</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Пауза перед ответом</label>
                  <select value={form.reply_delay_seconds} onChange={event => setForm(current => ({ ...current, reply_delay_seconds: Number(event.target.value) }))} className="field">
                    <option value={0}>отвечать сразу</option>
                    <option value={10}>около 10 секунд</option>
                    <option value={30}>около 30 секунд</option>
                    <option value={60}>около 60 секунд</option>
                  </select>
                  <p className="text-xs text-gray-400 mt-1.5">
                    Мгновенный ответ — заметный признак бота. Пауза берётся случайной в пределах выбранной.
                  </p>
                </div>
              </div>
            </BuilderSection>

            <BuilderSection number={form.trigger_comments ? '6' : '5'} title="Проверка" subtitle="Прогоняет ваш текст через тот же механизм, что и живые комментарии. Ничего не отправляет.">
              <div className="flex gap-2 p-1 bg-gray-100 rounded-xl w-fit mb-3">
                <button onClick={() => setTestTrigger('comment')} className={`px-4 py-2 rounded-lg text-sm font-medium ${testTrigger === 'comment' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Комментарий</button>
                <button onClick={() => setTestTrigger('dm')} className={`px-4 py-2 rounded-lg text-sm font-medium ${testTrigger === 'dm' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Direct</button>
              </div>
              <div className="flex gap-2">
                <input
                  value={testText}
                  onChange={event => setTestText(event.target.value)}
                  onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); runTest(); } }}
                  placeholder="Например: привет, скинь гайд пожалуйста"
                  className="field"
                />
                <button onClick={runTest} disabled={testing || !testText.trim() || !form.instagram_account_id} className="btn btn-primary">
                  {testing && <ArrowPathIcon className="w-4 h-4 animate-spin" />}
                  Проверить
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2">Проверяются сохранённые сценарии — сначала сохраните изменения.</p>

              {testResult && (
                <div className="mt-4 space-y-3">
                  {testResult.blockers.map(blocker => (
                    <p key={blocker} className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">{blocker}</p>
                  ))}

                  {testResult.matched ? (
                    <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                      <p className="text-sm font-semibold text-green-900">
                        Сработает «{testResult.matched.title}» по слову «{testResult.matched.keyword}»
                        {testResult.matched.delay_seconds > 0 && ` — с паузой около ${testResult.matched.delay_seconds} с`}
                      </p>
                      {testResult.matched.public_reply && (
                        <p className="text-xs text-green-800 mt-2">Под публикацией: «{testResult.matched.public_reply}»</p>
                      )}
                      <div className="mt-3 bg-white border border-green-200 rounded-xl p-3">
                        <p className="text-xs whitespace-pre-line text-gray-800">{testResult.matched.direct_text}</p>
                        {testResult.matched.button_text && (
                          <div className="mt-2 text-center text-xs font-semibold text-teal-700 bg-teal-50 rounded-lg py-2">{testResult.matched.button_text}</div>
                        )}
                      </div>
                      {!testResult.matched.response_url && (
                        <p className="text-xs text-green-800 mt-2">Ссылка не заполнена — сообщение уйдёт без кнопки.</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-xl p-3">Ни один сценарий не сработает на этот текст.</p>
                  )}

                  {testResult.considered.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Остальные сценарии</p>
                      <ul className="space-y-1.5">
                        {testResult.considered.map(item => (
                          <li key={item.id} className="text-xs text-gray-500">
                            <span className="font-medium text-gray-700">{item.title}</span> — {item.reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </BuilderSection>
          </main>

          <aside className="xl:sticky xl:top-28 self-start">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Как это увидит клиент</p>
            <div className="rounded-[2.5rem] bg-[#171717] p-2.5 shadow-2xl shadow-gray-300">
              <div className="rounded-[2rem] bg-white overflow-hidden min-h-[630px]">
                <div className="h-7 bg-white flex justify-center"><span className="w-24 h-5 bg-black rounded-b-xl" /></div>
                <div className="px-4 py-3 border-b flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-gray-300" /><p className="text-sm font-semibold">{accounts.find(account => account.id === form.instagram_account_id)?.username || 'instagram'}</p></div>
                <div className="p-4 bg-gray-50">
                  <div className="aspect-square rounded-xl bg-gray-800 flex items-center justify-center text-white/70"><span className="text-sm">Ваш Reels</span></div>
                  <div className="mt-3 flex gap-2"><div className="w-7 h-7 rounded-full bg-gray-300" /><div className="flex-1"><p className="text-xs"><b>client</b> {form.keywords[0] || 'ГАЙД'}</p>{form.public_reply_enabled && form.trigger_comments && <p className="text-xs mt-2 text-gray-500"><b>{accounts.find(account => account.id === form.instagram_account_id)?.username || 'вы'}</b> {form.public_reply_variants.find(Boolean) || 'Отправил в Direct 🙌'}</p>}</div></div>
                </div>
                <div className="border-t p-4 bg-white">
                  <p className="text-[10px] text-gray-400 text-center mb-3 uppercase tracking-wider">Direct</p>
                  <div className="ml-auto max-w-[88%] rounded-xl rounded-br-md bg-[#7c3aed] text-white p-3">
                    <p className="text-xs whitespace-pre-line">{form.reply_text || 'Здесь будет ваше сообщение'}</p>
                    {form.response_url && <div className="mt-3 bg-white text-gray-900 rounded-xl px-3 py-2 text-xs font-semibold text-center">{form.button_text || 'Получить материал'}</div>}
                  </div>
                </div>
              </div>
            </div>
            {selectedMedia.length > 0 && <p className="text-xs text-gray-400 text-center mt-3">Сценарий работает для {selectedMedia.length} публикаций</p>}
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Автоматизации</h1>
          <p className="text-sm text-gray-500 mt-1">Комментарии превращаются в диалоги и лиды — автоматически.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => loadDashboard(true)} className="btn btn-secondary" title="Обновить"><ArrowPathIcon className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /></button>
          <button onClick={openCreate} className="btn btn-primary"><PlusIcon className="w-4 h-4" /> Создать автоматизацию</button>
        </div>
      </div>

      {notice && <div className={`mb-6 flex gap-3 p-4 rounded-xl border ${notice.success ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>{notice.success ? <CheckCircleIcon className="w-5 h-5" /> : <ExclamationTriangleIcon className="w-5 h-5" />}<p className="text-sm">{notice.message}</p><button onClick={() => setNotice(null)} className="ml-auto"><XMarkIcon className="w-4 h-4" /></button></div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <Metric label="Активные сценарии" value={activeRules} icon={<BoltIcon className="w-5 h-5" />} />
        <Metric label="Доставлено в Direct" value={sentCount} icon={<PaperAirplaneIcon className="w-5 h-5" />} />
        <Metric
          label={failedCount ? `Доставляемость · ${failedCount} с ошибкой` : 'Доставляемость'}
          value={attempts ? `${deliverability}%` : '—'}
          icon={<CheckCircleIcon className="w-5 h-5" />}
        />
        <Metric label="Аккаунты готовы" value={`${readyAccounts}/${accounts.length}`} icon={<ChatBubbleLeftRightIcon className="w-5 h-5" />} />
      </div>

      <section className="mb-9">
        <div className="flex items-center justify-between mb-3"><div><h2 className="text-lg font-bold text-gray-900">Ваши сценарии</h2><p className="text-sm text-gray-500">Комментарий → ответ под Reels → Direct</p></div></div>
        {loading ? <div className="h-48 rounded-xl bg-gray-100 animate-pulse" /> : rules.length === 0 ? (
          <button onClick={openCreate} className="group w-full bg-white border border-gray-200 rounded-xl p-8 text-left hover:border-teal-300 hover:shadow-lg transition-all">
            <div className="grid md:grid-cols-[1fr_auto] items-center gap-8">
              <div><span className="inline-flex p-3 rounded-xl bg-teal-50 text-teal-600 mb-4"><BoltIcon className="w-6 h-6" /></span><h3 className="text-xl font-bold text-gray-900">Создайте первый лид-магнит</h3><p className="text-gray-500 mt-2 max-w-xl">Человек пишет кодовое слово под Reels, получает живой ответ в комментариях и материал в Direct.</p></div>
              <FlowPreview />
            </div>
          </button>
        ) : (
          <div className="grid lg:grid-cols-2 gap-4">
            {rules.map(rule => (
              <article key={rule.id} className={`bg-white border border-gray-200 rounded-xl p-5 shadow-sm ${rule.is_active ? '' : 'opacity-60'}`}>
                <div className="flex items-start gap-3"><div className="w-11 h-11 rounded-xl bg-teal-600 text-white flex items-center justify-center"><BoltIcon className="w-5 h-5" /></div><div className="min-w-0 flex-1"><h3 className="font-bold text-gray-900 truncate">{rule.title}</h3><p className="text-xs text-gray-500 mt-0.5">{accounts.find(account => account.id === rule.instagram_account_id)?.username ? `@${accounts.find(account => account.id === rule.instagram_account_id)?.username}` : 'Все аккаунты'} · {rule.media_scope === 'selected' ? `${rule.media_ids?.length || 0} публикаций` : 'Все публикации'}</p></div><button onClick={() => toggleRule(rule)} className={`relative w-11 h-6 rounded-full ${rule.is_active ? 'bg-green-500' : 'bg-gray-200'}`}><span className={`absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${rule.is_active ? 'translate-x-5' : ''}`} /></button></div>
                <div className="flex items-center gap-2 my-5 overflow-hidden"><StepBadge text={(rule.keywords?.length ? rule.keywords : [rule.codeword]).join(', ')} tone="amber" /><ChevronRightIcon className="w-4 h-4 text-gray-300" /><StepBadge text="Ответ под Reels" tone="violet" /><ChevronRightIcon className="w-4 h-4 text-gray-300" /><StepBadge text="Direct" tone="teal" /></div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-4 border-t border-gray-100">
                  <span className={`text-xs font-medium ${rule.is_active ? 'text-green-600' : 'text-gray-400'}`}>{rule.is_active ? '● Работает' : '○ Остановлен'}</span>
                  <RuleStats stats={statsByRule.get(rule.id)} formatDate={formatDate} />
                  <div className="ml-auto flex gap-1"><button onClick={() => openEdit(rule)} className="p-2 text-gray-400 hover:text-gray-900 rounded-lg hover:bg-gray-100"><PencilIcon className="w-4 h-4" /></button><button onClick={() => deleteRule(rule)} className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50"><TrashIcon className="w-4 h-4" /></button></div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Входящие события</h2>
            <p className="text-sm text-gray-500">Сюда попадает каждый комментарий и Direct — и совпавшие, и пропущенные.</p>
          </div>
          {accounts.length > 1 && (
            <select
              value={eventAccountId}
              onChange={event => { setEventAccountId(event.target.value); setEventLimit(EVENTS_PAGE_SIZE); }}
              className="field max-w-56"
            >
              <option value="">Все аккаунты</option>
              {accounts.map(account => <option key={account.id} value={account.id}>@{account.username}</option>)}
            </select>
          )}
        </div>
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {events.length === 0 ? <div className="py-12 text-center"><ClockIcon className="w-9 h-9 text-gray-300 mx-auto mb-2" /><p className="text-sm text-gray-500">Событий пока нет</p><p className="text-xs text-gray-400 mt-1">Оставьте тестовый комментарий с другого аккаунта.</p></div> : events.map(event => { const meta = statusMeta[event.status]; return (
            <div key={event.id} className="grid sm:grid-cols-[minmax(0,1fr)_auto_auto] gap-3 items-center px-5 py-4 border-b last:border-b-0 border-gray-100">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{event.commenter_username ? `@${event.commenter_username}: ` : ''}{event.incoming_text}</p>
                <p className="text-xs text-gray-400 mt-1">{event.instagram_accounts?.username ? `@${event.instagram_accounts.username}` : 'Instagram'} · {formatDate(event.created_at)}</p>
                {event.error_message && <p className="text-xs text-amber-700 mt-1.5">{event.error_message}</p>}
              </div>
              <div className="flex gap-2"><DeliveryBadge label="Под Reels" status={event.public_reply_status} /><DeliveryBadge label="Direct" status={event.dm_status} /></div>
              <span className={`px-2.5 py-1 rounded-lg border text-xs font-medium ${meta.className}`}>{meta.label}</span>
            </div>
          ); })}
        </div>
        {events.length < eventsTotal && (
          <button
            onClick={() => setEventLimit(current => current + EVENTS_PAGE_SIZE)}
            disabled={refreshing}
            className="btn btn-secondary w-full mt-3"
          >
            {refreshing && <ArrowPathIcon className="w-4 h-4 animate-spin" />}
            Показать ещё — {events.length} из {eventsTotal}
          </button>
        )}
      </section>
    </div>
  );
};

const BuilderSection: React.FC<{ number: string; title: string; subtitle: string; children: React.ReactNode }> = ({ number, title, subtitle, children }) => (
  <section className="bg-white border border-gray-200 rounded-xl p-5 sm:p-6 shadow-sm">
    <div className="flex gap-3 mb-5"><span className="w-8 h-8 rounded-full bg-gray-900 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">{number}</span><div><h2 className="font-bold text-gray-900">{title}</h2><p className="text-sm text-gray-500 mt-0.5">{subtitle}</p></div></div>
    {children}
  </section>
);

const ChoiceCard: React.FC<{ active: boolean; title: string; description: string; onClick: () => void }> = ({ active, title, description, onClick }) => (
  <button onClick={onClick} className={`p-4 rounded-xl border-2 text-left transition-all ${active ? 'border-teal-500 bg-teal-50/50' : 'border-gray-200 hover:border-gray-300'}`}>
    <div className="flex items-start justify-between"><ChatBubbleLeftRightIcon className={`w-5 h-5 ${active ? 'text-teal-600' : 'text-gray-400'}`} />{active && <CheckCircleIcon className="w-5 h-5 text-teal-600" />}</div><p className="text-sm font-semibold text-gray-900 mt-3">{title}</p><p className="text-xs text-gray-500 mt-1">{description}</p>
  </button>
);

const Metric: React.FC<{ label: string; value: string | number; icon: React.ReactNode }> = ({ label, value, icon }) => (
  <div className="bg-white border border-gray-200 rounded-xl p-4"><div className="text-teal-600">{icon}</div><p className="text-2xl font-bold text-gray-900 mt-3">{value}</p><p className="text-xs text-gray-500 mt-0.5">{label}</p></div>
);

const RuleStats: React.FC<{ stats?: LeadMagnetStats; formatDate: (value: string) => string }> = ({ stats, formatDate }) => {
  const sent = Number(stats?.sent_count || 0);
  const failed = Number(stats?.failed_count || 0);

  if (!sent && !failed) return <span className="text-xs text-gray-400">Ещё не срабатывал</span>;

  return (
    <span className="text-xs text-gray-500 flex items-center gap-3">
      <span className="tabular"><b className="text-gray-900">{sent}</b> доставлено</span>
      {failed > 0 && <span className="tabular text-red-600">{failed} с ошибкой</span>}
      {stats?.last_sent_at && <span className="text-gray-400">последнее {formatDate(stats.last_sent_at)}</span>}
    </span>
  );
};

const StepBadge: React.FC<{ text: string; tone: 'amber' | 'violet' | 'teal' }> = ({ text, tone }) => {
  const styles = { amber: 'bg-amber-50 text-amber-700 border-amber-200', violet: 'bg-teal-50 text-teal-700 border-teal-200', teal: 'bg-teal-50 text-teal-700 border-teal-200' };
  return <span className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold truncate ${styles[tone]}`}>{text}</span>;
};

const FlowPreview = () => (
  <div className="flex items-center gap-2"><StepBadge text="Комментарий «ГАЙД»" tone="amber" /><ChevronRightIcon className="w-4 h-4 text-gray-300" /><StepBadge text="Ответ" tone="violet" /><ChevronRightIcon className="w-4 h-4 text-gray-300" /><StepBadge text="Direct" tone="teal" /></div>
);

const DeliveryBadge: React.FC<{ label: string; status: string }> = ({ label, status }) => {
  const success = status === 'sent';
  const failed = status === 'failed';
  return <span className={`px-2 py-1 rounded-md text-[10px] font-medium ${success ? 'bg-green-50 text-green-700' : failed ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500'}`}>{success ? '✓ ' : failed ? '! ' : ''}{label}</span>;
};

export default AutomationsPage;
