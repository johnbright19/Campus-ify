import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useDb } from '../lib/query'
import { currentUser, setRole, signInWithGoogle, signOut as signOutService, updateProfile } from '../services/auth'
import { disconnect, isServerMode, linkSession, serverStatus, startLiveSync, stopLiveSync } from '../lib/sync'

const AuthContext = createContext(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/**
 * Session context. The shape mirrors what Supabase's onAuthStateChange gives
 * us in production, so feature code never needs to know this is mocked.
 *
 * Signing in now does two things: it builds the local session exactly as before,
 * then links it to the matching row in Postgres via the API. From that moment
 * the store is mirrored from the backend and polled, so a booking created in
 * another tab appears without a reload.
 */
export function AuthProvider({ children }) {
  const db = useDb()
  const user = currentUser(db)
  const [linking, setLinking] = useState(false)
  const [linkError, setLinkError] = useState(null)

  const signIn = useCallback(async (userId) => {
    const session = signInWithGoogle({ userId })
    const account = db.profiles.find((p) => p.id === userId)
    setLinking(true)
    setLinkError(null)
    try {
      const linked = await linkSession(account ?? 'student')
      return { session, linked: linked.profile }
    } catch (error) {
      // The backend being down must not block the demo from opening; we keep the
      // local session and simply stay on seed data.
      setLinkError(error.message)
      return { session, linked: null }
    } finally {
      setLinking(false)
    }
  }, [db.profiles])

  const signOut = useCallback(() => {
    stopLiveSync()
    disconnect()
    return signOutService()
  }, [])

  // Keep polling for the lifetime of the session.
  useEffect(() => {
    if (user?.id) startLiveSync()
    return stopLiveSync
  }, [user?.id])

  const value = useMemo(
    () => ({
      user,
      session: db.session,
      isAuthenticated: Boolean(user),
      role: user?.role ?? null,
      isAdmin: user?.role === 'admin',
      canApprove: ['faculty', 'hod', 'admin'].includes(user?.role),
      canResolve: ['hod', 'admin'].includes(user?.role),
      signIn,
      signOut,
      setRole: (targetId, role) => setRole(targetId, role, user?.id),
      updateProfile: (patch) => updateProfile(user?.id, patch),
      provider: db.session?.provider ?? null,
      linking,
      linkError,
      server: serverStatus(db),
      isServerMode: isServerMode(),
    }),
    [user, db.session, db.server, signIn, signOut, linking, linkError]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}