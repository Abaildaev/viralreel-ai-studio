import React from 'react';
import { InstagramAccount } from '../types';
import {
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ClockIcon,
  KeyIcon,
} from '@heroicons/react/24/outline';

interface TokenHealthCardProps {
  account: InstagramAccount;
  onRefreshToken: (account: InstagramAccount) => void;
  onVerifyToken?: (account: InstagramAccount) => void;
  isVerifying?: boolean;
}

export const TokenHealthCard: React.FC<TokenHealthCardProps> = ({
  account,
  onRefreshToken,
  onVerifyToken,
  isVerifying = false,
}) => {
  // Graph API Long-lived access tokens expire in 60 days
  const TOTAL_TOKEN_DAYS = 60;
  const tokenDate = new Date(account.updated_at || account.created_at || Date.now());
  const now = new Date();
  const elapsedMs = now.getTime() - tokenDate.getTime();
  const elapsedDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
  const remainingDays = Math.max(0, TOTAL_TOKEN_DAYS - elapsedDays);
  const healthPercent = Math.max(0, Math.min(100, Math.round((remainingDays / TOTAL_TOKEN_DAYS) * 100)));

  const isCritical = remainingDays <= 7;
  const isWarning = remainingDays <= 15 && !isCritical;
  const isHealthy = remainingDays > 15;

  return (
    <div
      className={`rounded-2xl p-4 border transition-all ${
        isCritical
          ? 'bg-red-50/70 border-red-200'
          : isWarning
          ? 'bg-amber-50/70 border-amber-200'
          : 'bg-gradient-to-r from-emerald-50/80 to-teal-50/50 border-emerald-200/80'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
              isCritical
                ? 'bg-red-100 text-red-600'
                : isWarning
                ? 'bg-amber-100 text-amber-600'
                : 'bg-emerald-100 text-emerald-600'
            }`}
          >
            {isCritical ? (
              <ExclamationTriangleIcon className="w-5 h-5 animate-pulse" />
            ) : isWarning ? (
              <ClockIcon className="w-5 h-5" />
            ) : (
              <ShieldCheckIcon className="w-5 h-5" />
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-900">
                Здоровье токена Instagram (Token Health)
              </h4>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  isCritical
                    ? 'bg-red-200 text-red-800'
                    : isWarning
                    ? 'bg-amber-200 text-amber-800'
                    : 'bg-emerald-200 text-emerald-800'
                }`}
              >
                {isCritical ? '⚠️ Требует продления' : isWarning ? '⏳ Скоро истекает' : '🟢 Активен'}
              </span>
            </div>
            <p className="text-xs text-gray-600 mt-0.5">
              Осталось <b className="font-bold text-gray-900">{remainingDays} дн.</b> из {TOTAL_TOKEN_DAYS} дней (обновлен {tokenDate.toLocaleDateString('ru-RU')})
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {onVerifyToken && (
            <button
              type="button"
              onClick={() => onVerifyToken(account)}
              disabled={isVerifying}
              className="px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
            >
              <ArrowPathIcon className={`w-3.5 h-3.5 ${isVerifying ? 'animate-spin' : ''}`} />
              Проверить
            </button>
          )}

          <button
            type="button"
            onClick={() => onRefreshToken(account)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm active:scale-95 text-white ${
              isCritical
                ? 'bg-red-600 hover:bg-red-500 shadow-red-500/30 animate-bounce'
                : isWarning
                ? 'bg-amber-600 hover:bg-amber-500'
                : 'bg-teal-600 hover:bg-teal-500'
            }`}
          >
            <KeyIcon className="w-3.5 h-3.5" />
            {isCritical ? 'Продлить токен сейчас' : 'Обновить токен в 1 клик'}
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-black/10 rounded-full h-2 overflow-hidden relative">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isCritical
              ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
              : isWarning
              ? 'bg-amber-500'
              : 'bg-gradient-to-r from-teal-500 to-emerald-500'
          }`}
          style={{ width: `${healthPercent}%` }}
        />
      </div>

      {isCritical && (
        <p className="text-[11px] font-medium text-red-700 mt-2 flex items-center gap-1">
          <ExclamationTriangleIcon className="w-3.5 h-3.5 flex-shrink-0" />
          Внимание: осталось меньше 7 дней! Автоматические рассылки лид-магнитов и публикация постов могут остановиться, если не обновить токен.
        </p>
      )}
    </div>
  );
};

export default TokenHealthCard;
