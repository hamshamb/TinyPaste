'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

type ToastTone = 'success' | 'error' | 'info';

type Toast = {
  id: number;
  message: string;
  tone: ToastTone;
};

type ToastContextValue = {
  toast: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_STYLES: Record<ToastTone, string> = {
  success: 'text-success',
  error: 'text-danger',
  info: 'text-accent',
};

const TONE_ICONS: Record<ToastTone, typeof Check> = {
  success: Check,
  error: AlertTriangle,
  info: Info,
};

const DISMISS_AFTER_MS = 3_600;

/**
 * Small local notification system. A dependency would add more weight than the
 * feature itself, and this keeps the announcement semantics under our control.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = nextId.current;
      nextId.current += 1;
      setToasts((current) => {
        // Collapse an identical repeat instead of stacking duplicates.
        const withoutDuplicate = current.filter((item) => item.message !== message);
        return [...withoutDuplicate.slice(-2), { id, message, tone }];
      });
      window.setTimeout(() => dismiss(id), DISMISS_AFTER_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        // Assertive would interrupt the user mid-action; these are confirmations.
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end sm:p-5"
      >
        {toasts.map((item) => {
          const Icon = TONE_ICONS[item.tone];
          return (
            <div
              key={item.id}
              className={cn(
                'pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-lg border border-border-base',
                'bg-surface px-3 py-2.5 text-[13px] text-text-base tp-shadow-pop tp-rise',
              )}
            >
              <Icon
                aria-hidden
                className={cn('mt-0.5 h-4 w-4 shrink-0', TONE_STYLES[item.tone])}
                strokeWidth={2}
              />
              <span className="min-w-0 flex-1 break-words">{item.message}</span>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                aria-label="Dismiss notification"
                className="-mr-1 rounded p-1 text-text-subtle tp-transition hover:text-text-base"
              >
                <X aria-hidden className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside a ToastProvider.');
  return context;
}
