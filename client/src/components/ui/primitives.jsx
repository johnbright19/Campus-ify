import { forwardRef } from 'react'
import { AlertCircle, Check, Loader2 } from 'lucide-react'
import { cn, initials } from '../../lib/utils'
import { TONE_CHIP, TONE_DOT, TONE_TEXT } from '../../lib/constants'

// ---------------------------------------------------------------------------
// Primitives. Small, boring, reusable — the visual language lives in index.css
// so components stay declarative.
// ---------------------------------------------------------------------------

const BUTTON_VARIANTS = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
  success: 'btn-success',
}

const BUTTON_SIZES = {
  sm: 'px-3 py-1.5 text-[12.5px] rounded-lg',
  md: '',
  lg: 'px-5 py-3 text-[15px] rounded-2xl',
}

export const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    className,
    loading = false,
    disabled = false,
    leftIcon: Left,
    rightIcon: Right,
    children,
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        BUTTON_VARIANTS[variant] ?? BUTTON_VARIANTS.primary,
        BUTTON_SIZES[size],
        'relative',
        className
      )}
      {...props}
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : Left ? (
        <Left className="size-4 shrink-0" />
      ) : null}
      {children}
      {Right && !loading ? <Right className="size-4 shrink-0" /> : null}
    </button>
  )
})

export const IconButton = forwardRef(function IconButton(
  { label, className, children, tone = 'default', ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'icon-btn',
        tone === 'danger' && 'hover:border-rose-450/40 hover:bg-rose-500/14 hover:text-rose-200',
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
})

export function Field({ label, hint, error, required, children, className, htmlFor }) {
  return (
    <div className={cn('min-w-0', className)}>
      {label ? (
        <label className="field-label" htmlFor={htmlFor}>
          {label}
          {required ? <span className="ml-1 text-brand-300">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-[12px] font-medium text-rose-450">
          <AlertCircle className="size-3.5 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[12px] text-slate-500">{hint}</p>
      ) : null}
    </div>
  )
}

export const Input = forwardRef(function Input({ className, invalid, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn('field', invalid && 'border-rose-500/60 focus:ring-rose-500/15', className)}
      {...props}
    />
  )
})

export const Textarea = forwardRef(function Textarea({ className, rows = 3, ...props }, ref) {
  return <textarea ref={ref} rows={rows} className={cn('field resize-none', className)} {...props} />
})

export const Select = forwardRef(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cn('field cursor-pointer pr-8', className)} {...props}>
      {children}
    </select>
  )
})

export function Switch({ checked, onChange, label, description, disabled, className }) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3',
        disabled && 'cursor-not-allowed opacity-55',
        className
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors duration-200',
          checked
            ? 'border-brand-400/60 bg-brand-500/80'
            : 'border-white/12 bg-white/8 hover:bg-white/12'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-3.5 rounded-full bg-white shadow transition-all duration-200',
            checked ? 'left-[18px]' : 'left-0.5'
          )}
        />
      </button>
      {label || description ? (
        <span className="min-w-0">
          {label ? <span className="block text-sm font-medium text-slate-200">{label}</span> : null}
          {description ? (
            <span className="mt-0.5 block text-[12px] leading-snug text-slate-500">{description}</span>
          ) : null}
        </span>
      ) : null}
    </label>
  )
}

export function Checkbox({ checked, onChange, label, className }) {
  return (
    <label className={cn('flex cursor-pointer items-center gap-2.5 text-sm', className)}>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          'flex size-4.5 items-center justify-center rounded-[6px] border transition',
          checked
            ? 'border-brand-400 bg-brand-500 text-white'
            : 'border-white/16 bg-white/5 hover:border-white/30'
        )}
      >
        {checked ? <Check className="size-3" strokeWidth={3} /> : null}
      </button>
      {label ? <span className="text-slate-300">{label}</span> : null}
    </label>
  )
}

export function Badge({ tone = 'slate', className, children, dot = false, icon: Icon }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide',
        TONE_CHIP[tone] ?? TONE_CHIP.slate,
        className
      )}
    >
      {dot ? <span className={cn('size-1.5 rounded-full', TONE_DOT[tone] ?? TONE_DOT.slate)} /> : null}
      {Icon ? <Icon className="size-3" /> : null}
      {children}
    </span>
  )
}

