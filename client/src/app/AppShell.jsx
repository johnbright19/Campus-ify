import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Activity,
  Bell,
  CalendarDays,
  ChevronDown,
  Compass,
  Command,
  FastForward,
  Hourglass,
  Inbox,
  LayoutDashboard,
  FileText,
  LogOut,
  Menu,
  PlusCircle,
  RotateCcw,
  Scale,
  ScrollText,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Ticket,
  Timer,
  UserRound,
  X,
} from 'lucide-react'
import { cn, fmtDayShort, fmtTime } from '../lib/utils'
import { useDb, useNow } from '../lib/query'
import { CAMPUS, NAV_ITEMS } from '../lib/constants'
import { useAuth } from './AuthProvider'
import { useToast } from './ToastProvider'
import { clockOffset, onEvent, resetDatabase, setClockOffset } from '../lib/store'
import { signInWithGoogle } from '../services/auth'
import { closeCallQueue, pendingForApprover } from '../services/bookings'
import { Logo } from '../components/Logo'
import { CommandPalette } from '../components/CommandPalette'
import { NotificationCenter } from '../features/notifications/NotificationCenter'
import { isAcceptanceNotification } from '../lib/sync'
import { ChatDock } from '../features/assistant/ChatDock'
import { Avatar, Badge, IconButton, Kbd, Tooltip } from '../components/ui/primitives'

const NAV_ICONS = {
  LayoutDashboard,
  Compass,
  CalendarDays,
  PlusCircle,
  Ticket,
  Hourglass,
  Inbox,
  Scale,
  Activity,
  ScrollText,
  SlidersHorizontal,
}

function useClickOutside(ref, handler, active = true) {
  useEffect(() => {
    if (!active) return undefined
    const onDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) handler()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [ref, handler, active])
}

/* ---------------------------------------------------------------------------
 * Realtime bridge
 *
 * In production Supabase Realtime pushes rows to subscribed clients. Here the
 * store bus does — and we surface anything addressed to *this* user as a toast,
 * so a second browser tab visibly reacts to the first one.
 * ------------------------------------------------------------------------- */

function RealtimeBridge() {
  const { user } = useAuth()
  const { push } = useToast()

  useEffect(() => {
    if (!user) return undefined
    return onEvent((event) => {
      if (event?.type !== 'notification') return
      if (event.notification?.userId !== user.id) return
      push({
        title: event.notification.title,
        body: event.notification.body,
        kind: event.notification.kind,
      })
    })
  }, [user, push])

  return null
}

/* ---------------------------------------------------------------------------
 * Demo clock
 *
 * The single control that makes the automation demonstrable on stage: moving
 * this forward makes countdowns, offer expiry and the no-show sweep all fire.
 * ------------------------------------------------------------------------- */

