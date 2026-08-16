import React from 'react';
import { ChatBubbleLeftRightIcon, LinkIcon } from '@heroicons/react/24/outline';
import { cn } from '../ui';

export interface PreviewButton {
  text: string;
  url?: string;
  /** Renders as an in-chat action rather than a link out. */
  callback?: boolean;
}

export interface PreviewMessage {
  id: string;
  text: string;
  buttons?: PreviewButton[];
  /** Names the funnel step this message belongs to. */
  step?: string;
  /** Marks a message that only some readers will see. */
  conditional?: boolean;
}

export interface TelegramChatPreviewProps {
  botName: string;
  botUsername: string;
  messages: PreviewMessage[];
  /** Shown when every message is still empty. */
  emptyHint?: string;
  className?: string;
}

/**
 * What the subscriber will actually see.
 *
 * The funnel is six text fields and two toggles, and reading those as a
 * sequence of chat messages is genuinely hard — which is how funnels end up
 * shipping with a greeting that promises a file the next message never sends.
 * The preview removes the translation step: the copy is edited beside the
 * conversation it produces.
 *
 * Deliberately monochrome rather than Telegram's own palette. This is the app's
 * rendering of a message, not an imitation of the client, and the borrowed
 * branding was removed from this project once already.
 */
const TelegramChatPreview: React.FC<TelegramChatPreviewProps> = ({
  botName,
  botUsername,
  messages,
  emptyHint = 'Заполните тексты слева — здесь появится переписка, которую увидит подписчик.',
  className,
}) => {
  const visible = messages.filter((message) => message.text.trim() || message.buttons?.length);

  return (
    <div className={cn('card overflow-hidden', className)}>
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
          {(botName || 'B').slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">
            {botName || 'Ваш бот'}
          </p>
          <p className="truncate text-2xs text-gray-500">
            {botUsername ? `@${botUsername.replace(/^@/, '')}` : 'бот не подключён'}
          </p>
        </div>
        <span className="badge badge-neutral">превью</span>
      </div>

      <div className="max-h-[32rem] space-y-4 overflow-y-auto bg-gray-50 px-4 py-5">
        {visible.length === 0 && (
          <div className="flex flex-col items-center px-4 py-10 text-center">
            <ChatBubbleLeftRightIcon className="mb-3 h-8 w-8 text-gray-300" />
            <p className="max-w-xs text-xs leading-relaxed text-gray-500">{emptyHint}</p>
          </div>
        )}

        {visible.map((message) => (
          <div key={message.id} className="space-y-1.5">
            {message.step && (
              <p className="flex items-center gap-1.5 pl-1 text-2xs font-medium uppercase tracking-wide text-gray-400">
                {message.step}
                {message.conditional && (
                  <span className="normal-case tracking-normal text-gray-400">
                    · только если нужна подписка
                  </span>
                )}
              </p>
            )}

            <div className="max-w-[92%]">
              {message.text.trim() && (
                <div className="rounded-2xl rounded-bl-md border border-gray-200 bg-white px-3.5 py-2.5 shadow-xs">
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-800">
                    {message.text}
                  </p>
                </div>
              )}

              {(message.buttons ?? []).filter((button) => button.text.trim()).length > 0 && (
                <div className="mt-1.5 space-y-1">
                  {(message.buttons ?? [])
                    .filter((button) => button.text.trim())
                    .map((button, index) => (
                      <div
                        key={`${message.id}-${index}`}
                        className={cn(
                          'flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium',
                          button.callback
                            ? 'border-gray-200 bg-white text-gray-700'
                            : 'border-gray-300 bg-white text-gray-900',
                        )}
                      >
                        {!button.callback && <LinkIcon className="h-3.5 w-3.5 text-gray-400" />}
                        <span className="truncate">{button.text}</span>
                      </div>
                    ))}
                </div>
              )}

              {/* A link button with nowhere to go is the most common way a
                  funnel silently loses its readers, so it is called out here
                  rather than discovered in production. */}
              {(message.buttons ?? []).some(
                (button) => button.text.trim() && !button.callback && !button.url?.trim(),
              ) && (
                <p className="mt-1 pl-1 text-2xs text-amber-600">
                  У кнопки не заполнена ссылка — Telegram её не покажет.
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TelegramChatPreview;
