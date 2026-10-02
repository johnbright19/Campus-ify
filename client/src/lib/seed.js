import { CAMPUS } from './constants'
import { dayShift, dowOfWall, mulberry32, randInt, wallAt, wallNow, wallOf } from './utils'
import { DEFAULT_PRIORITY_CONFIG, scorePriority } from '../services/priority'

// ---------------------------------------------------------------------------
// Deterministic demo dataset.
//
// Mirrors the seed checklist in Plan.md §8: 10 resources, 6 users, a guaranteed
// clash, a pending request, a close-call pair, a waitlist entry, a student with
// two no-shows, and three weeks of history for the utilisation heatmap.
//
// Everything is generated relative to "today", so the demo is always fresh and
// identical on every machine (seeded PRNG).
// ---------------------------------------------------------------------------

// Bumped to 7 for the campus rename: cached snapshots embed CAMPUS.name in
// settings, so stale localStorage copies would keep showing the old college.
export const SCHEMA_VERSION = 8

const DEMO_TZ = CAMPUS.timezone

const USERS = [
  {
    id: 'usr_ieee',
    fullName: 'General Secretary',
    email: 'student.demo@campus.edu',
    role: 'student',
    department: 'IT',
    club: 'IEEE',
    accent: '#6d5ef8',
    noShowCount: 2,
    title: 'General Secretary · IEEE',
  },
  {
    id: 'usr_cultural',
    fullName: 'President',
    email: 'csi.lead@campus.edu',
    role: 'student',
    department: 'Computer Science',
    club: 'XIE-CSI Committee',
    accent: '#22d3ee',
    noShowCount: 0,
    title: 'President · CSI',
  },
  {
    id: 'usr_faculty',
    fullName: 'Dr. Sarah Faculty (Lab In-Charge)',
    email: 'faculty.demo@campus.edu',
    role: 'faculty',
    department: 'Computer Science',
    club: null,
    accent: '#34d399',
    noShowCount: 0,
    title: 'Associate Professor · CSE',
  },
  {
    id: 'usr_hod',
    fullName: 'Prof. Ramesh HOD',
    email: 'hod.demo@campus.edu',
    role: 'hod',
    department: 'Computer Science',
    club: null,
    accent: '#fbbf24',
    noShowCount: 0,
    title: 'Head of Department · CSE',
  },
  {
    id: 'usr_admin',
    fullName: 'Dr. Lata Ragha',
    email: 'principal@campus.edu',
    role: 'admin',
    department: 'Principal Office',
    club: null,
    accent: '#fb7185',
    noShowCount: 0,
    title: 'Principal',
  },
  {
    id: 'usr_robotics',
    fullName: 'President',
    email: 'tedx.org@campus.edu',
    role: 'student',
    department: 'Computer Science',
    club: 'TedX-XIE',
    accent: '#c084fc',
    noShowCount: 1,
    title: 'President · TEDx',
  },
  {
    id: 'usr_council',
    fullName: 'General Secretary',
    email: 'council.head@campus.edu',
    role: 'student',
    department: 'Computer Science',
    club: 'Student Council',
    accent: '#fbbf24',
    noShowCount: 0,
    title: 'General Secretary · Student Council',
  },
  {
    id: 'usr_wdc',
    fullName: 'General Secretary',
    email: 'wdc.lead@campus.edu',
    role: 'student',
    department: 'IT',
    club: 'Women Development Cell',
    accent: '#fb7185',
    noShowCount: 0,
    title: 'General Secretary · WDC',
  },
  {
    id: 'usr_alumni',
    fullName: 'General Secretary',
    email: 'alumni.rep@campus.edu',
    role: 'student',
    department: 'Computer Science',
    club: 'Alumni Cell',
    accent: '#34d399',
    noShowCount: 0,
    title: 'General Secretary · Alumni Cell',
  },
  {
    id: 'usr_hod_it',
    fullName: 'Prof. IT HOD',
    email: 'hod.it@campus.edu',
    role: 'hod',
    department: 'IT',
    club: null,
    accent: '#fbbf24',
    noShowCount: 0,
    title: 'Head of Department · IT',
  },
  {
    id: 'usr_hod_extc',
    fullName: 'Prof. EXTC HOD',
    email: 'hod.extc@campus.edu',
    role: 'hod',
    department: 'EXTC',
    club: null,
    accent: '#fbbf24',
    noShowCount: 0,
    title: 'Head of Department · EXTC',
  },
  {
    id: 'usr_hod_cse',
    fullName: 'Prof. CSE HOD',
    email: 'hod.cse@campus.edu',
    role: 'hod',
    department: 'CSE',
    club: null,
    accent: '#fbbf24',
    noShowCount: 0,
    title: 'Head of Department · CSE',
  },
  {
    id: 'usr_facilities_admin',
    fullName: 'Sports & Facilities Admin',
    email: 'admin.demo@campus.edu',
    role: 'admin',
    department: 'Administration',
    club: null,
    accent: '#fb7185',
    noShowCount: 0,
    title: 'Campus Operations Administrator',
  },
  {
    id: 'usr_office_admin',
    fullName: 'Campus Office',
    email: 'office@campus.edu',
    role: 'admin',
    department: 'Administration',
    club: null,
    accent: '#fb7185',
    noShowCount: 0,
    title: 'Campus Office Administrator',
  },
  {
    id: 'usr_staff',
    fullName: 'Support Staff / Lab Assistant',
    email: 'staff.demo@campus.edu',
    role: 'faculty',
    department: 'Support',
    club: null,
    accent: '#34d399',
    noShowCount: 0,
    title: 'Support Staff',
  },
]

