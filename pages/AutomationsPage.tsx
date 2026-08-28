import React, { useState, useEffect } from 'react';
import { INSTAGRAM_ACCOUNT_COLUMNS, supabase } from '../lib/supabase';
import { LeadMagnet, LeadMagnetStats, InstagramAccount, NO_ATTACHMENT, TelegramBot } from '../types';
import { attachmentFields } from '../services/attachmentService';
import { useAuth } from '../contexts/AuthContext';
import { useConfirm } from '../contexts/ModalContext';
import AutomationAnalyticsDashboard from '../components/AutomationAnalyticsDashboard';
import AutomationLiveFeed, { LiveAutomationEvent } from '../components/AutomationLiveFeed';
import AiSalesAgentConfigView from '../components/AiSalesAgentConfig';
import AiSalesAgentSimulator from '../components/AiSalesAgentSimulator';
import AutomationRulesTab from '../components/automations/AutomationRulesTab';
import AutomationRuleEditorModal, { AutomationForm } from '../components/automations/AutomationRuleEditorModal';
import AutomationTesterTab from '../components/automations/AutomationTesterTab';
import ConversationsTab from '../components/automations/ConversationsTab';
import { Button, PageHeader, PageShell } from '../components/ui';
import { loadBot } from '../services/telegramService';
import {
  DEFAULT_SALES_AGENT_CONFIG,
  loadSalesAgentConfig,
  saveSalesAgentConfig,
} from '../services/aiSalesAgentService';
import { AiSalesAgentConfig } from '../types';