function DemoClock({ compact = false, className }) {
  const db = useDb()
  const nowInstant = useNow(1000)
  const offsetMin = Math.round(clockOffset() / 60000)

  return (
    <div
      className={cn(
        'rounded-xl border border-white/8 bg-ink-950/60 p-3',
        compact ? 'space-y-2' : 'space-y-2.5',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[10.5px] font-semibold tracking-[0.13em] text-slate-500 uppercase">
          <Timer className="size-3" />
          Campus clock
        </span>
        {offsetMin > 0 ? (
          <Badge tone="amber" dot>
            +{offsetMin}m
          </Badge>
        ) : (
          <span className="flex items-center gap-1 text-[10.5px] font-medium text-mint-400">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-mint-400 opacity-60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-mint-400" />
            </span>
            live
          </span>
        )}
      </div>
      <p className="num text-lg leading-none font-semibold tracking-tight text-white">
        {fmtTime(nowInstant, db.settings.timezone)}
      </p>
      <p className="text-[11px] text-slate-500">
        {fmtDayShort(nowInstant, db.settings.timezone)} · {CAMPUS.zoneLabel}
      </p>
      <div className="flex items-center gap-1.5 pt-0.5">
        <Tooltip content="Advance 15 minutes — enough to lapse a check-in window">
          <IconButton
            label="Advance 15 minutes"
            className="size-7"
            onClick={() => setClockOffset(clockOffset() + 15 * 60000)}
          >
            <FastForward className="size-3.5" />
          </IconButton>
        </Tooltip>
        <Tooltip content="Advance 2 hours — pushes upcoming sessions into the past">
          <button
            type="button"
            onClick={() => setClockOffset(clockOffset() + 2 * 3600000)}
            className="btn-secondary h-7 rounded-lg px-2 text-[11px]"
          >
            +2h
          </button>
        </Tooltip>
        <Tooltip content="Back to real time">
          <IconButton label="Reset clock" className="size-7" onClick={() => setClockOffset(0)}>
            <RotateCcw className="size-3.5" />
          </IconButton>
        </Tooltip>
        {!compact ? (
          <Tooltip content="Reseed every table (you stay signed in)">
            <IconButton
              label="Reset demo data"
              className="ml-auto size-7"
              onClick={() => {
                const userId = db.session?.userId
                resetDatabase()
                if (userId) signInWithGoogle({ userId })
              }}
            >
              <Sparkles className="size-3.5" />
            </IconButton>
          </Tooltip>
        ) : null}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Sidebar
 * ------------------------------------------------------------------------- */

function SidebarContent({ items, user, onNavigate, onClose }) {
  const { signOut } = useAuth()

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden p-4">
      <div className="flex items-center justify-between gap-2 px-1">
        <Logo />
        {onClose ? (
          <IconButton label="Close navigation" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        ) : null}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto pr-1">
        {items.map(({ item, badge }) => {
          const Icon = NAV_ICONS[item.icon] ?? Compass
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={({ isActive }) => cn('nav-link', isActive && 'nav-link-active')}
            >
              <Icon className="size-4.5 shrink-0" />
              <span className="flex-1 truncate">{item.label}</span>
              {badge ? (
                <span className="num rounded-full border border-brand-400/35 bg-brand-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-brand-200">
                  {badge}
                </span>
              ) : null}
            </NavLink>
          )
        })}
      </nav>

      <DemoClock />

      <div className="flex items-center gap-2.5 rounded-xl border border-white/8 bg-white/3 p-2.5">
        <Avatar name={user?.fullName} accent={user?.accent} size={34} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-semibold text-white">{user?.fullName}</p>
          <p className="truncate text-[11px] text-slate-500">{user?.email}</p>
        </div>
        <Tooltip content="Sign out">
          <IconButton label="Sign out" className="size-8" onClick={() => signOut()}>
            <LogOut className="size-3.5" />
          </IconButton>
        </Tooltip>
      </div>

      <p className="px-1 text-[10.5px] leading-relaxed text-slate-600">
        Demo build · no backend. Every engine (conflicts, priority, waitlist, automation)
        runs in the browser with the deterministic AI fallbacks enabled.
      </p>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Topbar
 * ------------------------------------------------------------------------- */

function ProfileMenu({ onNavigate }) {
  const { user, role, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useClickOutside(ref, () => setOpen(false), open)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/4 py-1.5 pr-2.5 pl-1.5 transition hover:border-white/18 hover:bg-white/8"
      >
        <Avatar name={user?.fullName} accent={user?.accent} size={26} />
        <span className="hidden text-[12.5px] font-medium text-slate-200 sm:block">
          {user?.fullName?.split(' ')[0]}
        </span>
        <ChevronDown className={cn('size-3.5 text-slate-500 transition', open && 'rotate-180')} />
      </button>

      {open ? (
        <div className="card absolute top-full right-0 z-50 mt-2 w-64 p-3">
          <div className="flex items-start gap-2.5">
            <Avatar name={user?.fullName} accent={user?.accent} size={38} />
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-semibold text-white">{user?.fullName}</p>
              <p className="truncate text-[11.5px] text-slate-500">{user?.email}</p>
              <Badge tone="brand" className="mt-1.5">
                {role}
              </Badge>
            </div>
          </div>
          <div className="mt-3 space-y-0.5 border-t border-white/8 pt-2">
            {[
              { label: 'My profile', icon: UserRound, to: '/profile' },
              { label: 'My bookings', icon: Ticket, to: '/bookings' },
              { label: 'Audit trail', icon: FileText, to: '/audit', roles: ['hod', 'admin'] },
              { label: 'Settings', icon: Settings2, to: '/settings', roles: ['admin'] },
            ]
              .filter((link) => !link.roles || link.roles.includes(role))
              .map((link) => (
                <button
                  key={link.to}
                  type="button"
                  onClick={() => {
                    onNavigate(link.to)
                    setOpen(false)
                  }}
                  className="nav-link w-full"
                >
                  <link.icon className="size-4" />
                  {link.label}
                </button>
              ))}
            <button type="button" onClick={() => signOut()} className="nav-link w-full text-rose-450 hover:bg-rose-500/10 hover:text-rose-300">
              <LogOut className="size-4" />
              Sign out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Shell
 * ------------------------------------------------------------------------- */

export function AppShell() {
  const db = useDb()
  const { user, role } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const bellRef = useRef(null)

  useClickOutside(bellRef, () => setBellOpen(false), bellOpen)
  useEffect(() => setSidebarOpen(false), [location.pathname])

  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const unread = useMemo(
    () => db.notifications.filter(
      (n) => n.userId === user?.id && !n.isRead && isAcceptanceNotification(n)
    ).length,
    [db.notifications, user?.id]
  )

  const badges = useMemo(() => {
    if (!user) return {}
    const pending = ['faculty', 'hod', 'admin'].includes(user.role)
      ? pendingForApprover(user.id, db).length
      : 0
    const closeCalls = ['hod', 'admin'].includes(user.role) ? closeCallQueue(db, user.id).length : 0
    return { pendingApprovals: pending, closeCalls }
  }, [db, user])

  const navItems = useMemo(
    () =>
      NAV_ITEMS.filter((item) => item.roles.includes(role)).map((item) => ({
        item,
        badge: item.badge ? badges[item.badge] || null : null,
      })),
    [role, badges]
  )

  const currentTitle = useMemo(
    () => NAV_ITEMS.find((item) => location.pathname.startsWith(item.to))?.label ?? 'Overview',
    [location.pathname]
  )

  const nowInstant = useNow(1000)

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-[268px] shrink-0 border-r border-white/8 bg-ink-900/55 backdrop-blur-xl lg:block">
        <SidebarContent items={navItems} user={user} />
      </aside>

      {/* Mobile sidebar */}
      {sidebarOpen ? (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <div className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="relative h-full w-[280px] border-r border-white/10 bg-ink-900/97 backdrop-blur-2xl">
            <SidebarContent
              items={navItems}
              user={user}
              onNavigate={() => setSidebarOpen(false)}
              onClose={() => setSidebarOpen(false)}
            />
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-white/8 bg-ink-950/72 backdrop-blur-xl">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
            <IconButton label="Open navigation" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="size-4" />
            </IconButton>

            <div className="min-w-0 flex-1">
              <p className="eyebrow hidden sm:block">{CAMPUS.name}</p>
              <h1 className="truncate text-[15px] font-semibold text-white sm:text-base">{currentTitle}</h1>
            </div>

            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="hidden items-center gap-2.5 rounded-xl border border-white/10 bg-white/4 px-3 py-2 text-[12.5px] text-slate-400 transition hover:border-white/20 hover:text-white md:flex"
            >
              <Command className="size-3.5" />
              <span>Search &amp; commands</span>
              <span className="flex items-center gap-1">
                <Kbd>⌘</Kbd>
                <Kbd>K</Kbd>
              </span>
            </button>
            <IconButton label="Command palette" className="md:hidden" onClick={() => setPaletteOpen(true)}>
              <Command className="size-4" />
            </IconButton>

            <Tooltip content={`Simulated clock · ${fmtTime(nowInstant, db.settings.timezone)}`}>
              <span className="hidden items-center gap-1.5 rounded-xl border border-white/8 bg-white/4 px-2.5 py-2 xl:flex">
                <Timer className="size-3.5 text-brand-300" />
                <span className="num text-[12px] font-semibold text-slate-300">
                  {fmtTime(nowInstant, db.settings.timezone)}
                </span>
                {clockOffset() > 0 ? <Badge tone="amber">warped</Badge> : null}
              </span>
            </Tooltip>

            <div ref={bellRef} className="relative">
              <button
                type="button"
                onClick={() => setBellOpen((v) => !v)}
                aria-label="Notifications"
                className="icon-btn relative"
              >
                <Bell className="size-4" />
                {unread ? (
                  <span className="absolute -top-1 -right-1 flex min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                    {unread > 9 ? '9+' : unread}
                  </span>
                ) : null}
              </button>
              {bellOpen ? (
                <div className="absolute top-full right-0 z-50 mt-2">
                  <NotificationCenter onClose={() => setBellOpen(false)} />
                </div>
              ) : null}
            </div>

            <ProfileMenu
              onNavigate={(to) => {
                navigate(to)
                setBellOpen(false)
              }}
            />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>

        <footer className="border-t border-white/6 px-4 py-4 text-[11px] text-slate-600 sm:px-6">
          <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-2">
            <span>
              {CAMPUS.name} · {CAMPUS.tagline}
            </span>
            <span className="num">
              deterministic core · AI on top · every path has a fallback
            </span>
          </div>
        </footer>
      </div>

      <ChatDock />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <RealtimeBridge />
    </div>
  )
}
