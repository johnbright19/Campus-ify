import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn, prefersReducedMotion } from '../../lib/utils'
import { gsap, useGSAP } from '../../lib/gsap'
import { Button, IconButton } from './primitives'

function useLockScroll(active) {
  useEffect(() => {
    if (!active) return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [active])
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon: Icon,
  children,
  footer,
  size = 'md',
  className,
}) {
  const panel = useRef(null)
  useLockScroll(open)

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useGSAP(
    () => {
      if (!open || !panel.current || prefersReducedMotion()) return
      gsap.from(panel.current, { y: 18, opacity: 0, scale: 0.985, duration: 0.28, ease: 'power2.out' })
    },
    { dependencies: [open] }
  )

  if (!open) return null

  const sizes = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto p-4 sm:items-center sm:p-6">
      <div
        className="fixed inset-0 bg-ink-950/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn('card relative z-10 my-auto w-full p-0', sizes[size], className)}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/8 px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            {Icon ? (
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-brand-400/25 bg-brand-500/12 text-brand-300">
                <Icon className="size-4.5" />
              </span>
            ) : null}
            <div className="min-w-0">
              <h2 className="truncate text-[15px] font-semibold text-white">{title}</h2>
              {subtitle ? <p className="mt-0.5 text-[12.5px] text-slate-400">{subtitle}</p> : null}
            </div>
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-5">{children}</div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/8 px-5 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  )
}

export function Drawer({ open, onClose, title, subtitle, side = 'right', width = 'max-w-lg', children, footer }) {
  const panel = useRef(null)
  useLockScroll(open)

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => event.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useGSAP(
    () => {
      if (!open || !panel.current || prefersReducedMotion()) return
      gsap.from(panel.current, { x: side === 'right' ? 40 : -40, opacity: 0, duration: 0.3, ease: 'power2.out' })
    },
    { dependencies: [open] }
  )

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[80] flex justify-end">
      <div className="fixed inset-0 bg-ink-950/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <aside
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative z-10 flex h-full w-full flex-col border-l border-white/10 bg-ink-900/95 backdrop-blur-2xl',
          width
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-white/8 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold text-white">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-[12.5px] text-slate-400">{subtitle}</p> : null}
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer ? <footer className="border-t border-white/8 px-5 py-4">{footer}</footer> : null}
      </aside>
    </div>,
    document.body
  )
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  busy = false,
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      {description ? <p className="text-sm leading-relaxed text-slate-300">{description}</p> : null}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose}>
          {cancelLabel}
        </Button>
        <Button
          variant={tone === 'danger' ? 'danger' : 'primary'}
          size="sm"
          loading={busy}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
