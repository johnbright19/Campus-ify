// ---------------------------------------------------------------------------
// Domain vocabulary — single source of truth for enums, weights and labels.
// Kept free of React so both services and UI can import it.
// ---------------------------------------------------------------------------

export const CAMPUS = {
  name: "Xavier's Institute of Engineering",
  short: 'XIE',
  tagline: 'Campus Resource Booking & Conflict Resolution',
  timezone: 'Asia/Kolkata',
  zoneLabel: 'IST (Asia/Kolkata)',
}

export const ROLES = [
  { value: 'student', label: 'Student', blurb: 'Book rooms, join waitlists, track requests' },
  { value: 'faculty', label: 'Faculty', blurb: 'Book academic spaces and approve requests' },
  { value: 'hod', label: 'Head of Department', blurb: 'Approve departmental resources, resolve clashes' },
  { value: 'admin', label: 'Administrator', blurb: 'Full control, analytics and automation' },
]

export const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.value, r.label]))
export const ROLE_RANK = { student: 0, faculty: 1, hod: 2, admin: 3 }

/** Anyone at this rank or above can decide on a request. */
export const APPROVER_ROLES = ['faculty', 'hod', 'admin']

export const RESOURCE_TYPES = [
  { value: 'seminar_hall', label: 'Seminar Hall', short: 'Hall', accent: '#6d5ef8' },
  { value: 'lab', label: 'Laboratory', short: 'Lab', accent: '#22d3ee' },
  { value: 'classroom', label: 'Classroom', short: 'Class', accent: '#34d399' },
  { value: 'auditorium', label: 'Auditorium', short: 'Aud', accent: '#c084fc' },
  { value: 'ground', label: 'Ground / Field', short: 'Ground', accent: '#fbbf24' },
  { value: 'equipment', label: 'Equipment', short: 'Equip', accent: '#fb7185' },
]

export const RESOURCE_TYPE_LABEL = Object.fromEntries(
  RESOURCE_TYPES.map((t) => [t.value, t.label])
)

export const FEATURES = [
  'projector',
  'ac',
  'mic',
  'sound_system',
  'whiteboard',
  'smartboard',
  'wifi',
  'power_outlets',
  'recording',
  'stage',
  'lighting',
  'parking',
]

export const FEATURE_LABELS = {
  projector: 'Projector',
  ac: 'Air conditioning',
  mic: 'Microphone',
  sound_system: 'Sound system',
  whiteboard: 'Whiteboard',
  smartboard: 'Smart board',
  wifi: 'Wi-Fi',
  power_outlets: 'Power outlets',
  recording: 'Recording rig',
  stage: 'Stage',
  lighting: 'Stage lighting',
  parking: 'Parking',
}

export const EVENT_TYPES = [
  {
    value: 'exam',
    label: 'Examination',
    weight: 100,
    verifiedOnly: true,
    accent: '#f43f5e',
    description: 'University or department examination. Needs approver verification.',
  },
  {
    value: 'placement',
    label: 'Placement drive',
    weight: 90,
    verifiedOnly: true,
    accent: '#c084fc',
    description: 'Recruiter visit or placement activity. Needs approver verification.',
  },
  { value: 'academic', label: 'Academic session', weight: 80, accent: '#6d5ef8' },
  { value: 'fest', label: 'Fest / cultural', weight: 60, accent: '#f59e0b' },
  { value: 'club', label: 'Club meeting', weight: 40, accent: '#22d3ee' },
  { value: 'personal', label: 'Personal / other', weight: 20, accent: '#94a3b8' },
]

export const EVENT_WEIGHTS = Object.fromEntries(EVENT_TYPES.map((e) => [e.value, e.weight]))
export const EVENT_LABEL = Object.fromEntries(EVENT_TYPES.map((e) => [e.value, e.label]))
export const EVENT_ACCENT = Object.fromEntries(EVENT_TYPES.map((e) => [e.value, e.accent]))
export const HIGH_PRIORITY_EVENTS = EVENT_TYPES.filter((e) => e.verifiedOnly).map((e) => e.value)

export const ROLE_WEIGHTS = { admin: 30, hod: 25, faculty: 20, student: 10 }

export const BOOKING_STATUS = {
  pending: { label: 'Pending', tone: 'amber', hint: 'Waiting for an approver' },
  approved: { label: 'Approved', tone: 'mint', hint: 'Confirmed — slot is locked' },
  rejected: { label: 'Rejected', tone: 'rose', hint: 'Declined by an approver' },
  cancelled: { label: 'Cancelled', tone: 'slate', hint: 'Released by the requester' },
  completed: { label: 'Completed', tone: 'brand', hint: 'Finished successfully' },
  no_show: { label: 'No-show', tone: 'rose', hint: 'Auto-released — nobody checked in' },
}

export const WAITLIST_STATUS = {
  waiting: { label: 'Waiting', tone: 'slate' },
  offered: { label: 'Offer open', tone: 'amber' },
  confirmed: { label: 'Claimed', tone: 'mint' },
  expired: { label: 'Expired', tone: 'rose' },
  cancelled: { label: 'Withdrawn', tone: 'slate' },
}

