import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Compass, Home } from 'lucide-react'
import { useAuth } from './app/AuthProvider'
import { AppShell } from './app/AppShell'
import { ProtectedRoute } from './app/ProtectedRoute'
import { Button, EmptyState } from './components/ui/primitives'

import LandingPage from './features/landing/LandingPage'
import LoginPage from './features/auth/LoginPage'
import DashboardPage from './features/dashboard/DashboardPage'
import ResourceExplorer from './features/resources/ResourceExplorer'
import WeekCalendar from './features/calendar/WeekCalendar'
import BookingForm from './features/booking/BookingForm'
import MyBookings from './features/bookings/MyBookings'
import WaitlistPage from './features/waitlist/WaitlistPage'
import ApprovalsInbox from './features/approvals/ApprovalsInbox'
import MediatorPage from './features/approvals/MediatorPage'
import AdminDashboard from './features/admin/AdminDashboard'
import AuditPage from './features/admin/AuditPage'
import SettingsPage from './features/admin/SettingsPage'
import ProfilePage from './features/profile/ProfilePage'

// ---------------------------------------------------------------------------
// Routing.
//
// Mirrors the role matrix in Plan.md §1: everyone gets the explorer, calendar
// and booking; approvers get the inbox; HODs and admins get the mediator desk;
// admins get operations, the audit trail and settings.
// ---------------------------------------------------------------------------

function LoginRoute() {
  const { isAuthenticated } = useAuth()
  const location = useLocation()
  if (isAuthenticated) return <Navigate to={location.state?.from || '/dashboard'} replace />
  return <LoginPage />
}

function NotFound() {
  const navigate = useNavigate()
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <EmptyState
        icon={Compass}
        title="That console does not exist"
        description="The route you followed is not part of this build. Head back to the overview and pick a console from the sidebar."
        action={
          <Button leftIcon={Home} onClick={() => navigate('/dashboard')}>
            Back to overview
          </Button>
        }
      />
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginRoute />} />

      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/explore" element={<ResourceExplorer />} />
        <Route path="/calendar" element={<WeekCalendar />} />
        <Route path="/book" element={<BookingForm />} />
        <Route path="/bookings" element={<MyBookings />} />
        <Route path="/waitlist" element={<WaitlistPage />} />
        <Route path="/profile" element={<ProfilePage />} />

        <Route
          path="/approvals"
          element={
            <ProtectedRoute roles={['faculty', 'hod', 'admin']}>
              <ApprovalsInbox />
            </ProtectedRoute>
          }
        />
        <Route
          path="/mediator"
          element={
            <ProtectedRoute roles={['hod', 'admin']}>
              <MediatorPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={['admin']}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/audit"
          element={
            <ProtectedRoute roles={['hod', 'admin']}>
              <AuditPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute roles={['admin']}>
              <SettingsPage />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
