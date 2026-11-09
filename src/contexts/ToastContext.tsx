import { createContext, useContext, useState, ReactNode, useCallback, useRef } from 'react';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface ToastContextType {
  toasts: Toast[];
  showToast: (
    message: string,
    type?: ToastType,
    duration?: number,
    action?: { label: string; onClick: () => void },
  ) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, number>());

  const removeToast = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) window.clearTimeout(t);
    timers.current.delete(id);
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (
      message: string,
      type: ToastType = 'success',
      duration: number = 3000,
      action?: { label: string; onClick: () => void },
    ) => {
      const id = Math.random().toString(36).substring(2, 9);
      // Maks. 4 powiadomienia naraz — najstarsze znikają
      setToasts((prev) => [...prev.slice(-3), { id, message, type, duration, action }]);
      if (duration > 0)
        timers.current.set(
          id,
          window.setTimeout(() => removeToast(id), duration),
        );
    },
    [removeToast],
  );

  return (
    <ToastContext.Provider value={{ toasts, showToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
}

const toastStyles: Record<ToastType, { icon: typeof Info; iconClass: string }> = {
  success: { icon: CheckCircle2, iconClass: 'text-status-done' },
  error: { icon: XCircle, iconClass: 'text-destructive' },
  warning: { icon: AlertTriangle, iconClass: 'text-highlight-ink' },
  info: { icon: Info, iconClass: 'text-status-planned' },
};

function ToastContainer({
  toasts,
  removeToast,
}: {
  toasts: Toast[];
  removeToast: (id: string) => void;
}) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-20 z-[10000] flex flex-col items-center gap-2 sm:inset-x-auto sm:bottom-auto sm:right-5 sm:top-20 sm:items-end"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} removeToast={removeToast} />
      ))}
    </div>
  );
}

function ToastItem({ toast, removeToast }: { toast: Toast; removeToast: (id: string) => void }) {
  const { icon: Icon, iconClass } = toastStyles[toast.type];

  return (
    <div
      role={toast.type === 'error' ? 'alert' : 'status'}
      className={cn(
        'surface-shadow pointer-events-auto flex w-full max-w-[420px] items-center gap-3 rounded-lg border bg-popover py-2.5 pl-3.5 pr-2 text-popover-foreground sm:w-auto sm:min-w-[300px]',
        'animate-[slideInRight_0.28s_cubic-bezier(0.22,1,0.36,1)]',
        toast.type === 'error' && 'border-destructive/50',
      )}
    >
      <Icon className={cn('h-[18px] w-[18px] shrink-0', iconClass)} aria-hidden />
      <p className="flex-1 text-sm font-medium">{toast.message}</p>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action!.onClick();
            removeToast(toast.id);
          }}
          className="shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold text-highlight-ink transition-colors hover:bg-highlight/15"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        aria-label="Zamknij powiadomienie"
        onClick={() => removeToast(toast.id)}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
