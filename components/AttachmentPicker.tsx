import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowPathIcon,
  DocumentIcon,
  PaperClipIcon,
  PhotoIcon,
  TrashIcon,
  VideoCameraIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../contexts/AuthContext';
import { NO_ATTACHMENT, type AttachmentType, type MessageAttachment } from '../types';
import {
  ATTACHMENT_LABELS,
  ATTACHMENT_LIMITS,
  attachmentPreviewUrl,
  formatBytes,
  uploadAttachment,
  validateAttachment,
} from '../services/attachmentService';
import { Button, cn } from './ui';
import { getErrorMessage } from '../utils/errorMessage';

const ICONS: Record<AttachmentType, React.ReactNode> = {
  none: null,
  photo: <PhotoIcon className="h-4 w-4" />,
  video: <VideoCameraIcon className="h-4 w-4" />,
  document: <DocumentIcon className="h-4 w-4" />,
};

export interface AttachmentPickerProps {
  value: MessageAttachment;
  onChange: (next: MessageAttachment) => void;
  /** Lands on whichever trigger is rendered, so a `<Field>` label reaches it. */
  id?: string;
  /** Sits under the control — where the platform's caveats belong. */
  hint?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Attach one file to a message.
 *
 * Deliberately one file and not many: Telegram sends an album as a separate
 * kind of message that cannot carry an inline button, and the button is where
 * every one of these messages is going. So the choice is one file with the
 * copy and the call to action, or several files with neither.
 *
 * The upload happens on drop rather than on save. An author who attaches a
 * 20 MB video and immediately presses "Сохранить" should not be the one who
 * discovers the wait — doing it here makes the cost visible where it is paid.
 */
const AttachmentPicker: React.FC<AttachmentPickerProps> = ({
  value,
  onChange,
  id,
  hint,
  disabled,
  className,
}) => {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');

  const attached = value.attachment_type !== 'none' && Boolean(value.attachment_path);

  /* Signed URLs expire, so the preview is resolved per mount rather than
     stored. `cancelled` keeps a slow signature from landing on a picker that
     has since been given a different file. */
  useEffect(() => {
    if (!attached || value.attachment_type === 'document') {
      setPreviewUrl('');
      return;
    }

    let cancelled = false;
    attachmentPreviewUrl(value.attachment_path)
      .then((url) => {
        if (!cancelled) setPreviewUrl(url);
      })
      .catch(() => {
        if (!cancelled) setPreviewUrl('');
      });

    return () => {
      cancelled = true;
    };
  }, [attached, value.attachment_path, value.attachment_type]);

  const accept = async (file: File | undefined) => {
    if (!file || !user) return;

    const problem = validateAttachment(file);
    if (problem) {
      setError(problem);
      return;
    }

    setError('');
    setUploading(true);
    try {
      onChange(await uploadAttachment(file, user.id));
    } catch (uploadError) {
      setError(getErrorMessage(uploadError, 'Не удалось загрузить файл'));
    } finally {
      setUploading(false);
    }
  };

  const clear = () => {
    setError('');
    setPreviewUrl('');
    onChange({ ...NO_ATTACHMENT });
    if (inputRef.current) inputRef.current.value = '';
  };

  const limitHint = `Изображение до ${formatBytes(ATTACHMENT_LIMITS.photo)}, ` +
    `видео и файлы до ${formatBytes(ATTACHMENT_LIMITS.video)}`;

  return (
    <div className={cn('space-y-1.5', className)}>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.epub,.mp3"
        onChange={(event) => accept(event.target.files?.[0])}
      />

      {!attached ? (
        <button
          type="button"
          id={id}
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void accept(event.dataTransfer.files?.[0]);
          }}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-3',
            'text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
            dragging
              ? 'border-brand-600 bg-blue-50/70 text-brand-700'
              : 'border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50',
          )}
        >
          {uploading
            ? <ArrowPathIcon className="h-4 w-4 animate-spin" />
            : <PaperClipIcon className="h-4 w-4 text-gray-400" />}
          {uploading ? 'Загружаем…' : 'Прикрепить изображение, видео или файл'}
        </button>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-2.5">
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100">
            {value.attachment_type === 'photo' && previewUrl && (
              <img src={previewUrl} alt="" className="h-full w-full object-cover" />
            )}
            {value.attachment_type === 'video' && previewUrl && (
              // muted+playsInline so the browser renders a first frame without
              // asking anyone's permission to play sound in a form.
              <video src={previewUrl} muted playsInline className="h-full w-full object-cover" />
            )}
            {(value.attachment_type === 'document' || !previewUrl) && (
              <span className="text-gray-400">{ICONS[value.attachment_type]}</span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-gray-900">
              {value.attachment_name || 'Файл'}
            </p>
            <p className="mt-0.5 flex items-center gap-1 text-2xs text-gray-500">
              {ICONS[value.attachment_type]}
              {value.attachment_type === 'none' ? '' : ATTACHMENT_LABELS[value.attachment_type]}
            </p>
          </div>

          <div className="flex flex-shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              id={id}
              disabled={disabled || uploading}
              loading={uploading}
              onClick={() => inputRef.current?.click()}
            >
              Заменить
            </Button>
            <Button
              variant="danger"
              size="sm"
              iconOnly
              title="Убрать вложение"
              disabled={disabled || uploading}
              onClick={clear}
              icon={<TrashIcon className="h-4 w-4" />}
            />
          </div>
        </div>
      )}

      <p className={cn('text-2xs leading-relaxed', error ? 'text-red-600' : 'text-gray-500')}>
        {error || hint || limitHint}
      </p>
    </div>
  );
};

export default AttachmentPicker;