const RESOURCES = [
  {
    id: 'res_hall_a',
    name: 'Seminar Hall A',
    type: 'seminar_hall',
    location: 'Block A · Level 2',
    capacity: 120,
    features: ['projector', 'ac', 'mic', 'sound_system', 'wifi', 'power_outlets'],
    requiresApproval: true,
    approverRole: 'hod',
    ownerDepartment: 'Computer Science',
  },
  {
    id: 'res_hall_b',
    name: 'Seminar Hall B',
    type: 'seminar_hall',
    location: 'Block A · Level 2',
    capacity: 80,
    features: ['projector', 'ac', 'whiteboard', 'wifi'],
    requiresApproval: true,
    approverRole: 'hod',
    ownerDepartment: 'EXTC',
  },
  {
    id: 'res_auditorium',
    name: 'Central Auditorium',
    type: 'auditorium',
    location: 'Central Block · Level 1',
    capacity: 500,
    features: ['projector', 'ac', 'mic', 'sound_system', 'stage', 'lighting', 'recording', 'wifi'],
    requiresApproval: true,
    approverRole: 'admin',
    ownerDepartment: 'Administration',
  },
  {
    id: 'res_lab_1',
    name: 'Computing Lab 1',
    type: 'lab',
    location: 'Block C · Level 1',
    capacity: 60,
    features: ['projector', 'ac', 'smartboard', 'wifi', 'power_outlets'],
    requiresApproval: true,
    approverRole: 'hod',
    ownerDepartment: 'Computer Science',
  },
  {
    id: 'res_lab_2',
    name: 'Computing Lab 2',
    type: 'lab',
    location: 'Block C · Level 1',
    capacity: 40,
    features: ['smartboard', 'ac', 'wifi', 'power_outlets'],
    requiresApproval: true,
    approverRole: 'hod',
    ownerDepartment: 'Computer Science',
  },
  {
    id: 'res_lab_3',
    name: 'Electronics Lab 3',
    type: 'lab',
    location: 'Block C · Level 2',
    capacity: 35,
    features: ['whiteboard', 'power_outlets', 'wifi'],
    requiresApproval: true,
    approverRole: 'hod',
    ownerDepartment: 'EXTC',
  },
  {
    id: 'res_room_101',
    name: 'Classroom 101',
    type: 'classroom',
    location: 'Block B · Level 1',
    capacity: 70,
    features: ['projector', 'whiteboard', 'wifi'],
    requiresApproval: false,
    approverRole: null,
    ownerDepartment: 'General',
  },
  {
    id: 'res_room_102',
    name: 'Classroom 102',
    type: 'classroom',
    location: 'Block B · Level 1',
    capacity: 70,
    features: ['whiteboard', 'wifi', 'power_outlets'],
    requiresApproval: false,
    approverRole: null,
    ownerDepartment: 'General',
  },
  {
    id: 'res_ground',
    name: 'Main Sports Ground',
    type: 'ground',
    location: 'North Campus',
    capacity: 300,
    features: ['lighting', 'parking'],
    requiresApproval: true,
    approverRole: 'hod',
    ownerDepartment: 'Physical Education',
  },
  {
    id: 'res_projector',
    name: 'Portable Projector Kit',
    type: 'equipment',
    location: 'AV Store · Block A',
    capacity: 0,
    features: ['projector'],
    requiresApproval: false,
    approverRole: null,
    ownerDepartment: 'AV Services',
  },
]

