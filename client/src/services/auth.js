import { getState, now, produce } from '../lib/store'
import { uid } from '../lib/utils'
import { commit, makeAudit } from './notifications'

// ---------------------------------------------------------------------------
// Auth.
//
// The real product signs in with Google through Supabase (Architecture.md §5).
// With no server we reproduce the *shape* of that flow — an OAuth handshake that
// yields a session token and a profile row — so the UI code that consumes the
// session is identical to production. Swapping in `supabase.auth.signInWithOAuth`
// becomes a two-line change in `signInWithGoogle`.
// ---------------------------------------------------------------------------

export const OAUTH_PROVIDER = 'google'

export function currentUser(db = getState()) {
  if (!db.session?.userId) return null
  return db.profiles.find((p) => p.id === db.session.userId) ?? null
}

export function isSignedIn(db = getState()) {
  return Boolean(db.session?.userId)
}

export function sessionInfo(db = getState()) {
  const user = currentUser(db)
  return { session: db.session, user }
}

/** Mirror of the Supabase session object the UI depends on. */
function makeSession(user, provider = OAUTH_PROVIDER) {
  const issuedAt = now()
  return {
    provider,
    userId: user.id,
    email: user.email,
    accessToken: `demo.${uid('jwt')}`,
    tokenType: 'bearer',
    issuedAt: issuedAt.toISOString(),
    expiresAt: new Date(issuedAt.getTime() + 3600_000).toISOString(),
  }
}

/**
 * Complete the "Sign in with Google" round trip for a demo account.
 * Emulates: consent → Google identity → Supabase session → profile row.
 */
export function signInWithGoogle({ userId, provider = OAUTH_PROVIDER }) {
  const db = getState()
  const user = db.profiles.find((p) => p.id === userId)
  if (!user) throw new Error('Unknown demo account')

  const session = makeSession(user, provider)
  commit('auth.signin', { session }, {
    audits: [makeAudit(user.id, 'auth.signin', 'profile', user.id, { provider })],
  })
  return session
}

/** Create a brand-new profile (the trigger in Build.md §3, by hand). */
export function createProfile({ fullName, email, role = 'student', department = '', club = '' }) {
  const db = getState()
  const exists = db.profiles.find((p) => p.email.toLowerCase() === email.toLowerCase())
  if (exists) return exists

  const profile = {
    id: uid('usr'),
    fullName,
    email,
    role,
    department,
    club,
    accent: '#6d5ef8',
    title: role === 'student' ? 'New member' : 'Staff',
    noShowCount: 0,
    createdAt: now().toISOString(),
  }
  commit('auth.profile', { profiles: [...db.profiles, profile], session: makeSession(profile) }, {
    audits: [makeAudit(profile.id, 'auth.signup', 'profile', profile.id, { email })],
  })
  return profile
}

export function signOut() {
  const db = getState()
  const user = currentUser(db)
  produce('auth.signout', (d) => ({ ...d, session: null }))
  if (user) {
    commit('auth.signout.audit', {}, {
      audits: [makeAudit(user.id, 'auth.signout', 'profile', user.id, {})],
    })
  }
  return true
}

/** Admin/demo helper: re-role an account (only admins in the real app). */
export function setRole(userId, role, actorId) {
  const db = getState()
  const actor = db.profiles.find((p) => p.id === actorId)
  if (actor && actor.role !== 'admin') throw new Error('Only administrators can change roles')
  commit(
    'auth.role',
    { profiles: db.profiles.map((p) => (p.id === userId ? { ...p, role } : p)) },
    { audits: [makeAudit(actorId, 'profile.role_change', 'profile', userId, { role })] }
  )
}

export function updateProfile(userId, patch) {
  const db = getState()
  commit(
    'auth.profile.update',
    { profiles: db.profiles.map((p) => (p.id === userId ? { ...p, ...patch } : p)) },
    { audits: [makeAudit(userId, 'profile.update', 'profile', userId, patch)] }
  )
}