export function Chip({ className, children, active, onClick, icon: Icon }) {
  const Tag = onClick ? 'button' : 'span'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition',
        active
          ? 'border-brand-400/50 bg-brand-500/18 text-brand-200'
          : 'border-white/10 bg-white/5 text-slate-400',
        onClick && 'hover:border-white/22 hover:text-white',
        className
      )}
    >
      {Icon ? <Icon className="size-3" /> : null}
      {children}
    </Tag>
  )
}

export function Avatar({ name, accent = '#6d5ef8', size = 36, className, ring = false }) {
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white',
        ring && 'ring-2 ring-ink-950',
        className
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `linear-gradient(140deg, ${accent}, ${accent}90)`,
        boxShadow: `0 8px 22px -12px ${accent}`,
      }}
    >
      {initials(name)}
    </span>
  )
}

export function Progress({ value = 0, max = 100, tone = 'brand', className, thin = false }) {
  const pct = max ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  const gradients = {
    brand: 'from-brand-500 to-brand-300',
    mint: 'from-mint-500 to-mint-400',
    amber: 'from-amber-500 to-amber-450',
    rose: 'from-rose-500 to-rose-450',
    aqua: 'from-aqua-500 to-aqua-300',
    slate: 'from-slate-600 to-slate-400',
  }
  return (
    <div
      className={cn('w-full overflow-hidden rounded-full bg-white/8', thin ? 'h-1' : 'h-1.5')}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn('h-full rounded-full bg-gradient-to-r transition-all duration-500', gradients[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function Skeleton({ className }) {
  return <div className={cn('skeleton', className)} />
}

export function Spinner({ className, label = 'Loading' }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-slate-400', className)}>
      <Loader2 className="size-4 animate-spin" />
      <span className="text-sm">{label}</span>
    </span>
  )
}

export function Segmented({ options = [], value, onChange, className, size = 'md' }) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-xl border border-white/10 bg-ink-950/60 p-1',
        className
      )}
      role="tablist"
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative inline-flex items-center gap-1.5 rounded-lg font-medium transition-all duration-200',
              size === 'sm' ? 'px-2.5 py-1 text-[11.5px]' : 'px-3 py-1.5 text-[12.5px]',
              active
                ? 'bg-gradient-to-br from-brand-500/90 to-brand-600/90 text-white shadow-[0_8px_20px_-12px_rgb(109_94_248)]'
                : 'text-slate-400 hover:bg-white/6 hover:text-white'
            )}
          >
            {option.icon ? <option.icon className="size-3.5" /> : null}
            {option.label}
            {option.count != null ? (
              <span
                className={cn(
                  'num rounded-full px-1.5 text-[10px] font-semibold',
                  active ? 'bg-white/22 text-white' : 'bg-white/8 text-slate-400'
                )}
              >
                {option.count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

export function Tooltip({ content, children, side = 'top', className }) {
  return (
    <span className={cn('group/tt relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-50 hidden max-w-64 rounded-lg border border-white/12 bg-ink-800/97 px-2.5 py-1.5 text-[11.5px] font-medium text-slate-200 shadow-xl backdrop-blur group-hover/tt:block',
          side === 'top' && 'bottom-full left-1/2 mb-2 -translate-x-1/2',
          side === 'right' && 'top-1/2 left-full ml-2 -translate-y-1/2',
          side === 'bottom' && 'top-full left-1/2 mt-2 -translate-x-1/2'
        )}
      >
        {content}
      </span>
    </span>
  )
}

export function Kbd({ children }) {
  return <kbd className="kbd">{children}</kbd>
}

export function EmptyState({ icon: Icon, title, description, action, className, compact = false }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/12 bg-white/[0.02] text-center',
        compact ? 'gap-2 px-6 py-8' : 'gap-3 px-8 py-14',
        className
      )}
    >
      {Icon ? (
        <span className="mb-1 flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-brand-300">
          <Icon className="size-5" />
        </span>
      ) : null}
      <p className="text-[15px] font-semibold text-white">{title}</p>
      {description ? <p className="max-w-md text-sm text-slate-400">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

export function InlineStat({ label, value, tone = 'slate', className }) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="text-[10.5px] font-semibold tracking-[0.14em] text-slate-500 uppercase">{label}</p>
      <p className={cn('num mt-0.5 text-sm font-semibold', TONE_TEXT[tone] ?? TONE_TEXT.slate)}>
        {value}
      </p>
    </div>
  )
}
