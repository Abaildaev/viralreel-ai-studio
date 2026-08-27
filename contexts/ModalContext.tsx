import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import {
  ExclamationTriangleIcon,
  TrashIcon,
  ArrowsUpDownIcon,
  ArrowsRightLeftIcon,
  InformationCircleIcon,
  CheckCircleIcon,
  QuestionMarkCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { Button, cn } from '../components/ui';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'primary' | 'danger' | 'warning' | 'info';
  icon?: 'shuffle' | 'trash' | 'warning' | 'info' | 'arrows' | 'question';
}

export interface AlertOptions {
  title?: string;
  message: string;
  confirmText?: string;
  variant?: 'error' | 'warning' | 'info' | 'success';
}

export type ToastTone = 'success' | 'error' | 'info' | 'warning';

export interface ToastOptions {
  message: string;
  tone?: ToastTone;
  /** Milliseconds on screen. Errors default to longer than confirmations. */
  duration?: number;
}

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ModalState {
  isOpen: boolean;
  type: 'confirm' | 'alert';
  title?: string;
  message: string;
  confirmText: string;
  cancelText: string;
  variant: 'primary' | 'danger' | 'warning' | 'info' | 'error' | 'success';
  icon?: 'shuffle' | 'trash' | 'warning' | 'info' | 'arrows' | 'question';
  resolve: (value: boolean) => void;
}

interface ModalContextType {
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
  alert: (options: AlertOptions | string) => Promise<void>;
  /**
   * Non-blocking feedback for something that already happened. Prefer this over
   * `alert` for success and progress: a modal that only says "готово" costs the
   * user a click to dismiss information they never asked for.
   */
  toast: (options: ToastOptions | string) => void;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

const TOAST_TONES: Record<ToastTone, { box: string; icon: ReactNode }> = {
  success: {
    box: 'border-green-200 bg-green-50 text-green-900',
    icon: <CheckCircleIcon className="h-5 w-5 text-green-600" />,
  },
  error: {
    box: 'border-red-200 bg-red-50 text-red-900',
    icon: <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />,
  },
  warning: {
    box: 'border-amber-200 bg-amber-50 text-amber-900',
    icon: <ExclamationTriangleIcon className="h-5 w-5 text-amber-600" />,
  },
  info: {
    box: 'border-gray-200 bg-white text-gray-900',
    icon: <InformationCircleIcon className="h-5 w-5 text-brand-600" />,
  },
};

export const ModalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const modalRef = useRef<HTMLDivElement>(null);
  const nextToastId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismissToast = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const toast = useCallback(
    (options: ToastOptions | string) => {
      const opts: ToastOptions = typeof options === 'string' ? { message: options } : options;
      const tone = opts.tone ?? 'success';
      // An error is worth more reading time than a confirmation.
      const duration = opts.duration ?? (tone === 'error' ? 6000 : 4000);
      const id = nextToastId.current++;

      setToasts((current) => [...current, { id, message: opts.message, tone }]);
      timers.current.set(
        id,
        setTimeout(() => dismissToast(id), duration),
      );
    },
    [dismissToast],
  );

