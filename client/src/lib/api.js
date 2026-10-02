// ---------------------------------------------------------------------------
// API client for the Express backend in B2B_Resource/server.
//
// The app used to run entirely on the in-browser seed. This module is the seam:
// components keep reading `useDb()`, and this file is what turns that into real
// HTTP. The backend stores snake_case; the UI is camelCase end to end, so every
// row is mapped at the boundary and nothing downstream has to know about it.
// ---------------------------------------------------------------------------

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'
const TOKEN_KEY = 'campusify:api-token'

/** Use a seeded profile email when available so demo roles resolve to the right person. */
export const tokenForRole = (roleOrProfile) => {
  if (roleOrProfile && typeof roleOrProfile === 'object' && roleOrProfile.email) {
    return `demo-${encodeURIComponent(roleOrProfile.email)}`
  }
  return `demo-${roleOrProfile || 'student'}`
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || null
  } catch {
    return null
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* private mode — the session simply won't survive a reload */
  }
}

export class ApiError extends Error {
  constructor(status, payload) {
    super(payload?.error?.message || `Request failed (${status})`)
    this.status = status
    this.code = payload?.error?.code || 'UNKNOWN'
    this.payload = payload ?? {}
  }
}

export async function apiFetch(path, { method = 'GET', body, query, token } = {}) {
  const url = new URL(`${API_BASE}${path}`, window.location.origin)
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  }

  const bearer = token ?? getToken()
  const res = await fetch(url.toString().replace(window.location.origin, ''), {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    ...(method === 'GET' || method === 'HEAD'
      ? {}
      : { body: body ? JSON.stringify(body) : undefined }),
  })

  const text = await res.text()
  const payload = text ? JSON.parse(text) : null
  if (!res.ok) throw new ApiError(res.status, payload)
  return payload
}

/* ---------------------------------------------------------------------------
 * Row mappers — snake_case (Postgres) -> camelCase (UI)
 * ------------------------------------------------------------------------- */

export const mapProfile = (row) => ({
  id: row.id,
  fullName: row.full_name ?? row.email?.split('@')[0] ?? 'Unknown',
  email: row.email,
  avatarUrl: row.avatar_url ?? null,
  role: row.role,
  department: row.department ?? '',
  club: row.club ?? '',
  noShowCount: row.no_show_count ?? 0,
  title: row.title ?? null,
  accent: '#6d5ef8',
  createdAt: row.created_at ?? null,
  serverBacked: true,
})

export const mapResource = (row) => ({
  id: row.id,
  name: row.name,
  type: row.type,
  location: row.location ?? '',
  capacity: row.capacity ?? 0,
  features: Array.isArray(row.features) ? row.features : [],
  requiresApproval: row.requires_approval ?? true,
  approverRole: row.approver_role ?? 'hod',
  ownerDepartment: row.owner_department ?? '',
  isActive: row.is_active ?? true,
  createdAt: row.created_at ?? null,
  serverBacked: true,
})

export const mapBooking = (row) => ({
  id: row.id,
  groupId: row.group_id ?? null,
  userId: row.user_id,
  resourceId: row.resource_id,
  title: row.title,
  purpose: row.purpose ?? '',
  eventType: row.event_type ?? 'club',
  attendees: row.attendees ?? 0,
  startTime: row.start_time,
  endTime: row.end_time,
  status: row.status,
  verified: Boolean(row.verified),
  priorityScore: Number(row.priority_score ?? 0),
  priorityBreakdown: row.priority_breakdown ?? {},
  aiMeta: row.ai_meta ?? {},
  qrToken: row.qr_token ?? null,
  checkedInAt: row.checked_in_at ?? null,
  createdAt: row.created_at ?? null,
  updatedAt: row.created_at ?? null,
  // Denormalised from the join so a grid row can render without a second fetch.
  resourceName: row.resources?.name ?? null,
  resourceType: row.resources?.type ?? null,
  serverBacked: true,
})

export const mapWaitlistEntry = (row) => ({
  id: row.id,
  userId: row.user_id,
  resourceId: row.resource_id,
  title: row.title ?? 'Waitlisted slot',
  eventType: row.event_type ?? 'club',
  startTime: row.start_time,
  endTime: row.end_time,
  priorityScore: Number(row.priority_score ?? 0),
  breakdown: {},
  status: row.status,
  offerExpiresAt: row.offer_expires_at ?? null,
  createdAt: row.created_at,
  resourceName: row.resources?.name ?? null,
  serverBacked: true,
})

export const mapNotification = (row) => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  body: row.body,
  link: row.link ?? '/',
  // The server has no notion of toast tone; the UI derives it from the title.
  kind: 'info',
  isRead: Boolean(row.is_read),
  createdAt: row.created_at,
})

/* ---------------------------------------------------------------------------
 * Endpoint helpers
 * ------------------------------------------------------------------------- */

export const api = {
  me: (options) => apiFetch('/me', options),
  resources: () => apiFetch('/resources'),
  profiles: () => apiFetch('/profiles'),
  profileForRole: (role) => apiFetch(`/profiles/directory/${role}`),
  calendar: ({ from, to, resourceId, status } = {}) =>
    apiFetch('/bookings/calendar', { query: { from, to, resourceId, status } }),
  myBookings: () => apiFetch('/bookings/mine'),
  notifications: () => apiFetch('/notifications'),
  waitlist: () => apiFetch('/waitlist'),
  joinWaitlist: (payload) => apiFetch('/bookings/waitlist', { method: 'POST', body: payload }),
  leaveWaitlist: (id) => apiFetch(`/waitlist/${id}`, { method: 'DELETE' }),
  confirmWaitlistOffer: (id) => apiFetch(`/bookings/waitlist/${id}/confirm`, { method: 'POST' }),
  markNotificationRead: (id) => apiFetch(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllNotificationsRead: () => apiFetch('/notifications/read-all', { method: 'POST' }),
  createBooking: (payload) => apiFetch('/bookings', { method: 'POST', body: payload }),
  cancelBooking: (id) => apiFetch(`/bookings/${id}/cancel`, { method: 'POST' }),
  approveBooking: (id, verified = false) =>
    apiFetch(`/bookings/${id}/approve`, { method: 'PATCH', body: { verified } }),
  rejectBooking: (id, reason) =>
    apiFetch(`/bookings/${id}/reject`, { method: 'PATCH', body: { reason } }),
  availability: (resourceId, start, end) =>
    apiFetch(`/resources/${resourceId}/availability`, { query: { start, end } }),
}