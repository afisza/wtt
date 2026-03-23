import { createContext, useContext, useState, ReactNode, useCallback } from 'react'
import { CheckCircle, XCircle, Info, AlertCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  message: string
  type: ToastType
  duration?: number
  action?: { label: string; onClick: () => void }
}

interface ToastContextType {
  toasts: Toast[]
  showToast: (message: string, type?: ToastType, duration?: number, action?: { label: string; onClick: () => void }) => void
  removeToast: (id: string) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((message: string, type: ToastType = 'success', duration: number = 3000, action?: { label: string; onClick: () => void }) => {
    const id = Math.random().toString(36).substring(2, 9)
    const newToast: Toast = { id, message, type, duration, action }

    setToasts(prev => [...prev, newToast])

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id)
      }, duration)
    }
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, showToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  )
}

const toastStyles: Record<ToastType, { icon: typeof CheckCircle; iconClass: string; borderClass: string }> = {
  success: { icon: CheckCircle, iconClass: 'text-emerald-500', borderClass: 'border-emerald-500' },
  error: { icon: XCircle, iconClass: 'text-red-500', borderClass: 'border-red-500' },
  warning: { icon: AlertCircle, iconClass: 'text-amber-500', borderClass: 'border-amber-500' },
  info: { icon: Info, iconClass: 'text-blue-500', borderClass: 'border-blue-500' },
}

function ToastContainer({ toasts, removeToast }: { toasts: Toast[], removeToast: (id: string) => void }) {
  return (
    <div className="fixed top-5 right-5 z-[10000] flex flex-col gap-2.5 pointer-events-none">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} removeToast={removeToast} />
      ))}
    </div>
  )
}

function ToastItem({ toast, removeToast }: { toast: Toast, removeToast: (id: string) => void }) {
  const { icon: Icon, iconClass, borderClass } = toastStyles[toast.type]

  return (
    <div
      className={cn(
        'flex items-center gap-2.5 px-4 py-3 bg-card border rounded-lg shadow-lg',
        'min-w-[280px] max-w-[400px] pointer-events-auto',
        'animate-[slideInRight_0.3s_ease-out] transition-transform hover:-translate-x-1',
        borderClass
      )}
    >
      <div className="shrink-0">
        <Icon className={cn('h-[18px] w-[18px]', iconClass)} />
      </div>
      <div className="flex-1 text-sm text-foreground font-medium">
        {toast.message}
      </div>
      {toast.action && (
        <button
          onClick={() => {
            toast.action!.onClick()
            removeToast(toast.id)
          }}
          className="shrink-0 px-2 py-1 text-xs font-semibold rounded bg-foreground/10 hover:bg-foreground/20 text-foreground transition-colors"
        >
          {toast.action.label}
        </button>
      )}
      <button
        onClick={() => removeToast(toast.id)}
        className="shrink-0 p-0.5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}
