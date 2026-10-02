/**
 * Facility Governance & Resource Allocation Policies
 * Defines who can request, who approves, maximum booking windows, and curfew limits.
 */

export const RESOURCE_POLICIES = {
  // Seminar Halls: Academic events, club fests, placement orientations
  seminar_hall: {
    maxDurationHours: 6,
    minAdvanceNoticeHours: 12,
    curfewHour: 21, // 9:00 PM
    allowedRoles: ['student', 'faculty', 'hod', 'admin'],
    approverRole: 'hod',
    approverTitle: 'Department Head / Academic Dean',
    requiresFacultyAdvisorForStudents: true,
    description: 'Requires HOD approval. Student clubs must provide event agenda.'
  },

  // TURF: Outdoor sports, athletic club practice, inter-college tournaments
  turf: {
    maxDurationHours: 2, // Anti-hoarding: 2 hours max per session
    minAdvanceNoticeHours: 2,
    curfewHour: 22, // 10:00 PM floodlight cutoff
    openingHour: 6,  // 6:00 AM
    allowedRoles: ['student', 'faculty', 'admin'],
    approverRole: 'admin',
    approverTitle: 'Sports Director / Athletics In-Charge',
    requiresFacultyAdvisorForStudents: false,
    description: 'Max 2 hours per booking. Floodlights operational till 10 PM.'
  },

  // ATL (Atal Tinkering Lab): Hardware prototyping, IoT, 3D printing, robotics
  atl_lab: {
    maxDurationHours: 4,
    minAdvanceNoticeHours: 6,
    curfewHour: 20, // 8:00 PM
    allowedRoles: ['student', 'faculty', 'hod', 'admin'],
    approverRole: 'faculty',
    approverTitle: 'ATL Innovation Coordinator / Lab In-Charge',
    requiresFacultyAdvisorForStudents: true,
    description: 'Hardware safety protocol required. Students must specify project scope.'
  },

  // Technical Labs (DB, IP, WDL, CC):
  db_lab: {
    maxDurationHours: 3,
    minAdvanceNoticeHours: 4,
    curfewHour: 19, // 7:00 PM
    allowedRoles: ['student', 'faculty', 'hod', 'admin'],
    approverRole: 'faculty',
    approverTitle: 'Database Systems Lab In-Charge',
    requiresFacultyAdvisorForStudents: false,
    description: 'DBMS servers access. Classes take precedence over open coding sessions.'
  },

  ip_lab: {
    maxDurationHours: 3,
    minAdvanceNoticeHours: 4,
    curfewHour: 19,
    allowedRoles: ['student', 'faculty', 'hod', 'admin'],
    approverRole: 'faculty',
    approverTitle: 'Image Processing & CV Lab In-Charge',
    requiresFacultyAdvisorForStudents: false,
    description: 'GPU workstations for computer vision & AI research.'
  },

  wdl_lab: {
    maxDurationHours: 3,
    minAdvanceNoticeHours: 4,
    curfewHour: 19,
    allowedRoles: ['student', 'faculty', 'hod', 'admin'],
    approverRole: 'faculty',
    approverTitle: 'Web Development Lab In-Charge',
    requiresFacultyAdvisorForStudents: false,
    description: 'Full-stack development environments and hackathon practice.'
  },

  cc_lab: {
    maxDurationHours: 4,
    minAdvanceNoticeHours: 8,
    curfewHour: 20,
    allowedRoles: ['student', 'faculty', 'hod', 'admin'],
    approverRole: 'hod',
    approverTitle: 'Central Computing Administrator / HOD',
    requiresFacultyAdvisorForStudents: false,
    description: 'Central campus cloud lab. High priority during recruitment placement drives.'
  },

  // Grand Auditorium: College fests, annual convocations
  auditorium: {
    maxDurationHours: 10,
    minAdvanceNoticeHours: 48,
    curfewHour: 22,
    allowedRoles: ['faculty', 'hod', 'admin'], // Students cannot book the auditorium directly
    approverRole: 'admin',
    approverTitle: 'Campus Principal & Central Administration',
    requiresFacultyAdvisorForStudents: true,
    description: 'Flagship auditorium. Requires institutional administrative clearance.'
  },

  // Equipment / Kits: Projectors, mics, cables
  equipment: {
    maxDurationHours: 8,
    minAdvanceNoticeHours: 1,
    curfewHour: 21,
    allowedRoles: ['student', 'faculty', 'hod', 'admin'],
    approverRole: 'faculty',
    approverTitle: 'IT Helpdesk Depot Manager',
    requiresFacultyAdvisorForStudents: false,
    description: 'Pickup from IT Helpdesk. Must be returned immediately post-session.'
  }
}