  // Timers outlive the component without this, and firing into an unmounted
  // tree warns in development.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const confirm = useCallback((options: ConfirmOptions | string): Promise<boolean> => {
    return new Promise((resolve) => {
      const opts: ConfirmOptions = typeof options === 'string' ? { message: options } : options;

      let autoIcon = opts.icon;
      if (!autoIcon) {
        if (opts.variant === 'danger' || opts.message.toLowerCase().includes('удалить')) {
          autoIcon = 'trash';
        } else if (opts.message.toLowerCase().includes('перемешать')) {
          autoIcon = 'shuffle';
        } else if (opts.message.toLowerCase().includes('перенести')) {
          autoIcon = 'arrows';
        } else {
          autoIcon = 'question';
        }
      }

      setModalState({
        isOpen: true,
        type: 'confirm',
        title: opts.title || (opts.variant === 'danger' || opts.message.toLowerCase().includes('удалить') ? 'Подтверждение удаления' : 'Подтвердите действие'),
        message: opts.message,
        confirmText: opts.confirmText || (opts.variant === 'danger' || opts.message.toLowerCase().includes('удалить') ? 'Удалить' : 'Подтвердить'),
        cancelText: opts.cancelText || 'Отмена',
        variant: opts.variant || (opts.message.toLowerCase().includes('удалить') ? 'danger' : 'primary'),
        icon: autoIcon,
        resolve: (val: boolean) => {
          setModalState(null);
          resolve(val);
        },
      });
    });
  }, []);

  const alert = useCallback((options: AlertOptions | string): Promise<void> => {
    return new Promise((resolve) => {
      const opts: AlertOptions = typeof options === 'string' ? { message: options } : options;
      const isError = opts.variant === 'error' || opts.message.toLowerCase().includes('ошибка');

      setModalState({
        isOpen: true,
        type: 'alert',
        title: opts.title || (isError ? 'Внимание' : 'Информация'),
        message: opts.message,
        confirmText: opts.confirmText || 'Понятно',
        cancelText: '',
        variant: opts.variant || (isError ? 'error' : 'info'),
        icon: isError ? 'warning' : 'info',
        resolve: () => {
          setModalState(null);
          resolve();
        },
      });
    });
  }, []);

  // Escape has to be caught on the document: the overlay only received key
  // events while it happened to hold focus, which it loses to its own buttons.
  useEffect(() => {
    if (!modalState) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') modalState.resolve(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [modalState]);

  // Keep keyboard focus inside the confirmation/alert dialog and return it to
  // the invoking control when the modal closes.
  useEffect(() => {
    if (!modalState) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = modalRef.current;
    const selector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusables = () => Array.from(dialog?.querySelectorAll<HTMLElement>(selector) ?? []);
    const initial = focusables().find((element) => element.hasAttribute('autofocus')) ?? focusables()[0];
    initial?.focus();

    const onTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const current = focusables();
      if (current.length === 0) return;
      const first = current[0];
      const last = current[current.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onTab);
    return () => {
      document.removeEventListener('keydown', onTab);
      previous?.focus?.();
    };
  }, [modalState]);

  const renderIcon = () => {
    const iconType = modalState?.icon;
    const variant = modalState?.variant;

    if (iconType === 'trash' || variant === 'danger') {
      return (
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600">
          <TrashIcon className="h-6 w-6" />
        </div>
      );
    }
    if (iconType === 'shuffle') {
      return (
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <ArrowsUpDownIcon className="h-6 w-6" />
        </div>
      );
    }
    if (iconType === 'arrows') {
      return (
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gray-100 text-gray-700">
          <ArrowsRightLeftIcon className="h-6 w-6" />
        </div>
      );
    }
    if (iconType === 'warning' || variant === 'error' || variant === 'warning') {
      return (
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
          <ExclamationTriangleIcon className="h-6 w-6" />
        </div>
      );
    }
    if (variant === 'success') {
      return (
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-green-50 text-green-600">
          <CheckCircleIcon className="h-6 w-6" />
        </div>
      );
    }
    return (
      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
        <QuestionMarkCircleIcon className="h-6 w-6" />
      </div>
    );
  };

  /* Only the destructive and cautionary confirmations depart from the primary
     button; the rest use it as-is. */
  const confirmButtonClass = () => {
    const variant = modalState?.variant;
    const icon = modalState?.icon;
    if (variant === 'danger' || icon === 'trash') return 'bg-red-600 hover:bg-red-700';
    if (variant === 'warning' || variant === 'error') return 'bg-amber-600 hover:bg-amber-700';
    return '';
  };

  return (
    <ModalContext.Provider value={{ confirm, alert, toast }}>
      {children}

      {modalState?.isOpen && (
        <div
          className="animate-in fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm duration-150"
          onClick={() => modalState.resolve(false)}
          role="presentation"
        >
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-label={modalState.title}
            className="animate-in zoom-in-95 flex w-full max-w-md flex-col rounded-2xl border border-gray-100 bg-white p-6 shadow-2xl duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-4">
              {renderIcon()}
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-semibold leading-snug text-gray-900">
                    {modalState.title}
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    title="Закрыть"
                    onClick={() => modalState.resolve(false)}
                    icon={<XMarkIcon className="h-5 w-5" />}
                  />
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-600">
                  {modalState.message}
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 pt-2">
              {modalState.type === 'confirm' && (
                <Button onClick={() => modalState.resolve(false)}>{modalState.cancelText}</Button>
              )}
              <Button
                variant="primary"
                autoFocus
                onClick={() => modalState.resolve(true)}
                className={confirmButtonClass()}
              >
                {modalState.confirmText}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Toast stack. `polite` so a success note never interrupts a screen
          reader mid-sentence — the modal above is what assertive is for. */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-center gap-2 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:items-end"
        >
          {toasts.map(({ id, message, tone }) => (
            <div
              key={id}
              className={cn(
                'animate-toast-in pointer-events-auto flex w-full items-start gap-2.5 rounded-xl border px-3.5 py-3 shadow-lg sm:w-auto sm:max-w-sm',
                TOAST_TONES[tone].box,
              )}
            >
              <span className="mt-px flex-shrink-0" aria-hidden>
                {TOAST_TONES[tone].icon}
              </span>
              <p className="min-w-0 flex-1 text-sm leading-relaxed">{message}</p>
              <button
                type="button"
                onClick={() => dismissToast(id)}
                title="Закрыть"
                className="-mr-1 flex-shrink-0 rounded-lg p-1 opacity-50 transition-opacity hover:opacity-100"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </ModalContext.Provider>
  );
};

export const useConfirm = () => {
  const context = useContext(ModalContext);
  if (context === undefined) {
    throw new Error('useConfirm must be used within a ModalProvider');
  }
  return context;
};
