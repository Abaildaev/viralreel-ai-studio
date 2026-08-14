import React from 'react';
import { LiveAutomationEvent } from './AutomationLiveFeed';
import LeadAvatar from './LeadAvatar';
import {
  XMarkIcon,
  ArrowTopRightOnSquareIcon,
  PaperAirplaneIcon,
  SparklesIcon,
  DocumentDuplicateIcon,
} from '@heroicons/react/24/outline';

interface LeadDetailModalProps {
  lead: LiveAutomationEvent | null;
  onClose: () => void;
}

export const LeadDetailModal: React.FC<LeadDetailModalProps> = ({ lead, onClose }) => {
  const [copied, setCopied] = React.useState(false);

  if (!lead) return null;

  const username = lead.commenter_username || 'пользователь';
  const isSent = lead.status === 'sent' || lead.dm_status === 'sent';
  const isFailed = lead.status === 'failed' || lead.dm_status === 'failed';

  const copyUsername = () => {
    navigator.clipboard.writeText(`@${username}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden border border-gray-200/80 flex flex-col max-h-[90vh] animate-in fade-in duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Profile */}
        <div className="p-6 border-b border-gray-100 bg-gray-50/50 relative">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3.5">
            <LeadAvatar username={username} size="xl" />

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-base text-gray-900 truncate">
                  @{username}
                </h3>
                <button
                  onClick={copyUsername}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-0.5"
                  title="Скопировать ник"
                >
                  <DocumentDuplicateIcon className="w-4 h-4" />
                </button>
                {copied && <span className="text-[11px] text-emerald-600 font-medium">скопировано</span>}
              </div>

              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${
                  isSent
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                    : isFailed
                    ? 'bg-red-50 text-red-700 border border-red-200/60'
                    : 'bg-gray-100 text-gray-700 border border-gray-200/60'
                }`}>
                  {isSent ? 'Доставлено' : isFailed ? 'Ошибка отправки' : 'В обработке'}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(lead.created_at).toLocaleString('ru-RU', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>
          </div>

          {/* Action Links */}
          <div className="flex gap-2.5 mt-4">
            <a
              href={`https://instagram.com/${username}`}
              target="_blank"
              rel="noreferrer"
              className="flex-1 py-2 px-3 bg-white hover:bg-gray-100 text-gray-700 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-colors border border-gray-200 shadow-xs"
            >
              <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5 text-gray-400" />
              Профиль Instagram
            </a>
            <a
              href={`https://ig.me/m/${username}`}
              target="_blank"
              rel="noreferrer"
              className="flex-1 py-2 px-3 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-colors shadow-xs"
            >
              <PaperAirplaneIcon className="w-3.5 h-3.5 text-gray-300" />
              Открыть Direct
            </a>
          </div>
        </div>

        {/* Content Body: Timeline */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 bg-white">
          {/* Step 1: Incoming Comment */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-600 text-xs font-medium flex items-center justify-center border border-gray-200">
                1
              </span>
              <h4 className="text-xs font-medium text-gray-500">
                {lead.trigger_type === 'comment' ? 'Комментарий под публикацией' : 'Входящее сообщение'}
              </h4>
            </div>

            <div className="bg-gray-50/80 rounded-xl p-3.5 border border-gray-200/70">
              <div className="flex items-start gap-2.5">
                <LeadAvatar username={username} size="sm" />
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-gray-900 text-xs">@{username}</span>
                  <p className="text-xs text-gray-700 mt-0.5">
                    «{lead.incoming_text}»
                  </p>
                  {lead.lead_magnets?.codeword && (
                    <span className="inline-block mt-2 text-[11px] font-medium bg-white text-gray-700 px-2 py-0.5 rounded border border-gray-200">
                      Кодовое слово: <b>{lead.lead_magnets.codeword}</b>
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Step 2: Automated Direct Reply */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-600 text-xs font-medium flex items-center justify-center border border-gray-200">
                2
              </span>
              <h4 className="text-xs font-medium text-gray-500">
                Автоматический ответ в Direct
              </h4>
            </div>

            <div className="bg-gray-50/80 rounded-xl p-3.5 border border-gray-200/70 space-y-2.5">
              <div className="flex flex-col items-end">
                <div className="max-w-[90%] bg-white border border-gray-200 text-gray-800 p-3 rounded-2xl rounded-tr-sm text-xs leading-relaxed shadow-xs">
                  <p className="text-gray-600">
                    Привет! Спасибо за комментарий. Держи обещанный материал:
                  </p>
                  <p className="font-medium text-gray-900 mt-1">
                    «{lead.lead_magnets?.title || 'Лид-магнит'}»
                  </p>
                </div>

                {lead.lead_magnets?.response_url && (
                  <a
                    href={lead.lead_magnets.response_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 hover:bg-gray-800 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    <SparklesIcon className="w-3.5 h-3.5 text-gray-400" />
                    Забрать материал ↗
                  </a>
                )}

                <span className="text-[10px] text-gray-400 mt-1">
                  {new Date(lead.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} • Отправлено
                </span>
              </div>

              {lead.public_reply_status === 'sent' && (
                <div className="pt-2.5 border-t border-gray-200/60 text-[11px] text-gray-500 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Публичный ответ под комментарием оставлен.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeadDetailModal;
