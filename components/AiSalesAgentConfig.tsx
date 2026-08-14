import React, { useState } from 'react';
import {
  AiSalesAgentConfig,
  ProductItem,
  ObjectionScript,
  SalesAgentGoal,
  SalesAgentTone,
  InstagramAccount,
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
  InformationCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  BoltIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import AppSelect from './ui/AppSelect';

interface AiSalesAgentConfigProps {
  config: AiSalesAgentConfig;
  onChange: (newConfig: AiSalesAgentConfig) => void;
  accounts?: InstagramAccount[];
  selectedAccountId?: string | null;
  onAccountChange?: (accountId: string | null) => void;
  onSave?: () => Promise<void>;
  saving?: boolean;
}

export const AiSalesAgentConfigView: React.FC<AiSalesAgentConfigProps> = ({
  config,
  onChange,
  accounts = [],
  selectedAccountId,
  onAccountChange,
  onSave,
  saving = false,
}) => {
  const [showHowItWorks, setShowHowItWorks] = useState(true);

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

  const activeAccount = accounts.find((a) => a.id === selectedAccountId);

  return (
    <div className="space-y-6">
      {/* 1. Master Status Control Panel */}
      <div
        className={`p-5 rounded-3xl border transition-all shadow-xs ${
          config.isEnabled
            ? 'bg-gradient-to-r from-emerald-50/90 to-teal-50/70 border-emerald-200'
            : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold transition-all ${
                config.isEnabled
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                  : 'bg-slate-100 text-slate-400'
              }`}
            >
              {config.isEnabled ? (
                <BoltIcon className="w-6 h-6 animate-pulse" />
              ) : (
                <SparklesIcon className="w-6 h-6" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                  {config.isEnabled
                    ? '🟢 ИИ-Продавец АКТИВЕН в Instagram Direct'
                    : '⚪ ИИ-Продавец ВЫКЛЮЧЕН (На паузе)'}
                </h3>
                {savedNotice && (
                  <span className="text-[11px] text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded-full animate-in fade-in flex items-center gap-1">
                    <CheckCircleIcon className="w-3.5 h-3.5" /> Сохранено
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 mt-1 max-w-xl leading-relaxed">
                {config.isEnabled
                  ? 'Нейросеть в реальном времени отвечает на входящие сообщения в Direct, консультирует по вашим товарам и ведет клиентов к покупке.'
                  : 'Автоответы в Direct остановлены. Вы можете обучать агента в полях ниже и тестировать диалоги в симуляторе справа.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-white/80 p-2 rounded-2xl border border-slate-200/80 shadow-xs">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.isEnabled}
                onChange={(e) => handleUpdate({ isEnabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-12 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600" />
            </label>
            <span
              className={`text-xs font-bold ${
                config.isEnabled ? 'text-emerald-700' : 'text-slate-500'
              }`}
            >
              {config.isEnabled ? 'Включен 24/7' : 'Выключен'}
            </span>
          </div>
        </div>

        {/* Account selector and Save Row */}
        <div className="mt-4 pt-3.5 border-t border-slate-200/70 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-500 font-medium">Привязан к аккаунту:</span>
            {accounts.length > 0 ? (
              <AppSelect
                value={selectedAccountId || ''}
                onChange={(e) => onAccountChange?.(e.target.value || null)}
                className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 font-bold text-slate-800 outline-none focus:border-[#1E60FF]"
              >
                <option value="">Все подключенные аккаунты (Глобальный)</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    @{a.username}
                  </option>
                ))}
              </AppSelect>
            ) : (
              <span className="font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg">
                Все аккаунты
              </span>
            )}

            {activeAccount?.webhook_subscribed_at ? (
              <span className="text-emerald-700 bg-emerald-100/90 border border-emerald-200 px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1">
                ✓ Direct Webhook активен
              </span>
            ) : (
              <span className="text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg font-medium">
                Готов к приему сообщений
              </span>
            )}
          </div>

          {onSave && (
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="px-5 py-2 bg-[#1E60FF] hover:bg-[#1551E5] disabled:bg-slate-300 text-white font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 text-xs active:scale-95 ml-auto"
            >
              {saving ? (
                <>
                  <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                  Сохранение...
                </>
              ) : (
                '💾 Сохранить агента в облако'
              )}
            </button>
          )}
        </div>
      </div>

      {/* 2. Visual Explainer: "Как работает ИИ-Продавец" */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-xs">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setShowHowItWorks(!showHowItWorks)}
        >
          <div className="flex items-center gap-2">
            <InformationCircleIcon className="w-5 h-5 text-[#1E60FF]" />
            <h4 className="font-bold text-xs sm:text-sm text-slate-900">
              Схема работы: Как ИИ-продавец общается с вашими клиентами
            </h4>
          </div>
          <button type="button" className="text-slate-400 hover:text-slate-600">
            {showHowItWorks ? (
              <ChevronUpIcon className="w-4 h-4" />
            ) : (
              <ChevronDownIcon className="w-4 h-4" />
            )}
          </button>
        </div>

        {showHowItWorks && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-100 animate-in fade-in">
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/60 space-y-1.5">
              <div className="w-6 h-6 rounded-lg bg-blue-100 text-[#1E60FF] flex items-center justify-center font-bold text-xs">
                1
              </div>
              <h5 className="font-bold text-xs text-slate-900">Входящий лид</h5>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Клиент пишет в Direct сам или реагирует на высланный лид-магнит.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/60 space-y-1.5">
              <div className="w-6 h-6 rounded-lg bg-blue-100 text-[#1E60FF] flex items-center justify-center font-bold text-xs">
                2
              </div>
              <h5 className="font-bold text-xs text-slate-900">Анализ нейросетью</h5>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                ИИ мгновенно понимает контекст и сверяется с вашей Базой знаний (цены, услуги).
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/60 space-y-1.5">
              <div className="w-6 h-6 rounded-lg bg-blue-100 text-[#1E60FF] flex items-center justify-center font-bold text-xs">
                3
              </div>
              <h5 className="font-bold text-xs text-slate-900">Отработка возражений</h5>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Снимает страхи («дорого», «нет времени») и мягко ведет к целевому действию.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/60 space-y-1.5">
              <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                4
              </div>
              <h5 className="font-bold text-xs text-slate-900">Цель & Передача</h5>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Дает ссылку на оплату/запись. Если просят человека — сразу зовет вас.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 3. Persona & Tone */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
        <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider flex items-center gap-2">
          <UserCircleIcon className="w-4 h-4 text-[#1E60FF]" />
          1. Личность и манера общения агента
        </h4>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Имя ИИ-менеджера
            </label>
            <input
              type="text"
              value={config.agentName}
              onChange={(e) => handleUpdate({ agentName: e.target.value })}
              placeholder="Например: Алина или Алекс"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs outline-none focus:border-[#1E60FF] font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Тон коммуникации
            </label>
            <AppSelect
              value={config.tone}
              onChange={(e) => handleUpdate({ tone: e.target.value as SalesAgentTone })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs outline-none focus:border-[#1E60FF] font-medium"
            >
              <option value="friendly_expert">Дружелюбный эксперт (на «ты», легко и тепло)</option>
              <option value="energetic_mentor">Энергичный наставник (драйв, акцент на результат)</option>
              <option value="concise_consultant">Лаконичный консультант (строго по делу и фактам)</option>
              <option value="premium_concierge">Премиум консьерж (на «вы», деликатно и с заботой)</option>
            </AppSelect>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Главная цель диалога (к чему агент подводит клиента)
          </label>
          <AppSelect
            value={config.goal}
            onChange={(e) => handleUpdate({ goal: e.target.value as SalesAgentGoal })}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs outline-none focus:border-[#1E60FF] font-medium"
          >
            <option value="consultation">Запись на бесплатную консультацию / аудит</option>
            <option value="direct_sale">Прямая продажа (отправка ссылки на оплату)</option>
            <option value="collect_contact">Сбор контактов (Telegram, телефон) для связи</option>
            <option value="lead_qualification">Квалификация лида (задать 2-3 ключевых вопроса)</option>
          </AppSelect>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            О вашем бизнесе и предложении (чем подробнее, тем точнее ответы)
          </label>
          <textarea
            rows={3}
            value={config.businessDescription}
            onChange={(e) => handleUpdate({ businessDescription: e.target.value })}
            placeholder="Например: Агентство по созданию контента и автоворонок в Instagram. Помогаем онлайн-школам и экспертам привлекать клиентов через вирусные Reels."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs outline-none focus:border-[#1E60FF] resize-none leading-relaxed"
          />
        </div>
      </div>

      {/* 4. Product Catalog / Offers */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <ShoppingBagIcon className="w-4 h-4 text-[#1E60FF]" />
            2. Каталог продуктов, тарифов и цен
          </h4>
          <button
            type="button"
            onClick={() => setShowAddProduct(true)}
            className="text-xs text-[#1E60FF] font-bold hover:underline flex items-center gap-1"
          >
            <PlusIcon className="w-3.5 h-3.5" /> Добавить продукт
          </button>
        </div>

        {config.products.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-2">
            Каталог пуст. Добавьте хотя бы один продукт или услугу, чтобы агент знал, что предлагать клиентам.
          </p>
        ) : (
          <div className="space-y-3">
            {config.products.map((prod) => (
              <div
                key={prod.id}
                className="p-4 bg-slate-50 rounded-2xl border border-slate-200/70 flex items-start justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-xs text-slate-900">{prod.name}</span>
                    <span className="text-[11px] font-bold text-[#1E60FF] bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md">
                      {prod.price}
                    </span>
                  </div>
                  {prod.description && (
                    <p className="text-[11px] text-slate-600 leading-relaxed">{prod.description}</p>
                  )}
                  {prod.link && (
                    <a
                      href={prod.link}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-blue-600 hover:underline inline-block truncate max-w-sm"
                    >
                      {prod.link}
                    </a>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteProduct(prod.id)}
                  className="text-slate-400 hover:text-red-500 p-1 rounded-lg"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {showAddProduct && (
          <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl space-y-3 animate-in fade-in">
            <h5 className="font-bold text-xs text-slate-900">Новый продукт / тариф</h5>
            <div className="grid sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={newProduct.name}
                onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                placeholder="Название (например: Тариф «Премиум»)"
                className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-[#1E60FF]"
              />
              <input
                type="text"
                value={newProduct.price}
                onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                placeholder="Цена (например: 25 000 ₽ или От 500$)"
                className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-[#1E60FF]"
              />
            </div>
            <textarea
              rows={2}
              value={newProduct.description}
              onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
              placeholder="Что входит в тариф / ключевая польза"
              className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs outline-none focus:border-[#1E60FF] resize-none"
            />
            <input
              type="url"
              value={newProduct.link}
              onChange={(e) => setNewProduct({ ...newProduct, link: e.target.value })}
              placeholder="Ссылка на оплату или лендинг (https://...)"
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-[#1E60FF]"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAddProduct(false)}
                className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-800"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleAddProduct}
                className="px-4 py-1.5 bg-[#1E60FF] text-white font-bold text-xs rounded-xl shadow-xs"
              >
                Добавить
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 5. Objection Scripts */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <ChatBubbleBottomCenterTextIcon className="w-4 h-4 text-[#1E60FF]" />
            3. Отработка возражений и сомнений
          </h4>
          <button
            type="button"
            onClick={() => setShowAddObjection(true)}
            className="text-xs text-[#1E60FF] font-bold hover:underline flex items-center gap-1"
          >
            <PlusIcon className="w-3.5 h-3.5" /> Добавить скрипт
          </button>
        </div>

        <div className="space-y-3">
          {config.objections.map((obj) => (
            <div
              key={obj.id}
              className="p-4 bg-slate-50 rounded-2xl border border-slate-200/70 space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-xs text-slate-900">
                  ⚠️ Если клиент говорит: «{obj.objection}»
                </span>
                <button
                  type="button"
                  onClick={() => handleDeleteObjection(obj.id)}
                  className="text-slate-400 hover:text-red-500 p-1 rounded-lg"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[11px] text-slate-600 bg-white p-2.5 rounded-xl border border-slate-100 leading-relaxed">
                💡 <b>Ответ агента:</b> {obj.suggestedAnswer}
              </p>
            </div>
          ))}
        </div>

        {showAddObjection && (
          <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl space-y-3 animate-in fade-in">
            <h5 className="font-bold text-xs text-slate-900">Новый скрипт отработки возражения</h5>
            <input
              type="text"
              value={newObjection.objection}
              onChange={(e) => setNewObjection({ ...newObjection, objection: e.target.value })}
              placeholder="Возражение (например: «Мне дорого» или «Я подумаю»)"
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-[#1E60FF]"
            />
            <textarea
              rows={2}
              value={newObjection.suggestedAnswer}
              onChange={(e) =>
                setNewObjection({ ...newObjection, suggestedAnswer: e.target.value })
              }
              placeholder="Как отвечать (главный аргумент / вопрос / предложение рассрочки)"
              className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs outline-none focus:border-[#1E60FF] resize-none"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAddObjection(false)}
                className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-800"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleAddObjection}
                className="px-4 py-1.5 bg-[#1E60FF] text-white font-bold text-xs rounded-xl shadow-xs"
              >
                Сохранить скрипт
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 6. Human Handoff / Stop Words */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
        <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider flex items-center gap-2">
          <ShieldCheckIcon className="w-4 h-4 text-[#1E60FF]" />
          4. Безопасность и передача живому человеку
        </h4>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Стоп-слова для вызова оператора (через запятую)
          </label>
          <input
            type="text"
            value={config.handoffKeywords?.join(', ')}
            onChange={(e) =>
              handleUpdate({
                handoffKeywords: e.target.value
                  .split(',')
                  .map((w) => w.trim())
                  .filter(Boolean),
              })
            }
            placeholder="человек, менеджер, оператор, позови человека"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs outline-none focus:border-[#1E60FF] font-mono"
          />
          <p className="text-[11px] text-slate-400 mt-1">
            При обнаружении этих слов ИИ немедленно прекратит автоответы и передаст диалог вам в Instagram Direct.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AiSalesAgentConfigView;
