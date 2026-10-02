import { cn } from '../lib/utils'
import { ROLE_LABEL, ROLE_RANK } from '../lib/constants'
import { Avatar } from './ui/primitives'

export function UserChip({ user, size = 34, showMeta = true, roleBadge = true, className, trailing }) {
  if (!user) return null

  return (
    <span className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <Avatar name={user.fullName} accent={user.accent} size={size} />
      {showMeta ? (
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[13.5px] font-semibold text-white">{user.fullName}</span>
            {roleBadge ? (
              <span
                className={cn(
                  'shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide',
                  ROLE_RANK[user.role] >= 2
                    ? 'border-amber-450/30 bg-amber-450/12 text-amber-450'
                    : ROLE_RANK[user.role] === 1
                      ? 'border-mint-400/30 bg-mint-400/12 text-mint-400'
                      : 'border-aqua-400/30 bg-aqua-400/12 text-aqua-400'
                )}
              >
                {ROLE_LABEL[user.role] ?? user.role}
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block truncate text-[11.5px] text-slate-500">
            {user.club || user.department || user.email}
          </span>
        </span>
      ) : null}
      {trailing}
    </span>
  )
}

export function PresenceDot({ className }) {
  return (
    <span className={cn('relative flex size-2.5', className)}>
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-mint-400 opacity-60" />
      <span className="relative inline-flex size-2.5 rounded-full bg-mint-400" />
    </span>
  )
}
