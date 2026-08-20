import React from 'react';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ClockIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { Button, Field, Input, Select, Switch, Textarea, cn } from '../ui';
import AttachmentPicker from '../AttachmentPicker';
import { NO_ATTACHMENT, type MessageAttachment } from '../../types';
import {
  cumulativeSchedule,
  formatDelay,
  type FunnelStep,
} from '../../supabase/functions/_shared/funnel-sequence';

/** A step that may not exist in the database yet. */
export type StepDraft =
  & Omit<FunnelStep, 'id'>
  & MessageAttachment
  & { id: string | null; key: string };

/*
  Presets rather than a free-form number field. A course author thinks in
  "завтра" and "через три дня", not in minutes, and the arithmetic is where
  mistakes like a 43200-minute gap come from. The custom row stays available
  for the cases the presets miss.
*/
const DELAY_PRESETS: { label: string; minutes: number }[] = [
  { label: 'Сразу', minutes: 0 },
  { label: 'Через 15 мин', minutes: 15 },
  { label: 'Через час', minutes: 60 },
  { label: 'Через 3 часа', minutes: 180 },
  { label: 'Через день', minutes: 1440 },
  { label: 'Через 2 дня', minutes: 2880 },
  { label: 'Через 3 дня', minutes: 4320 },
  { label: 'Через неделю', minutes: 10080 },
];

export const newStep = (position: number, delayMinutes: number): StepDraft => ({
  id: null,
  key: `new-${Math.random().toString(36).slice(2)}`,
  position,
  title: `Шаг ${position}`,
  body: '',
  button_text: '',
  button_url: '',
  delay_minutes: delayMinutes,
  is_active: true,
  ...NO_ATTACHMENT,
});

/* Telegram's caption ceiling. Past it the message is split in two, which the
   author should learn while writing rather than from the preview. */
const CAPTION_LIMIT = 1024;

interface FunnelStepsEditorProps {
  steps: StepDraft[];
  onChange: (steps: StepDraft[]) => void;
}

/**
 * The sequence a funnel sends after the subscription gate.
 *
 * Ordering is by explicit buttons rather than drag and drop: a course is edited
 * rarely and read carefully, and a drag target that is one pixel off silently
 * reorders someone's lessons.
 */
