import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BadgeCheck,
  Ban,
  BellOff,
  CircleAlert,
  Hourglass,
  Info,
  MailCheck,
  TriangleAlert,
} from 'lucide-react'
import { cn, fmtRelative } from '../../lib/utils'
import { useDb, useNow } from '../../lib/query'
import { useAuth } from '../../app/AuthProvider'
import { isAcceptanceNotification } from '../../lib/sync'
import { clearNotifications, markAllRead, markNotificationRead } from '../../services/notifications'
import { Button, EmptyState, Tooltip } from '../../components/ui/primitives'

const KIND_META = {
  success: { icon: BadgeCheck, tone: 'text-mint-400', ring: 'border-mint-400/25 bg-mint-400/10' },
  warning: { icon: TriangleAlert, tone: 'text-amber-450', ring: 'border-amber-450/25 bg-amber-450/10' },
  conflict: { icon: Ban, tone: 'text-rose-450', ring: 'border-rose-450/25 bg-rose-450/10' },
  offer: { icon: Hourglass, tone: 'text-brand-300', ring: 'border-brand-400/25 bg-brand-500/10' },
  info: { icon: Info, tone: 'text-aqua-400', ring: 'border-aqua-400/25 bg-aqua-400/10' },
  error: { icon: CircleAlert, tone: 'text-rose-450', ring: 'border-rose-450/25 bg-rose-450/10' },
}

/**
 * The notification feed. In production these rows arrive over Supabase Realtime
 * on `notifications` (Architecture.md §6); here the store bus plays that role.
 */
export function NotificationCenter({ onClose }) {
  const db = useDb()
  const { user } = useAuth()
  const navigate = useNavigate()
  const nowInstant = useNow(30000)

  const items = useMemo(
    () =>
      db.notifications
        .filter((n) => n.userId === user?.id && isAcceptanceNotification(n))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 30),
    [db.notifications, user?.id]
  )

  const unread = items.filter((n) => !n.isRead).length

  if (!user) return null

  return (
    <div className="card w-full overflow-hidden p-0 sm:w-[26rem]">
      <header className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
        <div>
          <p className="text-[13.5px] font-semibold text-white">Notifications</p>
          <p className="text-[11.5px] text-slate-500">
            {unread ? `${unread} unread` : 'All caught up'}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {unread ? (
            <Tooltip content="Mark every notification as read">
              <Button variant="ghost" size="sm" leftIcon={MailCheck} onClick={() => markAllRead(user.id)}>
                Read all
              </Button>
            </Tooltip>
          ) : null}
          {items.length ? (
            <Button variant="ghost" size="sm" onClick={() => clearNotifications(user.id)}>
              Clear
            </Button>
          ) : null}
        </div>
      </header>

      <div className="max-h-[26rem] overflow-y-auto">
        {items.length === 0 ? (
          <EmptyState
            compact
            icon={BellOff}
            title="Nothing yet"
            description="A notification will appear here when a booking is accepted."
          />
        ) : (
          <ul className="divide-y divide-white/6">
            {items.map((item) => {
              const meta = KIND_META[item.kind] ?? KIND_META.info
              const Icon = meta.icon
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      markNotificationRead(item.id)
                      if (item.link) navigate(item.link)
                      onClose?.()
                    }}
                    className={cn(
                      'flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-white/4',
                      !item.isRead && 'bg-brand-500/6'
                    )}
                  >
                    <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl border', meta.ring)}>
                      <Icon className={cn('size-4', meta.tone)} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span
                          className={cn(
                            'truncate text-[13px] font-semibold',
                            item.isRead ? 'text-slate-300' : 'text-white'
                          )}
                        >
                          {item.title}
                        </span>
                        <span className="shrink-0 text-[10.5px] whitespace-nowrap text-slate-500">
                          {fmtRelative(item.createdAt, nowInstant, db.settings.timezone)}
                        </span>
                      </span>
                      {item.body ? (
                        <span className="mt-0.5 block text-[12px] leading-snug text-slate-400">
                          {item.body}
                        </span>
                      ) : null}
                    </span>
                    {!item.isRead ? (
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-400" />
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
