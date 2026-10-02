import { cn } from '../../lib/utils'

export function Card({ as: Tag = 'div', hover = false, pad = true, glow = false, className, children, ...props }) {
  return (
    <Tag
      className={cn(
        'card',
        hover && 'card-hover',
        pad && 'card-pad',
        glow && 'shadow-glow',
        className
      )}
      {...props}
    >
      {children}
    </Tag>
  )
}

export function CardHeader({ title, subtitle, icon: Icon, action, className, eyebrow, accent = 'brand' }) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? (
          <span
            className={cn(
              'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border',
              accent === 'brand' && 'border-brand-400/25 bg-brand-500/12 text-brand-300',
              accent === 'aqua' && 'border-aqua-400/25 bg-aqua-400/12 text-aqua-400',
              accent === 'mint' && 'border-mint-400/25 bg-mint-400/12 text-mint-400',
              accent === 'amber' && 'border-amber-450/25 bg-amber-450/12 text-amber-450',
              accent === 'rose' && 'border-rose-450/25 bg-rose-450/12 text-rose-450'
            )}
          >
            <Icon className="size-4.5" />
          </span>
        ) : null}
        <div className="min-w-0">
          {eyebrow ? <p className="eyebrow mb-1">{eyebrow}</p> : null}
          {title ? <h3 className="truncate text-[15px] font-semibold text-white">{title}</h3> : null}
          {subtitle ? <p className="mt-0.5 text-[12.5px] leading-snug text-slate-400">{subtitle}</p> : null}
        </div>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  )
}

export function CardBody({ className, children }) {
  return <div className={cn('mt-4', className)}>{children}</div>
}

export function CardFooter({ className, children }) {
  return (
    <div className={cn('mt-4 flex items-center justify-between gap-3 border-t border-white/6 pt-4', className)}>
      {children}
    </div>
  )
}

export function Panel({ className, children, ...props }) {
  return (
    <div className={cn('surface-sunken p-4', className)} {...props}>
      {children}
    </div>
  )
}

export function SectionTitle({ title, subtitle, action, icon: Icon, className }) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-end justify-between gap-3', className)}>
      <div>
        <h2 className="h-title flex items-center gap-2">
          {Icon ? <Icon className="size-5 text-brand-300" /> : null}
          {title}
        </h2>
        {subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  )
}

export function KpiGrid({ className, children }) {
  return <div className={cn('grid gap-4 sm:grid-cols-2 xl:grid-cols-4', className)}>{children}</div>
}
