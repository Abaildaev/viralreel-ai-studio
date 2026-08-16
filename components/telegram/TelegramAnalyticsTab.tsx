import React, { useMemo } from 'react';
import { ArrowTrendingUpIcon, ChartBarIcon } from '@heroicons/react/24/outline';
import type { TelegramBot, TelegramFunnelStats } from '../../types';
import type { SubscriberTotals } from '../../services/telegramService';
import { Card, EmptyState, Section, cn } from '../ui';

interface TelegramAnalyticsTabProps {
  bot: TelegramBot;
  stats: TelegramFunnelStats[];
  /** Counted across the whole table, not the page the subscriber list loads. */
  totals: SubscriberTotals;
  /** Sign-up timestamps for the window the chart covers. */
  signupDates: Date[];
}

interface FunnelStep {
  label: string;
  hint: string;
  count: number;
}

export const DAYS_SHOWN = 14;

/** Local midnight, so a day in the chart matches the reader's calendar. */
function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

const TelegramAnalyticsTab: React.FC<TelegramAnalyticsTabProps> = ({
  bot,
  stats,
  totals,
  signupDates,
}) => {
  const steps: FunnelStep[] = [
    { label: 'Нажали «Начать»', hint: 'перешли из Direct и открыли бота', count: totals.started },
    { label: 'Подписались на канал', hint: 'прошли проверку подписки', count: totals.subscribed },
    { label: 'Получили материал', hint: 'лид-магнит доставлен', count: totals.delivered },
    { label: 'Дошли до сервиса', hint: 'отмечено вручную', count: totals.signedUp },
  ];

  const daily = useMemo(() => {
    const buckets = new Map<string, number>();
    const days: { key: string; label: string; count: number }[] = [];

    for (const date of signupDates) {
      const key = dayKey(date);
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }

    for (let offset = DAYS_SHOWN - 1; offset >= 0; offset--) {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - offset);
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      days.push({
        key,
        label: date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
        count: buckets.get(key) ?? 0,
      });
    }

    return days;
  }, [signupDates]);

  const peak = Math.max(...daily.map((day) => day.count), 1);
  const goal = Math.max(bot.subscriber_goal, 1);
  const goalProgress = Math.min(Math.round((totals.active / goal) * 100), 100);

  /* Average of the last seven days, which is enough signal to date the goal
     without pretending to forecast. */
  const recentPace = daily.slice(-7).reduce((sum, day) => sum + day.count, 0) / 7;
  const remaining = Math.max(goal - totals.active, 0);
  const daysToGoal = recentPace > 0 ? Math.ceil(remaining / recentPace) : null;

  if (totals.started === 0) {
    return (
      <EmptyState
        icon={<ChartBarIcon className="h-6 w-6" />}
        title="Данных пока нет"
        description="Аналитика появится, как только первый человек перейдёт из Instagram в бота. Каждый шаг воронки считается отдельно, поэтому будет видно, где именно люди отваливаются."
      />
    );
  }

  return (
    <div className="animate-in fade-in space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Активных подписчиков', value: totals.active, hint: '' },
          { label: 'Из Instagram', value: totals.fromInstagram, hint: '' },
          { label: 'Получили материал', value: totals.delivered, hint: '' },
          {
            label: 'Ушли из канала',
            value: totals.channelLeft,
            // Two different departures, and conflating them would hide the one
            // that costs money: a channel leaver still receives broadcasts.
            hint: totals.blocked > 0 ? `+ ${totals.blocked} заблокировали бота` : '',
          },
        ].map((tile) => (
          <Card key={tile.label} className="p-4">
            <p className="text-2xs uppercase tracking-wide text-gray-500">{tile.label}</p>
            <p className="tabular mt-1.5 text-2xl font-semibold text-gray-900">{tile.value}</p>
            {tile.hint && <p className="mt-0.5 text-2xs text-gray-500">{tile.hint}</p>}
          </Card>
        ))}
      </div>

      <Section
        icon={<ArrowTrendingUpIcon className="h-5 w-5" />}
        title={`Цель: ${goal.toLocaleString('ru-RU')} подписчиков`}
        hint={
          daysToGoal === null
            ? 'За последнюю неделю новых подписчиков не было — прогноз недоступен.'
            : remaining === 0
            ? 'Цель достигнута.'
            : `При текущем темпе (${recentPace.toFixed(1)} в день) осталось около ${daysToGoal} дней.`
        }
      >
        <div className="mb-2 flex items-baseline justify-between">
          <span className="tabular text-lg font-semibold text-gray-900">
            {totals.active.toLocaleString('ru-RU')}
          </span>
          <span className="tabular text-xs text-gray-500">{goalProgress}%</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-brand-600 transition-all duration-700"
            style={{ width: `${goalProgress}%` }}
          />
        </div>
      </Section>

      <Section
        title="Воронка по шагам"
        hint="Процент считается от предыдущего шага — так видно, где именно теряются люди."
      >
        <div className="space-y-3">
          {steps.map((step, index) => {
            const previous = index === 0 ? step.count : steps[index - 1].count;
            const share = totals.started > 0 ? (step.count / totals.started) * 100 : 0;
            const conversion = previous > 0 ? Math.round((step.count / previous) * 100) : 0;
            const lost = previous - step.count;

            return (
              <div key={step.label}>
                <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3">
                  <div className="min-w-0">
                    <span className="text-xs font-medium text-gray-900">{step.label}</span>
                    <span className="ml-2 text-2xs text-gray-500">{step.hint}</span>
                  </div>
                  <div className="flex items-baseline gap-2.5">
                    <span className="tabular text-sm font-semibold text-gray-900">
                      {step.count}
                    </span>
                    {index > 0 && (
                      <span
                        className={cn(
                          'tabular text-2xs font-medium',
                          conversion >= 60 ? 'text-green-700' : conversion >= 30 ? 'text-amber-600' : 'text-red-600',
                        )}
                      >
                        {conversion}%
                      </span>
                    )}
                  </div>
                </div>

                <div className="h-7 w-full overflow-hidden rounded-lg bg-gray-100">
                  <div
                    className="flex h-full items-center rounded-lg bg-brand-600 transition-all duration-500"
                    style={{ width: `${Math.max(share, step.count > 0 ? 4 : 0)}%` }}
                  />
                </div>

                {index > 0 && lost > 0 && (
                  <p className="mt-1 text-2xs text-gray-500">
                    Не дошли: <span className="tabular font-medium text-gray-700">{lost}</span>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Новые подписчики" hint={`За последние ${DAYS_SHOWN} дней`}>
        {/* Each column is `h-full` on purpose: a percentage height resolves
            against the parent's height, and an auto-height parent collapses
            every bar to nothing. */}
        <div className="flex h-32 items-end gap-1.5">
          {daily.map((day) => (
            <div
              key={day.key}
              className="group relative flex h-full min-w-0 flex-1 flex-col justify-end"
            >
              <span className="tabular pointer-events-none absolute inset-x-0 top-0 text-center text-2xs text-gray-400 opacity-0 transition-opacity group-hover:opacity-100">
                {day.count}
              </span>
              <div
                className="w-full rounded-t bg-brand-600/85 transition-all group-hover:bg-brand-600"
                style={{ height: `${Math.max((day.count / peak) * 100, day.count > 0 ? 6 : 2)}%` }}
                title={`${day.label}: ${day.count}`}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-2xs text-gray-400">
          <span>{daily[0]?.label}</span>
          <span>{daily[daily.length - 1]?.label}</span>
        </div>
      </Section>

      {stats.length > 0 && (
        <Section title="По воронкам" hint="Какое кодовое слово приносит подписчиков">
          <div className="scroll-x">
            <table className="w-full min-w-[36rem] text-left">
              <thead className="border-b border-gray-200">
                <tr className="text-2xs uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-4 font-medium">Воронка</th>
                  <th className="py-2 pr-4 font-medium">Пришли</th>
                  <th className="py-2 pr-4 font-medium">Подписались</th>
                  <th className="py-2 pr-4 font-medium">Получили</th>
                  <th className="py-2 font-medium">Из Instagram</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stats.map((row) => (
                  <tr key={row.funnel_id}>
                    <td className="py-2.5 pr-4">
                      <span className="text-xs font-medium text-gray-900">{row.name || row.slug}</span>
                    </td>
                    <td className="tabular py-2.5 pr-4 text-xs text-gray-700">{row.started_count}</td>
                    <td className="tabular py-2.5 pr-4 text-xs text-gray-700">{row.subscribed_count}</td>
                    <td className="tabular py-2.5 pr-4 text-xs text-gray-700">{row.delivered_count}</td>
                    <td className="tabular py-2.5 text-xs text-gray-700">{row.from_instagram_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
};

export default TelegramAnalyticsTab;
