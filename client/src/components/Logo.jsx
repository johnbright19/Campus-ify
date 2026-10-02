import { cn } from '../lib/utils'
import { CAMPUS } from '../lib/constants'

export function LogoMark({ size = 36, className }) {
  return (
    <span
      className={cn('relative inline-flex shrink-0 items-center justify-center rounded-xl', className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
        <defs>
          <linearGradient id="cf-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#8b7cff" />
            <stop offset="100%" stopColor="#6d5ef8" />
          </linearGradient>
        </defs>
        <rect width="40" height="40" rx="11" fill="url(#cf-grad)" />
        <path d="M20 8l12 6.5L20 21 8 14.5 20 8z" fill="#ffffff" />
        <path
          d="M11 18.5V25l9 5 9-5v-6.5l-9 5-9-5z"
          fill="#38e0f0"
          fillOpacity="0.92"
        />
        <circle cx="31.5" cy="27.5" r="2.6" fill="#34d399" />
      </svg>
    </span>
  )
}

export function Logo({ compact = false, className }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark size={compact ? 30 : 36} />
      {!compact ? (
        <span className="leading-tight">
          <span className="block text-[15px] font-bold tracking-tight text-white">
            Campus<span className="text-brand-300">-ify</span>
          </span>
          <span className="block text-[10.5px] font-medium tracking-[0.1em] text-slate-500 uppercase">
            {CAMPUS.short} ops
          </span>
        </span>
      ) : null}
    </span>
  )
}
