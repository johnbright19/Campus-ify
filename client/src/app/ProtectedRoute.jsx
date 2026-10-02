import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { ROLE_RANK } from '../lib/constants'
import { Button, EmptyState } from '../components/ui/primitives'
import { ShieldAlert } from 'lucide-react'

/**
 * Route guard. Mirrors the server middleware in Build.md §4: no session →
 * sign-in page; insufficient role → a clear "not allowed" state rather than a
 * blank screen.
 */
export function ProtectedRoute({ children, minRole = null, roles = null, redirectTo = '/login' }) {
  const { isAuthenticated, user } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to={redirectTo} replace state={{ from: location.pathname }} />
  }

  const permitted = (() => {
    if (roles) return roles.includes(user.role)
    if (minRole) return (ROLE_RANK[user.role] ?? 0) >= (ROLE_RANK[minRole] ?? 0)
    return true
  })()

  if (!permitted) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <EmptyState
          icon={ShieldAlert}
          title="You do not have access to this console"
          description={`This area is restricted to ${roles ? roles.join(', ') : minRole} accounts. Sign in with an approver or administrator account to continue.`}
          action={
            <Button variant="secondary" onClick={() => window.history.back()}>
              Go back
            </Button>
          }
        />
      </div>
    )
  }

  return children
}
