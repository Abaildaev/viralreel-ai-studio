import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
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
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const ModalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [modalState, setModalState] = useState<ModalState | null>(null);

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      modalState?.resolve(false);
    }
  };

  const renderIcon = () => {
    const iconType = modalState?.icon;
    const variant = modalState?.variant;

    if (iconType === 'trash' || variant === 'danger') {
      return (
        <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0">
          <TrashIcon className="w-6 h-6" />
        </div>
      );
    }
    if (iconType === 'shuffle') {
      return (
        <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
          <ArrowsUpDownIcon className="w-6 h-6" />
        </div>
      );
    }
    if (iconType === 'arrows') {
      return (
        <div className="w-12 h-12 rounded-2xl bg-gray-100 text-gray-700 flex items-center justify-center flex-shrink-0">
          <ArrowsRightLeftIcon className="w-6 h-6" />
        </div>
      );
    }
    if (iconType === 'warning' || variant === 'error' || variant === 'warning') {
      return (
        <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
          <ExclamationTriangleIcon className="w-6 h-6" />
        </div>
      );
    }
    if (variant === 'success') {
      return (
        <div className="w-12 h-12 rounded-2xl bg-green-50 text-green-600 flex items-center justify-center flex-shrink-0">
          <CheckCircleIcon className="w-6 h-6" />
        </div>
      );
    }
    return (
      <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center flex-shrink-0">
        <QuestionMarkCircleIcon className="w-6 h-6" />
      </div>
    );
  };

  const getConfirmButtonClasses = () => {
    const variant = modalState?.variant;
    const icon = modalState?.icon;

    if (variant === 'danger' || icon === 'trash') {
      return 'bg-red-600 hover:bg-red-700 text-white shadow-red-200';
    }
    if (icon === 'shuffle') {
      return 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200';
    }
    if (variant === 'warning' || variant === 'error') {
      return 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-200';
    }
    return 'bg-teal-600 hover:bg-teal-700 text-white shadow-teal-200';
  };

  return (
    <ModalContext.Provider value={{ confirm, alert }}>
      {children}

      {modalState?.isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => modalState.resolve(false)}
          onKeyDown={handleKeyDown}
          tabIndex={-1}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-gray-100 transform transition-all animate-in zoom-in-95 duration-150 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-4">
              {renderIcon()}
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-bold text-gray-900 leading-snug">
                    {modalState.title}
                  </h3>
                  <button
                    onClick={() => modalState.resolve(false)}
                    className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>
                <p className="mt-2 text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                  {modalState.message}
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 pt-2">
              {modalState.type === 'confirm' && (
                <button
                  type="button"
                  onClick={() => modalState.resolve(false)}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  {modalState.cancelText}
                </button>
              )}
              <button
                type="button"
                autoFocus
                onClick={() => modalState.resolve(true)}
                className={`px-5 py-2.5 rounded-xl text-sm font-semibold shadow-md transition-all ${getConfirmButtonClasses()}`}
              >
                {modalState.confirmText}
              </button>
            </div>
          </div>
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
