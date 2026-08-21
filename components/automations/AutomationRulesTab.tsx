import React from 'react';
import { LeadMagnet, LeadMagnetStats, InstagramAccount } from '../../types';
import {
  BoltIcon,
  PaperAirplaneIcon,
  ChatBubbleLeftRightIcon,
  PencilIcon,
  TrashIcon,
  PlusIcon,
  ClockIcon,
  ArrowRightIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';

interface AutomationRulesTabProps {
  rules: LeadMagnet[];
  stats: LeadMagnetStats[];
  accounts: InstagramAccount[];
  loading: boolean;
  onEdit: (rule: LeadMagnet) => void;
  onDelete: (rule: LeadMagnet) => void;
  onToggleActive: (rule: LeadMagnet) => void;
  onCreateNew: () => void;
}

export const AutomationRulesTab: React.FC<AutomationRulesTabProps> = ({
  rules,
  stats,
  accounts,
  loading,
  onEdit,
  onDelete,
  onToggleActive,
  onCreateNew,
}) => {
  const statsMap = React.useMemo(() => {
    const map = new Map<string, LeadMagnetStats>();
    stats.forEach((s) => map.set(s.lead_magnet_id, s));
    return map;
  }, [stats]);

  const activeRules = rules.filter((rule) => rule.is_active).length;
  const funnelSteps = [
    {
      title: 'Комментарий или Direct',
      description: 'Пользователь пишет под Reels или в личные сообщения',
      icon: <ChatBubbleLeftRightIcon className="h-5 w-5" />,
    },
    {
      title: 'Кодовое слово',
      description: 'Система находит одно из слов воронки',
      icon: <BoltIcon className="h-5 w-5" />,
    },
    {
      title: 'Ответ в Direct',
      description: 'Публичный ответ и личное сообщение отправляются автоматически',
      icon: <PaperAirplaneIcon className="h-5 w-5" />,
    },
    {
      title: 'Материал',
      description: 'Лид получает ссылку или прикреплённый лид-магнит',
      icon: <CheckCircleIcon className="h-5 w-5" />,
    },
    {
      title: 'Лид в CRM',
      description: 'Контакт сохраняется и появляется в базе лидов',
      icon: <CheckCircleIcon className="h-5 w-5" />,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-brand-100 bg-brand-50/40 p-5 shadow-xs">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Воронка Comment-to-DM</h2>
            <p className="mt-1 text-sm text-gray-600">
              Один понятный путь от комментария до сохранённого лида.
            </p>
          </div>
          <span className="text-xs font-semibold text-brand-700">
            {activeRules} активн. {activeRules === 1 ? 'воронка' : 'воронки'}
          </span>
        </div>

        <div className="mt-5 flex flex-col gap-2 md:flex-row md:items-stretch">
          {funnelSteps.map((step, index) => (
            <React.Fragment key={step.title}>
              <div className="min-w-0 flex-1 rounded-xl border border-white/90 bg-white/80 p-3">
                <div className="flex items-center gap-2 text-brand-700">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-100">
                    {step.icon}
                  </span>
                  <span className="text-xs font-bold text-gray-900">{step.title}</span>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-gray-500">{step.description}</p>
              </div>
              {index < funnelSteps.length - 1 && (
                <ArrowRightIcon className="mx-auto h-4 w-4 shrink-0 self-center text-brand-300 md:mt-8" />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Rules Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900">Ваши воронки</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Для каждой воронки задаются кодовые слова, ответ и материал
          </p>
        </div>

        <button
          type="button"
          onClick={onCreateNew}
          className="px-3.5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all active:scale-95"
        >
          <PlusIcon className="w-4 h-4" />
          Создать воронку
        </button>
      </div>

      {/* Rules Grid or Empty State */}
      {loading ? (
        <div className="p-12 text-center text-xs text-gray-400">Загрузка сценариев...</div>
      ) : rules.length === 0 ? (
        <div className="p-12 bg-white rounded-2xl border border-gray-200/80 text-center space-y-3 shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-brand-600 flex items-center justify-center mx-auto">
            <BoltIcon className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-sm text-gray-900">Пока нет воронок</h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            Создайте первую воронку: пользователь пишет кодовое слово, а система автоматически отвечает и отправляет материал в Direct.
          </p>
          <button
            type="button"
            onClick={onCreateNew}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold shadow-xs"
          >
            Создать воронку
          </button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {rules.map((rule) => {
            const ruleStat = statsMap.get(rule.id);
            const account = accounts.find((a) => a.id === rule.instagram_account_id);
            const keywords = rule.keywords?.length ? rule.keywords : [rule.codeword];

            return (
              <div
                key={rule.id}
                className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-xs flex flex-col justify-between gap-4 transition-all hover:border-gray-300"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-sm text-gray-900 truncate">
                          {rule.title}
                        </h3>
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                            rule.is_active
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200/70'
                              : 'bg-gray-100 text-gray-500 border-gray-200'
                          }`}
                        >
                          {rule.is_active ? 'Активен' : 'Пауза'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">
                        {account ? `@${account.username}` : 'Все аккаунты'}
                      </p>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onEdit(rule)}
                        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Редактировать"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(rule)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Удалить"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Keywords Chips */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] text-gray-400">Ключевые слова:</span>
                    {keywords.map((kw, i) => (
                      <span
                        key={i}
                        className="text-[11px] font-mono font-semibold bg-blue-50 text-brand-600 border border-blue-100 px-2 py-0.5 rounded-md"
                      >
                        {kw}
                      </span>
                    ))}
                  </div>

                  {/* Reply Message Preview */}
                  <div className="bg-gray-50/80 p-3 rounded-xl border border-gray-100 text-xs text-gray-700 line-clamp-2 leading-relaxed">
                    «{rule.reply_text}»
                  </div>
                </div>

                {/* Card Footer with Stats & Toggle */}
                <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <PaperAirplaneIcon className="w-3.5 h-3.5 text-gray-400" />
                      <b>{ruleStat?.sent_count || 0}</b> отправок
                    </span>
                    {rule.reply_delay_seconds > 0 && (
                      <span className="flex items-center gap-1 text-gray-400 text-[11px]">
                        <ClockIcon className="w-3.5 h-3.5" />
                        {rule.reply_delay_seconds}с задержка
                      </span>
                    )}
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rule.is_active}
                      onChange={() => onToggleActive(rule)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600" />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AutomationRulesTab;
