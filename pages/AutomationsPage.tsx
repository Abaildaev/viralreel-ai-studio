import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
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
import { Button, PageHeader, PageShell } from '../components/ui';

import {
  BoltIcon,
  ChartBarIcon,
  RadioIcon,
  BeakerIcon,
  SparklesIcon,
  PlusIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';

type Tab = 'rules' | 'analytics' | 'live' | 'sales_agent' | 'tester';

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
  response_url: '',
  button_text: 'Получить материал',
  repeat_delay_hours: 24,
  reply_delay_seconds: 5,
  is_active: true,
};

export default function AutomationsPage() {
  const { user } = useAuth();
  const { confirm, alert } = useConfirm();

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

  // Sales Agent showcase view mode
  const [salesAgentView, setSalesAgentView] = useState<'showcase' | 'editor'>('showcase');

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
        supabase.from('lead_magnet_events').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('instagram_accounts').select('*').order('created_at', { ascending: false }),
      ]);

      if (rRes.data) setRules(rRes.data);
      if (sRes.data) setStats(sRes.data);
      if (eRes.data) setEvents(eRes.data);
      if (aRes.data) setAccounts(aRes.data);
    } catch (err: any) {
      console.error('Error loading automations:', err);
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
        <div className="space-y-6">
          {salesAgentView === 'showcase' ? (
            /* ChatPlace style 4-point showcase screen */
            <div className="bg-white rounded-3xl border border-gray-200/80 p-8 sm:p-12 shadow-xs text-center max-w-4xl mx-auto space-y-8 animate-in fade-in">
              <div className="max-w-xl mx-auto space-y-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-brand-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                  Интерактивная песочница
                </span>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
                  ИИ-менеджер для продаж в Instagram Direct
                </h2>
                <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">
                  Обучите персонального ИИ-ассистента на базе ваших товаров, услуг и цен. Тестируйте скрипты отработки возражений в реальном времени.
                </p>
              </div>

              {/* 4 Points Grid with Blue Circle Icons */}
              <div className="grid sm:grid-cols-2 gap-4 text-left max-w-3xl mx-auto">
                <div className="p-5 rounded-2xl bg-gray-50 border border-gray-200/60 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-brand-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0 shadow-sm">
                    ★
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-gray-900">Отвечает 24/7</h4>
                    <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                      Не упускает ни одной заявки, мгновенно вовлекая клиента в диалог в любое время суток.
                    </p>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-gray-50 border border-gray-200/60 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-brand-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0 shadow-sm">
                    ⚙
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-gray-900">Простая настройка</h4>
                    <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                      Заполните базу знаний своими товарами, ссылками и ценами без сложного программирования.
                    </p>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-gray-50 border border-gray-200/60 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-brand-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0 shadow-sm">
                    👤
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-gray-900">Общается как человек</h4>
                    <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                      Задает квалифицирующие вопросы, шутит в тему и мягко отрабатывает любые возражения.
                    </p>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-gray-50 border border-gray-200/60 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-brand-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0 shadow-sm">
                    ⚡
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-gray-900">Держит общение под контролем</h4>
                    <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                      Автоматически распознает стоп-слова и передает сложные диалоги живому оператору.
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setSalesAgentView('editor')}
                  className="px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-2xl shadow-md transition-all flex items-center gap-2 active:scale-95"
                >
                  <SparklesIcon className="w-4 h-4" />
                  Открыть конфигуратор и симулятор
                  <ArrowRightIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            /* 2-Column Configurator & Direct Simulator */
            <div className="space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setSalesAgentView('showcase')}
                  className="text-xs font-semibold text-brand-600 hover:underline flex items-center gap-1"
                >
                  ← Назад к описанию возможностей
                </button>
              </div>

              <div className="grid lg:grid-cols-12 gap-6 items-start">
                <div className="lg:col-span-7">
                  <AiSalesAgentConfigView />
                </div>
                <div className="lg:col-span-5 sticky top-6">
                  <AiSalesAgentSimulator />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: CRM & Analytics */}
      {activeTab === 'analytics' && <AutomationAnalyticsDashboard />}

      {/* Tab 4: Live Feed */}
      {activeTab === 'live' && (
        <div className="max-w-4xl mx-auto">
          <AutomationLiveFeed events={events} />
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
