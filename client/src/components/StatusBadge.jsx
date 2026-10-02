import {
  Ban,
  CalendarCheck,
  CircleDashed,
  CircleSlash,
  Clock,
  Hourglass,
  TicketCheck,
  TriangleAlert,
  Undo2,
} from 'lucide-react'
import { BOOKING_STATUS, WAITLIST_STATUS } from '../lib/constants'
import { Badge } from './ui/primitives'

const BOOKING_ICONS = {
  pending: Clock,
  approved: CalendarCheck,
  rejected: Ban,
  cancelled: Undo2,
  completed: TicketCheck,
  no_show: TriangleAlert,
}

const WAITLIST_ICONS = {
  waiting: Hourglass,
  offered: CircleDashed,
  confirmed: TicketCheck,
  expired: CircleSlash,
  cancelled: Undo2,
}

export function StatusBadge({ status, kind = 'booking', className, showIcon = true }) {
  const table = kind === 'waitlist' ? WAITLIST_STATUS : BOOKING_STATUS
  const meta = table[status] ?? { label: status, tone: 'slate' }
  const Icon = (kind === 'waitlist' ? WAITLIST_ICONS : BOOKING_ICONS)[status]

  return (
    <Badge tone={meta.tone} className={className} icon={showIcon && Icon ? Icon : undefined}>
      {meta.label}
    </Badge>
  )
}

export function statusMeta(status, kind = 'booking') {
  return (kind === 'waitlist' ? WAITLIST_STATUS : BOOKING_STATUS)[status] ?? { label: status, tone: 'slate' }
}
