import React, { useEffect, useState } from 'react';
import {
  ChatBubbleLeftRightIcon,
  DocumentIcon,
  LinkIcon,
  PlayCircleIcon,
} from '@heroicons/react/24/outline';
import { cn } from '../ui';
import type { MessageAttachment } from '../../types';
import { ATTACHMENT_LABELS, attachmentPreviewUrl } from '../../services/attachmentService';

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
  /** The file above the text, drawn the way the client will stack it. */
  attachment?: MessageAttachment;
  /** Names the funnel step this message belongs to. */
  step?: string;
  /** Marks a message that only some readers will see. */
  conditional?: boolean;
  /** "через 2 дня" — drawn as a gap in the conversation before this message. */
  delay?: string;
  /** Dims a step the author has switched off. */
  muted?: boolean;
}

export interface TelegramChatPreviewProps {
  botName: string;
  botUsername: string;
  messages: PreviewMessage[];
  /** Shown when every message is still empty. */
  emptyHint?: string;
  className?: string;
}

/* Telegram's caption ceiling: past it the client gets two messages, and the
   preview should show two. */
const CAPTION_LIMIT = 1024;

/**
 * The file, drawn as the recipient will see it.
 *
 * Resolves its own signed URL rather than taking one as a prop: the callers
 * are editors holding form state, and threading an async, expiring URL through
 * them would put a refresh timer in three components instead of one.
 */
const AttachmentBubble: React.FC<{ attachment: MessageAttachment }> = ({ attachment }) => {
  const [url, setUrl] = useState('');
  const { attachment_type: type, attachment_path: path, attachment_name: name } = attachment;

  useEffect(() => {
    if (type === 'none' || type === 'document' || !path) {
      setUrl('');
      return;
    }

    let cancelled = false;
    attachmentPreviewUrl(path)
      .then((signed) => !cancelled && setUrl(signed))
      .catch(() => !cancelled && setUrl(''));

    return () => {
      cancelled = true;
    };
  }, [type, path]);

  if (type === 'none' || !path) return null;

  if (type === 'document' || !url) {
    return (
      <div className="mb-1.5 flex items-center gap-2.5 rounded-2xl rounded-bl-md border border-gray-200 bg-white px-3 py-2.5 shadow-xs">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
          <DocumentIcon className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-xs font-medium text-gray-800">
            {name || ATTACHMENT_LABELS[type]}
          </span>
          <span className="block text-2xs text-gray-500">{ATTACHMENT_LABELS[type]}</span>
        </span>
      </div>
    );
  }

  return (
    <div className="relative mb-1.5 overflow-hidden rounded-2xl rounded-bl-md border border-gray-200 bg-white shadow-xs">
      {type === 'photo'
        ? <img src={url} alt={name} className="max-h-56 w-full object-cover" />
        : <video src={url} muted playsInline className="max-h-56 w-full object-cover" />}
      {type === 'video' && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <PlayCircleIcon className="h-10 w-10 text-white/90 drop-shadow" />
        </span>
      )}
    </div>
  );
};

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
  const visible = messages.filter((message) =>
    message.text.trim() ||
    message.buttons?.length ||
    (message.attachment && message.attachment.attachment_type !== 'none'));

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
          <div key={message.id} className={cn('space-y-1.5', message.muted && 'opacity-45')}>
            {/* The wait is part of what the reader experiences, so the preview
                shows it as a break in the conversation rather than as a number
                hidden in the form. */}
            {message.delay && (
              <div className="flex items-center gap-2 py-1" aria-label={`Пауза ${message.delay}`}>
                <span className="h-px flex-1 bg-gray-200" />
                <span className="badge badge-neutral">{message.delay}</span>
                <span className="h-px flex-1 bg-gray-200" />
              </div>
            )}

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
              {message.attachment && <AttachmentBubble attachment={message.attachment} />}

              {/* Telegram puts long copy in its own message rather than
                  truncating the caption, so the preview says so instead of
                  showing a layout the reader will never get. */}
              {message.attachment &&
                message.attachment.attachment_type !== 'none' &&
                message.text.length > CAPTION_LIMIT && (
                <p className="mb-1.5 pl-1 text-2xs text-gray-400">
                  Текст длиннее подписи — придёт отдельным сообщением
                </p>
              )}

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