const HISTORY_TITLES = [
  ['Data Structures lecture', 'academic'],
  ['DBMS tutorial', 'academic'],
  ['Operating Systems lab', 'academic'],
  ['IEEE weekly stand-up', 'club'],
  ['Robotics build session', 'club'],
  ['Cultural rehearsal', 'fest'],
  ['Placement prep workshop', 'placement'],
  ['Semester tutorial — Networks', 'academic'],
  ['NSS volunteer briefing', 'club'],
  ['Yoga & wellness session', 'personal'],
  ['Alumni interaction', 'fest'],
  ['Machine learning clinic', 'academic'],
]

function iso(date) {
  return date.toISOString()
}

/**
 * Build a complete, self-consistent database snapshot.
 * @param {Date} [at] the instant to treat as "now"
 */
export function buildSeed(at = new Date()) {
  const today = wallNow(DEMO_TZ)
  const zero = at
  const rnd = mulberry32(20261002)
  const at_ = (dayOffset, hour, minute = 0) =>
    wallAt(dayShift(today, dayOffset, DEMO_TZ), hour, minute, DEMO_TZ)

  const profiles = USERS.map((u) => ({
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    role: u.role,
    department: u.department,
    club: u.club,
    accent: u.accent,
    title: u.title,
    noShowCount: u.noShowCount,
    createdAt: iso(at_(-120, 9)),
  }))

  const userById = Object.fromEntries(profiles.map((p) => [p.id, p]))

  const resources = RESOURCES.map((r, i) => ({
    ...r,
    isActive: true,
    createdAt: iso(at_(-100, 9)),
    order: i,
  }))

  const settings = {
    campusName: CAMPUS.name,
    timezone: DEMO_TZ,
    noShowGraceMin: 15,
    offerWindowMin: 30,
    approvalSlaHours: 24,
    remindersLeadMin: 30,
    priority: { ...DEFAULT_PRIORITY_CONFIG },
    workers: {
      autoReleaseNoShows: true,
      expireWaitlistOffers: true,
      sendReminders: true,
      escalateStaleApprovals: true,
      completeFinishedBookings: true,
      hoardingWatch: true,
      ambientActivity: true,
    },
    ai: {
      /** Demo-safety switch from Plan.md §6: the deterministic fallbacks are
       *  always available, so the product never dies on a model timeout. */
      llmDisabled: true,
      model: 'claude-sonnet (disabled in demo)',
      timeoutMs: 6000,
      retries: 1,
    },
  }

  const blackouts = [
    {
      id: 'blk_1',
      resourceId: 'res_hall_a',
      reason: 'AC servicing & AV upgrade',
      startTime: iso(at_(3, 9)),
      endTime: iso(at_(3, 12)),
      createdAt: iso(at_(-6, 10)),
    },
    {
      id: 'blk_2',
      resourceId: null,
      reason: "Founder's Day — campus wide closed",
      startTime: iso(at_(9, 8)),
      endTime: iso(at_(9, 18)),
      createdAt: iso(at_(-14, 10)),
    },
  ]

  // -------------------------------------------------------------------------
  // Bookings
  // -------------------------------------------------------------------------

  /** @type {Array<object>} */
  const bookings = []

  const add = (b) => {
    bookings.push({
      id: b.id,
      groupId: b.groupId ?? null,
      userId: b.userId,
      resourceId: b.resourceId,
      title: b.title,
      purpose: b.purpose ?? '',
      eventType: b.eventType ?? 'club',
      attendees: b.attendees ?? 10,
      startTime: iso(b.start),
      endTime: iso(b.end),
      status: b.status ?? 'pending',
      verified: Boolean(b.verified),
      priorityScore: 0,
      priorityBreakdown: {},
      aiMeta: b.aiMeta ?? {},
      source: b.source ?? 'web',
      checkedInAt: b.checkedInAt ? iso(b.checkedInAt) : null,
      qrToken: b.qrToken ?? null,
      createdAt: iso(b.createdAt ?? new Date(b.start.getTime() - 36 * 3600000)),
      updatedAt: iso(b.createdAt ?? new Date(b.start.getTime() - 36 * 3600000)),
    })
    return bookings[bookings.length - 1]
  }

  // --- 1. The guaranteed clash: Seminar Hall A, tomorrow 2–4 PM ------------
  add({
    id: 'bkg_clash',
    userId: 'usr_ieee',
    resourceId: 'res_hall_a',
    title: 'IEEE Techfest planning',
    purpose: 'Core committee review of the Techfest schedule and sponsor commitments.',
    eventType: 'club',
    attendees: 60,
    start: at_(1, 14),
    end: at_(1, 16),
    status: 'approved',
    source: 'concierge',
    createdAt: at_(-3, 11),
  })

  // --- 2. Pending request awaiting approval --------------------------------
  add({
    id: 'bkg_pending',
    userId: 'usr_faculty',
    resourceId: 'res_lab_2',
    title: 'Data Structures remedial lab',
    purpose: 'Extra session for students who missed the mid-term practical slot.',
    eventType: 'academic',
    attendees: 32,
    start: at_(2, 10),
    end: at_(2, 12),
    status: 'pending',
    source: 'web',
    createdAt: at_(-1, 16),
  })

  // --- 3. Close-call pair: two overlapping pending requests, 5 points apart -
  add({
    id: 'bkg_exam',
    userId: 'usr_faculty',
    resourceId: 'res_hall_a',
    title: 'Semester 5 Data Structures examination',
    purpose: 'University practical examination, 90 candidates, invigilator panel assigned.',
    eventType: 'exam',
    attendees: 90,
    start: at_(5, 10),
    end: at_(5, 13),
    status: 'pending',
    source: 'web',
    createdAt: at_(-2, 9, 20),
  })
  add({
    id: 'bkg_placement',
    userId: 'usr_hod',
    resourceId: 'res_hall_a',
    title: 'Infosys campus placement drive',
    purpose: 'Pre-placement talk followed by group discussions for 110 shortlisted students.',
    eventType: 'placement',
    attendees: 110,
    start: at_(5, 10, 30),
    end: at_(5, 13, 30),
    status: 'pending',
    source: 'concierge',
    createdAt: at_(-2, 9, 24),
  })

  // --- 4. A booking about to lapse (drives the no-show auto-release demo) --
  add({
    id: 'bkg_lapsing',
    userId: 'usr_robotics',
    resourceId: 'res_lab_3',
    title: 'Robotics soldering workshop',
    purpose: 'Hands-on session for the first-year intake.',
    eventType: 'club',
    attendees: 24,
    start: at_(0, 15),
    end: at_(0, 17),
    status: 'approved',
    checkedInAt: null,
    source: 'web',
    createdAt: at_(-4, 12),
  })

  // --- 5. Recently completed booking with a check-in -----------------------
  add({
    id: 'bkg_completed',
    userId: 'usr_cultural',
    resourceId: 'res_room_101',
    title: 'Cultural committee audition',
    purpose: 'Preliminary auditions for the annual day.',
    eventType: 'fest',
    attendees: 45,
    start: at_(-2, 16),
    end: at_(-2, 18),
    status: 'completed',
    checkedInAt: at_(-2, 15, 55),
    source: 'web',
    createdAt: at_(-7, 10),
  })

  // --- 6. The no-show that produced Aarav's penalty ------------------------
  add({
    id: 'bkg_noshow',
    userId: 'usr_ieee',
    resourceId: 'res_hall_b',
    title: 'IEEE membership drive',
    purpose: 'Recruitment desk for new members.',
    eventType: 'club',
    attendees: 30,
    start: at_(-9, 13),
    end: at_(-9, 15),
    status: 'no_show',
    source: 'web',
    createdAt: at_(-16, 11),
  })
  add({
    id: 'bkg_noshow_2',
    userId: 'usr_ieee',
    resourceId: 'res_room_102',
    title: 'IEEE poster review',
    purpose: 'Review of the poster designs for the fête.',
    eventType: 'club',
    attendees: 12,
    start: at_(-4, 11),
    end: at_(-4, 12),
    status: 'no_show',
    source: 'web',
    createdAt: at_(-11, 9),
  })

  // --- 7. Three weeks of history (heatmap / forecast / fairness) -----------
  const histUserIds = ['usr_ieee', 'usr_cultural', 'usr_robotics', 'usr_faculty', 'usr_hod']
  const markableResources = resources.filter((r) => r.type !== 'equipment')

  // Demand is not uniform: the flagship halls are fought over, the ground is
  // occasional. This is what makes the heatmap and the digest say something.
  const POPULARITY = {
    res_hall_a: 6,
    res_hall_b: 5,
    res_auditorium: 3,
    res_lab_1: 5,
    res_lab_2: 3,
    res_lab_3: 2,
    res_room_101: 4,
    res_room_102: 3,
    res_ground: 1,
  }

  let histSeq = 0
  for (let day = -21; day <= -1; day += 1) {
    const weekday = dowOfWall(wallOf(at_(day, 12), DEMO_TZ))
    const isWeekend = weekday === 0 || weekday === 6

    for (const resource of markableResources) {
      // Weekdays are busy and cluster in the prime 10:00–16:00 window, which is
      // exactly the pressure the heatmap and the digest talk about.
      const weight = POPULARITY[resource.id] ?? 2
      const load = isWeekend
        ? randInt(0, Math.max(1, Math.round(weight / 3)), rnd)
        : randInt(1, weight, rnd)
      for (let k = 0; k < load; k += 1) {
        const hour = isWeekend
          ? randInt(10, 15, rnd)
          : rnd() < 0.62
            ? randInt(10, 16, rnd)
            : randInt(8, 18, rnd)
        const start = at_(day, hour)
        const lengthH = randInt(1, 2, rnd)
        const end = new Date(start.getTime() + lengthH * 3600000)
        const [title, eventType] = HISTORY_TITLES[randInt(0, HISTORY_TITLES.length - 1, rnd)]
        const userId = histUserIds[randInt(0, histUserIds.length - 1, rnd)]
        const isNoShow = rnd() < 0.07
        histSeq += 1
        add({
          id: `bkg_hist_${histSeq}`,
          userId,
          resourceId: resource.id,
          title,
          purpose: '',
          eventType,
          attendees: randInt(12, Math.max(16, resource.capacity || 40), rnd),
          start,
          end,
          status: isNoShow ? 'no_show' : 'completed',
          checkedInAt: isNoShow ? null : new Date(start.getTime() - 5 * 60000),
          source: 'web',
          createdAt: new Date(start.getTime() - randInt(12, 200, rnd) * 3600000),
        })
      }
    }
  }

  // Score every booking now that history exists (fairness needs the full set).
  const fairnessSnapshot = bookings.map((b) => {
    const u = userById[b.userId]
    return {
      startTime: b.startTime,
      endTime: b.endTime,
      status: b.status,
      club: u?.club,
      department: u?.department,
      group: u?.club ?? u?.department,
    }
  })

  for (const b of bookings) {
    const user = userById[b.userId] ?? {}
    const { score, breakdown, notes } = scorePriority({
      user: {
        role: user.role,
        club: user.club,
        department: user.department,
        noShowCount: user.noShowCount,
      },
      eventType: b.eventType,
      verified: b.verified,
      start: b.startTime,
      now: zero,
      bookings: fairnessSnapshot,
      config: settings.priority,
    })
    b.priorityScore = score
    b.priorityBreakdown = breakdown
    b.aiMeta = { ...b.aiMeta, scoreNotes: notes }
    if (b.status === 'approved') b.qrToken = `qr.${b.id}.${hashToken(b.id)}`
  }

  // -------------------------------------------------------------------------
  // Waitlist — someone is already queuing for a lab
  // -------------------------------------------------------------------------
  const waitlist = [
    {
      id: 'wl_1',
      userId: 'usr_cultural',
      resourceId: 'res_lab_1',
      title: 'Cultural website build sprint',
      purpose: 'Volunteer team building the annual day website.',
      eventType: 'academic',
      attendees: 18,
      startTime: iso(at_(1, 9)),
      endTime: iso(at_(1, 11)),
      priorityScore: 0,
      status: 'waiting',
      offerExpiresAt: null,
      createdAt: iso(at_(-1, 18)),
    },
    {
      id: 'wl_2',
      userId: 'usr_robotics',
      resourceId: 'res_hall_a',
      title: 'Robotics showcase rehearsal',
      purpose: 'Full run-through before the inter-college showcase.',
      eventType: 'club',
      attendees: 40,
      startTime: iso(at_(1, 14)),
      endTime: iso(at_(1, 16)),
      priorityScore: 0,
      status: 'waiting',
      offerExpiresAt: null,
      createdAt: iso(at_(-1, 9)),
    },
  ]

  for (const w of waitlist) {
    const user = userById[w.userId] ?? {}
    const { score, breakdown } = scorePriority({
      user: {
        role: user.role,
        club: user.club,
        department: user.department,
        noShowCount: user.noShowCount,
      },
      eventType: w.eventType,
      start: w.startTime,
      now: zero,
      bookings: fairnessSnapshot,
      config: settings.priority,
    })
    w.priorityScore = score
    w.breakdown = breakdown
  }

  // -------------------------------------------------------------------------
  // Notifications, audit trail and worker log
  // -------------------------------------------------------------------------
  const notifications = [
    {
      id: 'ntf_1',
      userId: 'usr_ieee',
      title: 'Booking approved',
      body: 'IEEE Techfest planning is confirmed for Seminar Hall A tomorrow, 2:00–4:00 PM.',
      link: '/bookings',
      kind: 'success',
      isRead: false,
      createdAt: iso(at_(0, 9, 12)),
    },
    {
      id: 'ntf_2',
      userId: 'usr_ieee',
      title: 'No-show penalty applied',
      body: 'IEEE poster review was auto-released because nobody checked in. −5 priority points.',
      link: '/bookings',
      kind: 'warning',
      isRead: false,
      createdAt: iso(at_(-4, 13, 5)),
    },
    {
      id: 'ntf_3',
      userId: 'usr_robotics',
      title: 'Check-in window is open',
      body: 'Robotics soldering workshop starts at 3:00 PM. Check in to keep your slot.',
      link: '/bookings',
      kind: 'info',
      isRead: false,
      createdAt: iso(at_(0, 14, 30)),
    },
    {
      id: 'ntf_4',
      userId: 'usr_cultural',
      title: 'You are on the waitlist',
      body: 'Computing Lab 1 · tomorrow 9:00–11:00 AM. We will offer it the moment it frees up.',
      link: '/waitlist',
      kind: 'info',
      isRead: true,
      createdAt: iso(at_(-1, 18, 2)),
    },
    {
      id: 'ntf_5',
      userId: 'usr_faculty',
      title: 'Approval needed',
      body: 'Data Structures remedial lab is waiting for your decision.',
      link: '/approvals',
      kind: 'info',
      isRead: false,
      createdAt: iso(at_(-1, 16, 4)),
    },
  ]

  const auditLogs = [
    {
      id: 'aud_1',
      actorId: 'usr_hod',
      action: 'booking.approve',
      entity: 'booking',
      entityId: 'bkg_clash',
      details: { score: 0, note: 'Seed data' },
      createdAt: iso(at_(-3, 11, 30)),
    },
    {
      id: 'aud_2',
      actorId: null,
      action: 'worker.auto_release',
      entity: 'booking',
      entityId: 'bkg_noshow',
      details: { reason: 'No check-in within 15 minute grace window' },
      createdAt: iso(at_(-9, 13, 20)),
    },
    {
      id: 'aud_3',
      actorId: 'usr_admin',
      action: 'settings.update',
      entity: 'settings',
      entityId: null,
      details: { noShowGraceMin: 15, offerWindowMin: 30 },
      createdAt: iso(at_(-12, 9)),
    },
    {
      id: 'aud_4',
      actorId: 'usr_cultural',
      action: 'waitlist.join',
      entity: 'waitlist',
      entityId: 'wl_1',
      details: { resourceId: 'res_lab_1' },
      createdAt: iso(at_(-1, 18)),
    },
  ]

  const workerLog = [
    {
      id: 'wlog_seed_1',
      job: 'completeFinishedBookings',
      level: 'info',
      message: 'Marked 3 bookings completed · rolled fairness credit forward.',
      at: iso(at_(0, 8, 10)),
      count: 3,
    },
    {
      id: 'wlog_seed_2',
      job: 'hoardingWatch',
      level: 'warn',
      message: 'IEEE Student Chapter holds 11 future hours — above the 10 hour watch line.',
      at: iso(at_(0, 9, 0)),
      count: 1,
    },
  ]

  return {
    meta: {
      schemaVersion: SCHEMA_VERSION,
      seededAtMs: Date.now(),
      campus: CAMPUS.name,
    },
    clockOffsetMs: 0,
    session: null,
    settings,
    profiles,
    resources,
    blackouts,
    bookings,
    waitlist,
    approvals: [],
    notifications,
    auditLogs,
    aiRuns: [],
    workerLog,
    liveEvents: [],
  }
}

/** Cheap deterministic "signature" for seeded QR tokens. */
function hashToken(input) {
  let h = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** Demo accounts, exposed for the mock sign-in screen. */
export const DEMO_ACCOUNTS = USERS.map((u) => ({
  id: u.id,
  fullName: u.fullName,
  email: u.email,
  role: u.role,
  department: u.department,
  club: u.club,
  accent: u.accent,
  title: u.title,
}))