import {
  BoltIcon,
  ChartBarIcon,
  RadioIcon,
  BeakerIcon,
  SparklesIcon,
  PlusIcon,
  ChatBubbleLeftRightIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';

type Tab = 'rules' | 'leads' | 'analytics' | 'events' | 'sales_agent' | 'conversations' | 'tester';

const blankForm: AutomationForm = {
  id: null,
  instagram_account_id: null,
  title: '',
  description: '',
  keywords: [],
  match_mode: 'contains',
  trigger_comments: true,
  trigger_dm: true,
  media_scope: 'all',
  media_ids: [],
  public_reply_enabled: true,
  public_reply_variants: [
    'Отправил в Direct! Проверяйте сообщения 🚀',
    'Ссылка уже у вас в Direct 🙌',
    'Материал отправлен в личные сообщения!',
    'Если сообщение не пришло, проверьте папку «Запросы» в Direct 📩',
    'Не видите сообщение? Загляните в папку «Запросы» — иногда оно попадает туда 👀',
    'Проверьте папку «Запросы» в Direct, если сообщение не появилось сразу 🔎',
  ],
  reply_text: '',
  direct_reply_variants: [''],
  direct_reply_buttons: [''],
  response_url: '',
  button_text: 'Получить материал',
  repeat_delay_hours: 24,
  reply_delay_seconds: 5,
  ab_quick_reply_percent: 0,
  ab_quick_reply_text: 'Материал готов 🙌 Нажми кнопку ниже — и я сразу пришлю доступ.',
  ab_quick_reply_button: 'Забрать базу',
  ab_profile_reply_percent: 0,
  ab_profile_reply_text:
    'Вижу твой комментарий 👊\n\nСсылка на базу промптов — в шапке моего профиля.',
  is_active: true,
  ...NO_ATTACHMENT,
};

export default function AutomationsPage() {
  const { user } = useAuth();
  const { confirm, alert, toast } = useConfirm();

  const [activeTab, setActiveTab] = useState<Tab>('rules');
  const [rules, setRules] = useState<LeadMagnet[]>([]);
  const [stats, setStats] = useState<LeadMagnetStats[]>([]);
  const [events, setEvents] = useState<LiveAutomationEvent[]>([]);
  const [accounts, setAccounts] = useState<InstagramAccount[]>([]);
  const [telegramBot, setTelegramBot] = useState<TelegramBot | null>(null);
  const [loading, setLoading] = useState(true);

  // Editor Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingForm, setEditingForm] = useState<AutomationForm>(blankForm);
  const [savingRule, setSavingRule] = useState(false);

  const [agentConfig, setAgentConfig] = useState<AiSalesAgentConfig>(DEFAULT_SALES_AGENT_CONFIG);
  const [selectedAgentAccountId, setSelectedAgentAccountId] = useState<string | null>(null);
  const [savingAgent, setSavingAgent] = useState(false);

  // The agent config lives in the database and localStorage
  useEffect(() => {
    if (!user) return;
    const defaultAccId = accounts[0]?.id ?? null;
    setSelectedAgentAccountId(defaultAccId);
    loadSalesAgentConfig(defaultAccId).then(setAgentConfig);
  }, [user, accounts]);

  const handleSaveAgent = async () => {
    if (!user) return;
    setSavingAgent(true);
    const { error, isLocalFallback } = await saveSalesAgentConfig(agentConfig, user.id);
    setSavingAgent(false);

    if (error) {
      toast({ message: `Не удалось сохранить агента: ${error.message}`, tone: 'error' });
      return;
    }

    if (isLocalFallback) {
      toast(
        agentConfig.isEnabled
          ? 'Агент сохранён локально в браузере. Для синхронизации с Direct примените SQL-миграцию в Supabase.'
          : 'Агент сохранён локально в браузере (тестовый режим).',
      );
      return;
    }

    toast(
      agentConfig.isEnabled
        ? 'Агент сохранён и включён — он начнёт отвечать в Direct'
        : 'Агент сохранён. Он выключен и в Direct не отвечает.',
    );
  };

  useEffect(() => {
    if (user) {
      loadAll();
    }
  }, [user]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [rRes, sRes, eRes, aRes, currentTelegramBot] = await Promise.all([
        supabase.from('lead_magnets').select('*').order('created_at', { ascending: false }),
        supabase.from('lead_magnet_stats').select('*'),
        /* The live feed stays capped at 50 rows. Analytics and CRM contacts are
           calculated by bounded RPCs only when their tabs are mounted. */
        supabase
          .from('instagram_automation_events')
          .select('*, lead_magnets(title, codeword, response_url), instagram_accounts(username)')
          .order('created_at', { ascending: false })
          .limit(50),
        /*
          `select('*')` fails here by design — the hardening migration revoked
          column access so the browser can never read `access_token`, which
          means a wildcard select is rejected outright and the account list came
          back empty.
        */
        supabase
          .from('instagram_accounts')
          .select(INSTAGRAM_ACCOUNT_COLUMNS)
          .order('created_at', { ascending: false }),
        loadBot().catch(() => null),
      ]);

      // Supabase reports failures in the result rather than throwing, so a
      // bare `if (data)` hid every one of the errors above.
      const failure = rRes.error || sRes.error || eRes.error || aRes.error;
      if (failure) throw new Error(failure.message);

      if (rRes.data) setRules(rRes.data);
      if (sRes.data) setStats(sRes.data);
      if (eRes.data) setEvents(eRes.data as unknown as LiveAutomationEvent[]);
      if (aRes.data) setAccounts(aRes.data);
      setTelegramBot(currentTelegramBot);
    } catch (err: any) {
      console.error('Error loading automations:', err);
      toast({ message: `Не удалось загрузить автоматизации: ${err.message}`, tone: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNew = () => {
    setEditingForm({
      ...blankForm,
      instagram_account_id: accounts[0]?.id || null,
    });
    setIsModalOpen(true);
  };

  const handleEdit = (rule: LeadMagnet) => {
    setEditingForm({
      id: rule.id,
      instagram_account_id: rule.instagram_account_id || null,
      title: rule.title,
      description: rule.description || '',
      keywords: rule.keywords?.length ? rule.keywords : [rule.codeword],
      match_mode: rule.match_mode || 'contains',
      trigger_comments: rule.trigger_comments ?? true,
      trigger_dm: rule.trigger_dm ?? true,
      media_scope: rule.media_scope || 'all',
      media_ids: rule.media_ids || [],
      public_reply_enabled: rule.public_reply_enabled ?? true,
      public_reply_variants: rule.public_reply_variants?.length
        ? rule.public_reply_variants
        : ['Отправил в Direct! 🚀'],
      reply_text: rule.reply_text,
      direct_reply_variants: rule.direct_reply_variants?.length
        ? rule.direct_reply_variants
        : [rule.reply_text || ''],
      /* Padded to the variants it captions: a rule saved before per-variant
         buttons existed has none at all, and a short list would leave the
         editor reading past its end. */
      direct_reply_buttons: (rule.direct_reply_variants?.length
        ? rule.direct_reply_variants
        : [rule.reply_text || '']
      ).map((_, index) => rule.direct_reply_buttons?.[index] ?? ''),
      response_url: rule.response_url || '',
      button_text: rule.button_text || 'Получить материал',
      repeat_delay_hours: rule.repeat_delay_hours ?? 24,
      reply_delay_seconds: rule.reply_delay_seconds ?? 5,
      ab_quick_reply_percent: rule.ab_quick_reply_percent ?? 0,
      ab_quick_reply_text:
        rule.ab_quick_reply_text || 'Материал готов 🙌 Нажми кнопку ниже — и я сразу пришлю доступ.',
      ab_quick_reply_button: rule.ab_quick_reply_button || 'Забрать базу',
      ab_profile_reply_percent: rule.ab_profile_reply_percent ?? 0,
      ab_profile_reply_text:
        rule.ab_profile_reply_text ||
        'Вижу твой комментарий 👊\n\nСсылка на базу промптов — в шапке моего профиля.',
      is_active: rule.is_active,
      attachment_type: rule.attachment_type ?? 'none',
      attachment_path: rule.attachment_path ?? '',
      attachment_name: rule.attachment_name ?? '',
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (rule: LeadMagnet) => {
    const ok = await confirm({
      title: 'Удалить сценарий?',
      message: `Вы уверены, что хотите удалить "${rule.title}"?`,
      confirmText: 'Удалить',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      const { error } = await supabase.from('lead_magnets').delete().eq('id', rule.id);
      if (error) throw error;
      setRules((prev) => prev.filter((r) => r.id !== rule.id));
    } catch (err: any) {
      await alert({ title: 'Ошибка удаления', message: err.message, variant: 'error' });
    }
  };

  const handleToggleActive = async (rule: LeadMagnet) => {
    const nextState = !rule.is_active;
    try {
      const { error } = await supabase.from('lead_magnets').update({ is_active: nextState }).eq('id', rule.id);
      if (error) throw error;
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, is_active: nextState } : r)));
    } catch (err: any) {
      await alert({ title: 'Ошибка изменения статуса', message: err.message || 'Не удалось изменить статус сценария', variant: 'error' });
    }
  };

  const handleSaveForm = async (form: AutomationForm) => {
    if (!user) return;
    setSavingRule(true);

    try {
      const primaryCodeword = form.keywords[0] || 'ХОЧУ';
      const payload = {
        user_id: user.id,
        instagram_account_id: form.instagram_account_id,
        title: form.title.trim(),
        description: form.description.trim(),
        codeword: primaryCodeword,
        keywords: form.keywords,
        match_mode: form.match_mode,
        trigger_comments: form.trigger_comments,
        trigger_dm: form.trigger_dm,
        media_scope: form.media_scope,
        media_ids: form.media_ids,
        public_reply_enabled: form.public_reply_enabled,
        public_reply_variants: form.public_reply_variants,
        reply_text: form.reply_text.trim(),
        /* Kept as pairs through the filter, so a blank variant cannot shift
           every button below it onto the wrong words. */
        direct_reply_variants: form.direct_reply_variants
          .map((value, index) => ({ text: value.trim(), index }))
          .filter((item) => Boolean(item.text))
          .map((item) => item.text),
        direct_reply_buttons: form.direct_reply_variants
          .map((value, index) => ({ text: value.trim(), index }))
          .filter((item) => Boolean(item.text))
          .map((item) => (form.direct_reply_buttons[item.index] ?? '').trim()),
        /*
          Both columns are NOT NULL, and the worker calls `.trim()` on them
          when it builds the Direct message, so an empty field has to travel as
          an empty string. Sent as null it failed the constraint outright,
          which is why saving any scenario without a link came back as an
          error — and why a row that somehow held null would crash the worker.
        */
        response_url: form.response_url.trim(),
        button_text: form.button_text.trim(),
        repeat_delay_hours: form.repeat_delay_hours,
        reply_delay_seconds: form.reply_delay_seconds,
        ab_quick_reply_percent: form.trigger_comments
          ? Math.max(0, Math.min(100, form.ab_quick_reply_percent))
          : 0,
        ab_quick_reply_text:
          form.ab_quick_reply_text.trim() || 'Материал готов 🙌 Нажми кнопку ниже — и я сразу пришлю доступ.',
        ab_quick_reply_button: form.ab_quick_reply_button.trim() || 'Забрать базу',
        ab_profile_reply_percent: form.trigger_comments
          ? Math.max(
              0,
              Math.min(
                100 - Math.max(0, Math.min(100, form.ab_quick_reply_percent)),
                form.ab_profile_reply_percent,
              ),
            )
          : 0,
        ab_profile_reply_text:
          form.ab_profile_reply_text.trim() ||
          'Вижу твой комментарий 👊\n\nСсылка на базу промптов — в шапке моего профиля.',
        is_active: form.is_active,
        ...attachmentFields(form),
      };

      if (form.id) {
        const { error } = await supabase.from('lead_magnets').update(payload).eq('id', form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('lead_magnets').insert(payload);
        if (error) throw error;
      }

      setIsModalOpen(false);
      await loadAll();
    } catch (err: any) {
      await alert({ title: 'Ошибка сохранения', message: err.message, variant: 'error' });
    } finally {
      setSavingRule(false);
    }
  };

  return (
    <PageShell width="wide" className="crm-page space-y-8">
      <PageHeader
        title="Автоматизации"
        description="Настройте воронки: от кодового слова в комментарии до выдачи материала в Direct."
        className="mb-0"
        actions={
          activeTab === 'rules' ? (
            <Button
              variant="primary"
              onClick={handleCreateNew}
              icon={<PlusIcon className="h-4 w-4" />}
            >
              Создать воронку
            </Button>
          ) : undefined
        }
      />

      {/* Tabs Navigation */}
      <div className="scroll-x flex w-full max-w-full items-center gap-1.5 rounded-2xl border border-gray-200/60 bg-gray-100/90 p-1.5">
        <button
          type="button"
          onClick={() => setActiveTab('rules')}
          className={`flex min-w-[9rem] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
            activeTab === 'rules'
              ? 'bg-white text-gray-900 shadow-xs'
              : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          <BoltIcon className="w-4 h-4" />
          Воронка
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('sales_agent')}
          className={`flex min-w-[9rem] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
            activeTab === 'sales_agent'
              ? 'bg-white text-brand-600 shadow-xs'
              : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          <SparklesIcon className="w-4 h-4 text-brand-600" />
          ИИ Продавец
          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-blue-100/80 text-brand-600">
            AI
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('analytics')}
          className={`flex min-w-[9rem] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
            activeTab === 'analytics'
              ? 'bg-white text-gray-900 shadow-xs'
              : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          <ChartBarIcon className="w-4 h-4" />
          Аналитика
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('leads')}
          className={`flex min-w-[9rem] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
            activeTab === 'leads'
              ? 'bg-white text-gray-900 shadow-xs'
              : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          <UserGroupIcon className="w-4 h-4" />
          Лиды
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('conversations')}
          className={`flex min-w-[9rem] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
            activeTab === 'conversations'
              ? 'bg-white text-gray-900 shadow-xs'
              : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          <ChatBubbleLeftRightIcon className="w-4 h-4" />
          Диалоги
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('events')}
          className={`flex min-w-[9rem] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
            activeTab === 'events'
              ? 'bg-white text-gray-900 shadow-xs'
              : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          <RadioIcon className="w-4 h-4" />
          События
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('tester')}
          className={`flex min-w-[9rem] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
            activeTab === 'tester'
              ? 'bg-white text-gray-900 shadow-xs'
              : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          <BeakerIcon className="w-4 h-4" />
          Тестер логики
        </button>
      </div>

      {/* Tab 1: Rules List */}
      {activeTab === 'rules' && (
        <AutomationRulesTab
          rules={rules}
          stats={stats}
          accounts={accounts}
          loading={loading}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onToggleActive={handleToggleActive}
          onCreateNew={handleCreateNew}
        />
      )}

      {/* Tab 2: AI Sales Agent */}
      {activeTab === 'sales_agent' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="grid lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7">
              <AiSalesAgentConfigView
                config={agentConfig}
                onChange={setAgentConfig}
                accounts={accounts}
                selectedAccountId={selectedAgentAccountId}
                onAccountChange={(accId) => {
                  setSelectedAgentAccountId(accId);
                  loadSalesAgentConfig(accId).then(setAgentConfig);
                }}
                onSave={handleSaveAgent}
                saving={savingAgent}
              />
            </div>
            <div className="lg:col-span-5 sticky top-6">
              <AiSalesAgentSimulator config={agentConfig} />
            </div>
          </div>
        </div>
      )}

      {/* Leads */}
      {activeTab === 'leads' && (
        <AutomationAnalyticsDashboard view="leads" rules={rules} />
      )}

      {/* Analytics */}
      {activeTab === 'analytics' && (
        <AutomationAnalyticsDashboard view="analytics" rules={rules} />
      )}

      {activeTab === 'conversations' && <ConversationsTab />}

      {/* Events */}
      {activeTab === 'events' && (
        <div className="mx-auto w-full max-w-5xl">
          <AutomationLiveFeed initialEvents={events} onRefresh={loadAll} />
        </div>
      )}

      {/* Tab 5: Trigger Tester */}
      {activeTab === 'tester' && (
        <AutomationTesterTab rules={rules} accounts={accounts} />
      )}

      {/* Rule Create/Edit Modal */}
      {isModalOpen && (
        <AutomationRuleEditorModal
          initialForm={editingForm}
          accounts={accounts}
          saving={savingRule}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSaveForm}
        />
      )}
    </PageShell>
  );
}
