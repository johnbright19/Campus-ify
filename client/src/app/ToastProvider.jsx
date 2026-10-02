import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Ban,
  CalendarCheck,
  CircleAlert,
  Hourglass,
  Info,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react'
import { cn, prefersReducedMotion, uid } from '../lib/utils'
import { gsap } from '../lib/gsap'

const ToastContext = createContext(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

const KIND_STYLES = {
  info: { icon: Info, ring: 'border-aqua-400/30', glow: 'text-aqua-400' },
  success: { icon: CalendarCheck, ring: 'border-mint-400/30', glow: 'text-mint-400' },
  warning: { icon: TriangleAlert, ring: 'border-amber-450/30', glow: 'text-amber-450' },
  conflict: { icon: Ban, ring: 'border-rose-450/35', glow: 'text-rose-450' },
  offer: { icon: Hourglass, ring: 'border-brand-400/35', glow: 'text-brand-300' },
  error: { icon: CircleAlert, ring: 'border-rose-450/40', glow: 'text-rose-450' },
  ai: { icon: Sparkles, ring: 'border-lilac-400/35', glow: 'text-lilac-400' },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      window.clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const push = useCallback(
    (toast) => {
      const id = toast.id ?? uid('toast')
      setToasts((list) => [...list.filter((t) => t.id !== id), { ...toast, id }].slice(-4))
      const duration = toast.duration ?? 5400
      if (duration > 0) {
        const timer = window.setTimeout(() => dismiss(id), duration)
        timers.current.set(id, timer)
      }
      return id
    },
    [dismiss]
  )

  const value = useMemo(() => ({ push, dismiss, toasts }), [push, dismiss, toasts])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {typeof document !== 'undefined'
        ? createPortal(
            <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6">
              {toasts.map((toast) => (
                <ToastItem key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
              ))}
            </div>,
            document.body
          )
        : null}
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onDismiss }) {
  const ref = useRef(null)
  const meta = KIND_STYLES[toast.kind] ?? KIND_STYLES.info
  const Icon = toast.icon ?? meta.icon

  const mounted = useRef(false)
  if (!mounted.current && ref.current && !prefersReducedMotion()) {
    mounted.current = true
    gsap.fromTo(
      ref.current,
      { y: 18, opacity: 0, scale: 0.98 },
      { y: 0, opacity: 1, scale: 1, duration: 0.32, ease: 'power3.out' }
    )
  }

  return (
    <div
      ref={ref}
      role="status"
      className={cn(
        'pointer-events-auto card flex w-full max-w-sm items-start gap-3 border px-4 py-3.5',
        meta.ring
      )}
    >
      <span className={cn('mt-0.5 shrink-0', meta.glow)}>
        <Icon className="size-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold text-white">{toast.title}</p>
        {toast.body ? <p className="mt-0.5 text-[12.5px] leading-snug text-slate-400">{toast.body}</p> : null}
        {toast.action ? <div className="mt-2.5">{toast.action}</div> : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="-mt-0.5 shrink-0 rounded-lg p-1 text-slate-500 transition hover:bg-white/8 hover:text-white"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