/**
 * Determine which policy applies to a given resource record
 */
export function getPolicyForResource(resource) {
  const name = (resource.name || '').toLowerCase()
  const type = (resource.type || '').toLowerCase()

  if (name.includes('turf') || name.includes('sports ground') || name.includes('ground')) {
    return RESOURCE_POLICIES.turf
  }
  if (name.includes('atl') || name.includes('tinkering') || name.includes('robotics')) {
    return RESOURCE_POLICIES.atl_lab
  }
  if (name.includes('db') || name.includes('database')) {
    return RESOURCE_POLICIES.db_lab
  }
  if (name.includes('ip') || name.includes('image processing') || name.includes('vision')) {
    return RESOURCE_POLICIES.ip_lab
  }
  if (name.includes('wdl') || name.includes('web development')) {
    return RESOURCE_POLICIES.wdl_lab
  }
  if (name.includes('cc') || name.includes('central computing') || name.includes('cloud')) {
    return RESOURCE_POLICIES.cc_lab
  }
  if (type === 'auditorium') {
    return RESOURCE_POLICIES.auditorium
  }
  if (type === 'seminar_hall') {
    return RESOURCE_POLICIES.seminar_hall
  }
  if (type === 'equipment') {
    return RESOURCE_POLICIES.equipment
  }

  // Default fallback policy
  return {
    maxDurationHours: 4,
    minAdvanceNoticeHours: 2,
    curfewHour: 21,
    allowedRoles: ['student', 'faculty', 'hod', 'admin'],
    approverRole: resource.approver_role || 'faculty',
    approverTitle: 'Facility Coordinator',
    requiresFacultyAdvisorForStudents: false,
    description: 'Standard campus facility booking rules apply.'
  }
}

/**
 * Validate a reservation request against the facility's governance policy
 *
 * @param {Object} params
 * @param {Object} params.resource
 * @param {Object} params.user
 * @param {string} params.start - ISO string
 * @param {string} params.end - ISO string
 * @returns {{ valid: boolean, error?: { code: string, message: string }, policy: Object }}
 */
export function validateFacilityPolicy({ resource, user, start, end }) {
  const policy = getPolicyForResource(resource)
  const userRole = user.role || 'student'

  // 1. Role Authorization Check
  if (!policy.allowedRoles.includes(userRole)) {
    return {
      valid: false,
      error: {
        code: 'ROLE_NOT_PERMITTED',
        message: `${resource.name} cannot be booked directly by a ${userRole}. Only [${policy.allowedRoles.join(', ')}] can submit requests for this venue.`
      },
      policy
    }
  }

  // 2. Duration Limit Check
  const startMs = new Date(start).getTime()
  const endMs = new Date(end).getTime()
  const durationHours = (endMs - startMs) / (1000 * 60 * 60)

  if (durationHours > policy.maxDurationHours) {
    return {
      valid: false,
      error: {
        code: 'MAX_DURATION_EXCEEDED',
        message: `Maximum allowed booking duration for ${resource.name} is ${policy.maxDurationHours} hours (Requested: ${durationHours.toFixed(1)} hrs).`
      },
      policy
    }
  }

  // 3. Operating Hours & Curfew Check
  const startDate = new Date(start)
  const endDate = new Date(end)
  const endHour = endDate.getHours() + endDate.getMinutes() / 60
  const startHour = startDate.getHours()

  if (policy.openingHour && startHour < policy.openingHour) {
    return {
      valid: false,
      error: {
        code: 'BEFORE_OPENING',
        message: `${resource.name} opens at ${policy.openingHour}:00 AM.`
      },
      policy
    }
  }

  if (endHour > policy.curfewHour) {
    return {
      valid: false,
      error: {
        code: 'CURFEW_EXCEEDED',
        message: `${resource.name} closes at ${policy.curfewHour}:00 PM. Bookings past this curfew are not permitted.`
      },
      policy
    }
  }

  return {
    valid: true,
    policy
  }
}