export const TONE_TEXT = {
  brand: 'text-brand-300',
  mint: 'text-mint-400',
  amber: 'text-amber-450',
  rose: 'text-rose-450',
  aqua: 'text-aqua-400',
  slate: 'text-slate-400',
}

export const TONE_CHIP = {
  brand: 'border-brand-400/30 bg-brand-500/12 text-brand-300',
  mint: 'border-mint-400/30 bg-mint-400/12 text-mint-400',
  amber: 'border-amber-450/30 bg-amber-450/12 text-amber-450',
  rose: 'border-rose-450/30 bg-rose-450/12 text-rose-450',
  aqua: 'border-aqua-400/30 bg-aqua-400/12 text-aqua-400',
  slate: 'border-white/12 bg-white/6 text-slate-400',
}

export const TONE_DOT = {
  brand: 'bg-brand-400',
  mint: 'bg-mint-400',
  amber: 'bg-amber-450',
  rose: 'bg-rose-450',
  aqua: 'bg-aqua-400',
  slate: 'bg-slate-500',
}

export const TONE_BAR = {
  brand: 'from-brand-500 to-brand-400',
  mint: 'from-mint-500 to-mint-400',
  amber: 'from-amber-500 to-amber-450',
  rose: 'from-rose-500 to-rose-450',
  aqua: 'from-aqua-500 to-aqua-400',
  slate: 'from-slate-600 to-slate-500',
}

/** Priority breakdown factor labels, in the order they should be shown. */
export const SCORE_FACTORS = [
  { key: 'eventType', label: 'Event type', hint: 'Weight of the declared purpose' },
  { key: 'role', label: 'Requester role', hint: 'Standing of the requester' },
  { key: 'fairness', label: 'Fairness bonus', hint: 'Rewards groups with fewer hours this month' },
  { key: 'advanceNotice', label: 'Advance notice', hint: 'Planning ahead pays off' },
  { key: 'noShowPenalty', label: 'No-show penalty', hint: 'Cost of past abandonments' },
]

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const HOUR_LABELS = Array.from({ length: 15 }, (_, i) => i + 7) // 07:00 → 21:00

export const WORKER_JOBS = [
  {
    name: 'autoReleaseNoShows',
    label: 'No-show auto-release',
    cadence: 'every 1 min',
    description: 'Frees unchecked bookings after the grace window and promotes the waitlist.',
    ai: false,
  },
  {
    name: 'expireWaitlistOffers',
    label: 'Expire waitlist offers',
    cadence: 'every 1 min',
    description: 'Closes stale offers and rolls them to the next person in line.',
    ai: false,
  },
  {
    name: 'sendReminders',
    label: 'Booking reminders',
    cadence: 'every 5 min',
    description: 'Nudges organisers 30 minutes before start with a check-in QR.',
    ai: false,
  },
  {
    name: 'escalateStaleApprovals',
    label: 'Escalate stale approvals',
    cadence: 'every 15 min',
    description: 'Approaches breaching SLA are escalated to the next approver.',
    ai: true,
  },
  {
    name: 'completeFinishedBookings',
    label: 'Complete finished bookings',
    cadence: 'every 10 min',
    description: 'Marks past checked-in bookings complete and rolls up fairness credit.',
    ai: false,
  },
  {
    name: 'hoardingWatch',
    label: 'Hoarding watch',
    cadence: 'hourly',
    description: 'Flags unusual reservation volume, cancel rates and prime-slot grabs.',
    ai: true,
  },
  {
    name: 'dailyInsightsDigest',
    label: 'Daily insights digest',
    cadence: '08:00 daily',
    description: 'Generates a plain-language utilisation report for administrators.',
    ai: true,
  },
  {
    name: 'ambientActivity',
    label: 'Live campus simulation',
    cadence: 'continuous',
    description: 'Simulates other people booking, so the live feed has something to show.',
    ai: false,
  },
]

export const NAV_ITEMS = [
  { to: '/dashboard', label: 'Overview', icon: 'LayoutDashboard', roles: ['student', 'faculty', 'hod', 'admin'] },
  { to: '/explore', label: 'Explore', icon: 'Compass', roles: ['student', 'faculty', 'hod', 'admin'] },
  { to: '/calendar', label: 'Live calendar', icon: 'CalendarDays', roles: ['student', 'faculty', 'hod', 'admin'] },
  { to: '/book', label: 'New booking', icon: 'PlusCircle', roles: ['student', 'faculty', 'hod', 'admin'] },
  { to: '/bookings', label: 'My bookings', icon: 'Ticket', roles: ['student', 'faculty', 'hod', 'admin'] },
  { to: '/waitlist', label: 'Waitlist', icon: 'Hourglass', roles: ['student', 'faculty', 'hod', 'admin'] },
  { to: '/approvals', label: 'Approvals', icon: 'Inbox', roles: ['faculty', 'hod', 'admin'], badge: 'pendingApprovals' },
  { to: '/mediator', label: 'Mediator desk', icon: 'Scale', roles: ['hod', 'admin'], badge: 'closeCalls' },
  { to: '/admin', label: 'Operations', icon: 'Activity', roles: ['admin'] },
  { to: '/audit', label: 'Audit trail', icon: 'ScrollText', roles: ['hod', 'admin'] },
  { to: '/settings', label: 'Settings', icon: 'SlidersHorizontal', roles: ['admin'] },
]
