const EVENT_SCORES = {
  exam: 100,
  placement: 90,
  academic: 80,
  fest: 60,
  club: 40,
  personal: 20
}

const ROLE_SCORES = {
  admin: 30,
  hod: 25,
  faculty: 20,
  student: 10
}

const OFFICIAL_COMMITTEES = [
  'Student Council',
  'XIE-CSI Committee',
  'Alumni Cell',
  'TedX-XIE',
  'IEEE',
  'IET',
  'Women Development Cell'
]

/**
 * Score priority deterministically with full transparent breakdown (Skill S2)
 *
 * @param {Object} params
 * @param {Object} params.user - Profile of the requester
 * @param {string} params.eventType - e.g. 'exam', 'placement', 'academic', 'fest', 'club', 'personal'
 * @param {boolean} [params.verified=false] - Whether an approver confirmed high-priority event
 * @param {string} params.start - ISO start time
 * @param {number} [params.fairnessBonus=0] - 0..15 bonus for underrepresented clubs/depts
 * @returns {{ score: number, breakdown: Object }}
 */
export async function scorePriority({ user = {}, eventType = 'club', verified = false, start, fairnessBonus = 0 }) {
  const base = EVENT_SCORES[eventType] ?? 20

  // High-priority claims (exam/placement) only receive full weight once verified
  const eventPts = (['exam', 'placement'].includes(eventType) && !verified)
    ? Math.min(base, 60)
    : base

  const rolePts = ROLE_SCORES[user.role] ?? 10

  const daysAhead = Math.max(0, Math.floor((new Date(start).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
  const advanceNotice = Math.min(daysAhead, 10)

  const noShowPenalty = -5 * Math.min(user.no_show_count ?? 0, 4)
  
  const committeeBonus = OFFICIAL_COMMITTEES.includes(user.club) ? 15 : 0

  const breakdown = {
    eventType: eventPts,
    role: rolePts,
    fairness: Math.max(0, Math.min(fairnessBonus, 15)),
    committeeBonus,
    advanceNotice,
    noShowPenalty
  }

  const score = Object.values(breakdown).reduce((acc, val) => acc + val, 0)

  return {
    score: Math.max(0, score),
    breakdown
  }
}