const FunnelStepsEditor: React.FC<FunnelStepsEditorProps> = ({ steps, onChange }) => {
  const update = (key: string, patch: Partial<StepDraft>) =>
    onChange(steps.map((step) => (step.key === key ? { ...step, ...patch } : step)));

  /* Positions are renumbered on every structural change, so they always match
     what the editor shows and the sender reads them in the same order. */
  const renumber = (list: StepDraft[]) =>
    list.map((step, index) => ({ ...step, position: index + 1 }));

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;

    const next = steps.slice();
    [next[index], next[target]] = [next[target], next[index]];
    onChange(renumber(next));
  };

  const remove = (key: string) =>
    onChange(renumber(steps.filter((step) => step.key !== key)));

  const add = () =>
    onChange(renumber([
      ...steps,
      // A new step defaults to a day's wait, which is what a course usually
      // wants and what makes the sequence obviously a sequence.
      newStep(steps.length + 1, steps.length === 0 ? 0 : 1440),
    ]));

  const schedule = cumulativeSchedule(
    steps.map((step) => ({ ...step, id: step.id ?? step.key })),
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">Что бот отправит</p>
          <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
            Один шаг — одно сообщение. Ставьте задержки, и получится курс по урокам.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={add}
          icon={<PlusIcon className="h-3.5 w-3.5" />}
        >
          Добавить шаг
        </Button>
      </div>

      {steps.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center">
          <p className="text-xs text-gray-500">
            Пока ни одного шага — бот поздоровается и замолчит.
          </p>
          <Button variant="primary" size="sm" onClick={add} className="mt-3">
            Добавить первый шаг
          </Button>
        </div>
      )}

      {steps.map((step, index) => {
        const isCustomDelay = !DELAY_PRESETS.some(
          (preset) => preset.minutes === step.delay_minutes,
        );
        const landsAt = schedule.find((entry) => entry.step.id === (step.id ?? step.key))?.at;

        return (
          <div
            key={step.key}
            className={cn(
              'rounded-xl border p-4',
              step.is_active ? 'border-gray-200' : 'border-gray-200 bg-gray-50/70',
            )}
          >
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gray-900 text-2xs font-semibold text-white">
                {index + 1}
              </span>

              <input
                value={step.title}
                onChange={(event) => update(step.key, { title: event.target.value })}
                placeholder={`Шаг ${index + 1}`}
                aria-label={`Название шага ${index + 1}`}
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-semibold text-gray-900 outline-none placeholder:font-normal placeholder:text-gray-400"
              />

              <div className="flex flex-shrink-0 items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  title="Выше"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  icon={<ArrowUpIcon className="h-3.5 w-3.5" />}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  title="Ниже"
                  disabled={index === steps.length - 1}
                  onClick={() => move(index, 1)}
                  icon={<ArrowDownIcon className="h-3.5 w-3.5" />}
                />
                <Button
                  variant="danger"
                  size="sm"
                  iconOnly
                  title="Удалить шаг"
                  onClick={() => remove(step.key)}
                  icon={<TrashIcon className="h-3.5 w-3.5" />}
                />
              </div>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2">
              <ClockIcon className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
              <Select
                value={isCustomDelay ? 'custom' : String(step.delay_minutes)}
                onChange={(event) => {
                  if (event.target.value === 'custom') return;
                  update(step.key, { delay_minutes: Number(event.target.value) });
                }}
                aria-label={`Задержка перед шагом ${index + 1}`}
                className="w-auto min-w-[10rem]"
              >
                {DELAY_PRESETS.map((preset) => (
                  <option key={preset.minutes} value={preset.minutes}>{preset.label}</option>
                ))}
                {isCustomDelay && (
                  <option value="custom">{formatDelay(step.delay_minutes)}</option>
                )}
              </Select>

              <Input
                type="number"
                min={0}
                max={525600}
                value={step.delay_minutes}
                onChange={(event) =>
                  update(step.key, { delay_minutes: Math.max(0, Number(event.target.value) || 0) })}
                aria-label={`Задержка в минутах перед шагом ${index + 1}`}
                className="w-24"
              />
              <span className="text-2xs text-gray-500">мин</span>

              {landsAt && index > 0 && (
                <span className="text-2xs text-gray-400">
                  придёт {landsAt.toLocaleString('ru-RU', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              )}
            </div>

            <div className="space-y-3">
              <Field label="Текст сообщения">
                {({ id }) => (
                  <Textarea
                    id={id}
                    rows={3}
                    value={step.body}
                    placeholder="Что бот напишет на этом шаге"
                    onChange={(event) => update(step.key, { body: event.target.value })}
                  />
                )}
              </Field>

              <Field label="Вложение">
                {({ id }) => (
                  <AttachmentPicker
                    id={id}
                    value={step}
                    onChange={(attachment) => update(step.key, attachment)}
                    hint={
                      step.body.length > CAPTION_LIMIT
                        ? `Текст длиннее ${CAPTION_LIMIT} символов — файл придёт первым сообщением, текст с кнопкой следом.`
                        : undefined
                    }
                  />
                )}
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Текст кнопки">
                  {({ id }) => (
                    <Input
                      id={id}
                      value={step.button_text}
                      onChange={(event) => update(step.key, { button_text: event.target.value })}
                    />
                  )}
                </Field>
                <Field label="Ссылка кнопки">
                  {({ id }) => (
                    <Input
                      id={id}
                      type="url"
                      placeholder="https://"
                      value={step.button_url}
                      onChange={(event) => update(step.key, { button_url: event.target.value })}
                    />
                  )}
                </Field>
              </div>

              <Switch
                checked={step.is_active}
                onChange={(checked) => update(step.key, { is_active: checked })}
                label="Шаг включён"
              />
            </div>
          </div>
        );
      })}

      {steps.length > 1 && (
        <p className="text-2xs leading-relaxed text-gray-500">
          Весь курс займёт {formatDelay(
            steps.filter((step) => step.is_active).reduce((sum, step) => sum + step.delay_minutes, 0),
          ).replace('через ', '')}. Выключенный шаг пропускается, а те, что за ним, не сдвигаются.
        </p>
      )}
    </div>
  );
};

export default FunnelStepsEditor;
