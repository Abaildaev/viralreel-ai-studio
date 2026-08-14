import React, { useState } from 'react';
import {
  AiSalesAgentConfig,
  ProductItem,
  ObjectionScript,
  SalesAgentGoal,
  SalesAgentTone,
} from '../types';
import {
  PlusIcon,
  TrashIcon,
  SparklesIcon,
  CheckCircleIcon,
  ShieldCheckIcon,
  ShoppingBagIcon,
  ChatBubbleBottomCenterTextIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';

interface AiSalesAgentConfigProps {
  config: AiSalesAgentConfig;
  onChange: (newConfig: AiSalesAgentConfig) => void;
}

export const AiSalesAgentConfigView: React.FC<AiSalesAgentConfigProps> = ({
  config,
  onChange,
}) => {
  const [newProduct, setNewProduct] = useState<Partial<ProductItem>>({
    name: '',
    price: '',
    description: '',
    link: '',
  });
  const [showAddProduct, setShowAddProduct] = useState(false);

  const [newObjection, setNewObjection] = useState<Partial<ObjectionScript>>({
    objection: '',
    suggestedAnswer: '',
  });
  const [showAddObjection, setShowAddObjection] = useState(false);

  const [savedNotice, setSavedNotice] = useState(false);

  const handleUpdate = (partial: Partial<AiSalesAgentConfig>) => {
    const updated = { ...config, ...partial };
    onChange(updated);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  const handleAddProduct = () => {
    if (!newProduct.name || !newProduct.price) return;
    const item: ProductItem = {
      id: `p-${Date.now()}`,
      name: newProduct.name,
      price: newProduct.price,
      description: newProduct.description || '',
      features: [],
      link: newProduct.link || '',
    };
    handleUpdate({ products: [...config.products, item] });
    setNewProduct({ name: '', price: '', description: '', link: '' });
    setShowAddProduct(false);
  };

  const handleDeleteProduct = (id: string) => {
    handleUpdate({ products: config.products.filter((p) => p.id !== id) });
  };

  const handleAddObjection = () => {
    if (!newObjection.objection || !newObjection.suggestedAnswer) return;
    const obj: ObjectionScript = {
      id: `o-${Date.now()}`,
      objection: newObjection.objection,
      suggestedAnswer: newObjection.suggestedAnswer,
    };
    handleUpdate({ objections: [...config.objections, obj] });
    setNewObjection({ objection: '', suggestedAnswer: '' });
    setShowAddObjection(false);
  };

  const handleDeleteObjection = (id: string) => {
    handleUpdate({ objections: config.objections.filter((o) => o.id !== id) });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Status & Activity Switch */}
      <div className="p-5 bg-white rounded-2xl border border-gray-200/80 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${config.isEnabled ? 'bg-brand-600/10 text-brand-600' : 'bg-gray-100 text-gray-400'}`}>
            <SparklesIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm text-gray-900">
                ИИ-Менеджер (Интерактивная песочница)
              </h3>
              <span className="text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-md">
                🧪 Песочница / Sandbox
              </span>
              {savedNotice && (
                <span className="text-[11px] text-emerald-600 font-medium animate-in fade-in flex items-center gap-1">
                  <CheckCircleIcon className="w-3.5 h-3.5" /> Сохранено
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Настройка базы знаний, тарифов и тестирование диалогов в реальном времени перед интеграцией с Webhook
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-lg">
            Тестовый режим (DeepSeek)
          </span>
        </div>
      </div>

      {/* Sandbox informational notice */}
      <div className="p-3.5 bg-blue-50/60 border border-blue-100 rounded-xl flex items-start gap-2.5 text-xs text-blue-900">
        <SparklesIcon className="w-4 h-4 text-brand-600 flex-shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <b>Как это работает:</b> Слева настройте продукты, цены и скрипты возражений. Справа в интерактивном симуляторе Direct проверяйте, как нейросеть отрабатывает сомнения клиентов и доводит до продажи.
        </p>
      </div>

      {/* 1. Persona & Tone */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200/80 shadow-xs space-y-4">
        <h4 className="font-semibold text-xs text-gray-900 uppercase tracking-wider flex items-center gap-2">
          <UserCircleIcon className="w-4 h-4 text-brand-600" />
          Личность и роль ИИ-менеджера
        </h4>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Имя ИИ-менеджера
            </label>
            <input
              type="text"
              value={config.agentName}
              onChange={(e) => handleUpdate({ agentName: e.target.value })}
              placeholder="Например: Алина или Алекс"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs outline-none focus:border-brand-600 font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Стиль общения (Tone of Voice)
            </label>
            <select
              value={config.tone}
              onChange={(e) => handleUpdate({ tone: e.target.value as SalesAgentTone })}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs outline-none focus:border-brand-600 font-medium"
            >
              <option value="friendly_expert">✨ Дружелюбный эксперт (на «ты», легко и тепло)</option>
              <option value="energetic_mentor">🚀 Энергичный наставник (мотивация и действия)</option>
              <option value="concise_consultant">📊 Лаконичный консультант (факты и структура)</option>
              <option value="premium_concierge">👑 Премиальный консьерж (вежливо на «вы»)</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">
            Главная цель диалога в Direct
          </label>
          <select
            value={config.goal}
            onChange={(e) => handleUpdate({ goal: e.target.value as SalesAgentGoal })}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs outline-none focus:border-brand-600 font-medium"
          >
            <option value="consultation">📅 Запись на аудит / бесплатную консультацию</option>
            <option value="direct_sale">💳 Прямая продажа курса / тарифа по ссылке</option>
            <option value="collect_contact">📱 Сбор контакта лида (Telegram / Телефон)</option>
            <option value="lead_qualification">🎯 Квалификация лида (ниша, опыт, бюджет)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">
            Целевое действие (куда направлять готового клиента)
          </label>
          <input
            type="text"
            value={config.targetActionPrompt}
            onChange={(e) => handleUpdate({ targetActionPrompt: e.target.value })}
            placeholder="Например: Предложи записаться на разбор в Telegram: @username"
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs outline-none focus:border-brand-600"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">
            Описание бизнеса и позиционирования
          </label>
          <textarea
            rows={2}
            value={config.businessDescription}
            onChange={(e) => handleUpdate({ businessDescription: e.target.value })}
            placeholder="Чем занимается ваш бизнес, для кого продукт и какие результаты даете..."
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs outline-none focus:border-brand-600 resize-none"
          />
        </div>
      </div>

      {/* 2. Products & Pricing Knowledge Base */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-semibold text-xs text-gray-900 uppercase tracking-wider flex items-center gap-2">
              <ShoppingBagIcon className="w-4 h-4 text-brand-600" />
              Продукты, тарифы и цены ({config.products.length})
            </h4>
            <p className="text-xs text-gray-400 mt-0.5">
              ИИ будет отвечать на вопросы о ценах строго на основе этой базы
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowAddProduct(!showAddProduct)}
            className="px-3.5 py-2 bg-brand-600/10 hover:bg-brand-600/20 text-brand-600 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            Добавить тариф
          </button>
        </div>

        {/* Add Product Form */}
        {showAddProduct && (
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3 animate-in fade-in">
            <div className="grid sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={newProduct.name}
                onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                placeholder="Название тарифа (например: Базовый)"
                className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none"
              />
              <input
                type="text"
                value={newProduct.price}
                onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                placeholder="Цена (например: 19 900 ₽ или 4 900 ₽/мес)"
                className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none"
              />
            </div>
            <input
              type="text"
              value={newProduct.description}
              onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
              placeholder="Краткое описание (что входит в тариф)"
              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none"
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowAddProduct(false)}
                className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleAddProduct}
                disabled={!newProduct.name || !newProduct.price}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:bg-gray-200 text-white rounded-xl text-xs font-semibold shadow-xs"
              >
                Сохранить продукт
              </button>
            </div>
          </div>
        )}

        {/* Products List */}
        <div className="space-y-2">
          {config.products.map((p) => (
            <div
              key={p.id}
              className="p-3.5 bg-gray-50/70 rounded-xl border border-gray-200/70 flex items-start justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-xs text-gray-900">{p.name}</span>
                  <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                    {p.price}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{p.description}</p>
              </div>

              <button
                type="button"
                onClick={() => handleDeleteProduct(p.id)}
                className="text-gray-400 hover:text-red-600 p-1 transition-colors"
                title="Удалить"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Objection Handling Scripts */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-semibold text-xs text-gray-900 uppercase tracking-wider flex items-center gap-2">
              <ChatBubbleBottomCenterTextIcon className="w-4 h-4 text-brand-600" />
              Отработка возражений ({config.objections.length})
            </h4>
            <p className="text-xs text-gray-400 mt-0.5">
              Скрипты ответов на частые сомнения клиентов («дорого», «нет времени», «я подумаю»)
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowAddObjection(!showAddObjection)}
            className="px-3.5 py-2 bg-brand-600/10 hover:bg-brand-600/20 text-brand-600 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            Добавить возражение
          </button>
        </div>

        {/* Add Objection Form */}
        {showAddObjection && (
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3 animate-in fade-in">
            <input
              type="text"
              value={newObjection.objection}
              onChange={(e) => setNewObjection({ ...newObjection, objection: e.target.value })}
              placeholder="Возражение (например: «Мне кажется, это не сработает в моей нише»)"
              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none"
            />
            <textarea
              rows={2}
              value={newObjection.suggestedAnswer}
              onChange={(e) => setNewObjection({ ...newObjection, suggestedAnswer: e.target.value })}
              placeholder="Как отвечать (аргумент, кейс или вопрос)"
              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none resize-none"
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowAddObjection(false)}
                className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleAddObjection}
                disabled={!newObjection.objection || !newObjection.suggestedAnswer}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:bg-gray-200 text-white rounded-xl text-xs font-semibold shadow-xs"
              >
                Сохранить скрипт
              </button>
            </div>
          </div>
        )}

        {/* Objections List */}
        <div className="space-y-2">
          {config.objections.map((o) => (
            <div
              key={o.id}
              className="p-3.5 bg-gray-50/70 rounded-xl border border-gray-200/70 flex items-start justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <span className="font-semibold text-xs text-gray-900 block">
                  «{o.objection}»
                </span>
                <p className="text-xs text-gray-600 mt-1 bg-white p-2.5 rounded-lg border border-gray-200/60 leading-relaxed">
                  {o.suggestedAnswer}
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleDeleteObjection(o.id)}
                className="text-gray-400 hover:text-red-600 p-1 transition-colors"
                title="Удалить"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Guardrails & Human Handoff */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200/80 shadow-xs space-y-4">
        <h4 className="font-semibold text-xs text-gray-900 uppercase tracking-wider flex items-center gap-2">
          <ShieldCheckIcon className="w-4 h-4 text-brand-600" />
          Защита и переключение на живого человека (Human Handoff)
        </h4>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">
            Стоп-слова для вызова оператора (через запятую)
          </label>
          <input
            type="text"
            value={config.handoffKeywords.join(', ')}
            onChange={(e) =>
              handleUpdate({
                handoffKeywords: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
              })
            }
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs outline-none focus:border-brand-600 font-medium"
          />
          <p className="text-[11px] text-gray-400 mt-1">
            Если клиент напишет одно из этих слов, бот передаст диалог менеджеру и уведомит вас
          </p>
        </div>
      </div>
    </div>
  );
};

export default AiSalesAgentConfigView;
