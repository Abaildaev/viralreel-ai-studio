import React, { useState, useEffect } from 'react';
import { INSTAGRAM_ACCOUNT_COLUMNS, supabase } from '../lib/supabase';
import { LeadMagnet, LeadMagnetStats, InstagramAccount } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useConfirm } from '../contexts/ModalContext';
import AutomationAnalyticsDashboard from '../components/AutomationAnalyticsDashboard';
import AutomationLiveFeed, { LiveAutomationEvent } from '../components/AutomationLiveFeed';
import AiSalesAgentConfigView from '../components/AiSalesAgentConfig';
import AiSalesAgentSimulator from '../components/AiSalesAgentSimulator';
import AutomationRulesTab from '../components/automations/AutomationRulesTab';
import AutomationRuleEditorModal, { AutomationForm } from '../components/automations/AutomationRuleEditorModal';
import AutomationTesterTab from '../components/automations/AutomationTesterTab';
import AutomationQueueHealth from '../components/automations/AutomationQueueHealth';
import ConversationsTab from '../components/automations/ConversationsTab';
import { Button, PageHeader, PageShell } from '../components/ui';
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
  ArrowRightIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/outline';

type Tab = 'rules' | 'analytics' | 'live' | 'sales_agent' | 'conversations' | 'tester';

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
  ],
  reply_text: '',
  direct_reply_variants: [''],
  response_url: '',
  button_text: 'Получить материал',
  repeat_delay_hours: 24,
  reply_delay_seconds: 5,
  is_active: true,
};

export default function AutomationsPage() {
  const { user } = useAuth();
  const { confirm, alert, toast } = useConfirm();

  const [activeTab, setActiveTab] = useState<Tab>('rules');
  const [rules, setRules] = useState<LeadMagnet[]>([]);
  const [stats, setStats] = useState<LeadMagnetStats[]>([]);
  const [events, setEvents] = useState<LiveAutomationEvent[]>([]);
  const [accounts, setAccounts] = useState<InstagramAccount[]>([]);
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
      const [rRes, sRes, eRes, aRes] = await Promise.all([
        supabase.from('lead_magnets').select('*').order('created_at', { ascending: false }),
        supabase.from('lead_magnet_stats').select('*'),
        /*
          The table is `instagram_automation_events`; `lead_magnet_events` has
          never existed, so the live feed and the analytics tab were always fed
          an empty list.
        */
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
      ]);

      // Supabase reports failures in the result rather than throwing, so a
      // bare `if (data)` hid every one of the errors above.
      const failure = rRes.error || sRes.error || eRes.error || aRes.error;
      if (failure) throw new Error(failure.message);

      if (rRes.data) setRules(rRes.data);
      if (sRes.data) setStats(sRes.data);
      if (eRes.data) setEvents(eRes.data as unknown as LiveAutomationEvent[]);
      if (aRes.data) setAccounts(aRes.data);
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
      response_url: rule.response_url || '',
      button_text: rule.button_text || 'Получить материал',
      repeat_delay_hours: rule.repeat_delay_hours ?? 24,
      reply_delay_seconds: rule.reply_delay_seconds ?? 5,
      is_active: rule.is_active,
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
      await supabase.from('lead_magnets').update({ is_active: nextState }).eq('id', rule.id);
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, is_active: nextState } : r)));
    } catch (err: any) {
      console.error('Toggle error:', err);
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
        direct_reply_variants: form.direct_reply_variants.map((value) => value.trim()).filter(Boolean),
        response_url: form.response_url.trim() || null,
        button_text: form.button_text.trim() || null,
        repeat_delay_hours: form.repeat_delay_hours,
        reply_delay_seconds: form.reply_delay_seconds,
        is_active: form.is_active,
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
    <PageShell width="wide" className="space-y-6">
      <PageHeader
        title="Автоматизации & CRM"
        description="Управляйте сценариями Comment-to-DM, обучайте ИИ-продавца и отслеживайте конверсии"
        className="mb-0"
        actions={
          activeTab === 'rules' ? (
            <Button
              variant="primary"
              onClick={handleCreateNew}
              icon={<PlusIcon className="h-4 w-4" />}
            >
              Создать сценарий
            </Button>
          ) : undefined
        }
      />

      {/* Above the tabs on purpose: a queue that has stopped draining is worth
          seeing whichever tab is open. */}
      <AutomationQueueHealth />

      {/* Tabs Navigation */}
      <div className="flex items-center gap-1 p-1 bg-gray-100/90 rounded-2xl w-fit border border-gray-200/60 overflow-x-auto max-w-full">
        <button
          type="button"
          onClick={() => setActiveTab('rules')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'rules'
              ? 'bg-white text-gray-900 shadow-xs'
              : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          <BoltIcon className="w-4 h-4" />
          Сценарии
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('sales_agent')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 whitespace-nowrap ${
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
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'analytics'
              ? 'bg-white text-gray-900 shadow-xs'
              : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          <ChartBarIcon className="w-4 h-4" />
          CRM & Аналитика
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('conversations')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 whitespace-nowrap ${
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
          onClick={() => setActiveTab('live')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'live'
              ? 'bg-white text-gray-900 shadow-xs'
              : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          <RadioIcon className="w-4 h-4" />
          Live Feed
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('tester')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 whitespace-nowrap ${
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

      {/* Tab 3: CRM & Analytics */}
      {activeTab === 'analytics' && (
        <AutomationAnalyticsDashboard events={events} rules={rules} stats={stats} />
      )}

      {activeTab === 'conversations' && <ConversationsTab />}

      {/* Tab 4: Live Feed */}
      {activeTab === 'live' && (
        <div className="max-w-4xl mx-auto">
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
