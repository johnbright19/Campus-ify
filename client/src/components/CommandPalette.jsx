import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  Activity,
  CalendarClock,
  Command,
  CornerDownLeft,
  FastForward,
  Hourglass,
  Inbox,
  LogOut,
  Play,
  Radar,
  RotateCcw,
  Scale,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import { cn, prefersReducedMotion } from '../lib/utils'
import { gsap, useGSAP } from '../lib/gsap'
import { NAV_ITEMS } from '../lib/constants'
import { signInWithGoogle } from '../services/auth'
import { useDb } from '../lib/query'
import { useAuth } from '../app/AuthProvider'
import { useToast } from '../app/ToastProvider'
import { resetDatabase, setClockOffset } from '../lib/store'
import { runAllJobs, runJob, setWorkerEnabled } from '../services/workers'
import { Kbd } from './ui/primitives'

function fuzzy(needle, haystack) {
  const n = needle.toLowerCase()
  const h = haystack.toLowerCase()
  if (!n) return true
  if (h.includes(n)) return true
  let i = 0
  for (const ch of h) {
    if (ch === n[i]) i += 1
    if (i === n.length) return true
  }
  return false
}

export function CommandPalette({ open, onClose }) {
  const navigate = useNavigate()
  const db = useDb()
  const { user, signOut } = useAuth()
  const { push } = useToast()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const commands = useMemo(() => {
    const role = user?.role ?? 'student'
    const nav = NAV_ITEMS.filter((item) => item.roles.includes(role)).map((item) => ({
      id: `nav:${item.to}`,
      group: 'Navigate',
      label: item.label,
      hint: item.to,
      icon: Radar,
      run: () => navigate(item.to),
    }))

    const ambientOn = db.settings.workers.ambientActivity !== false
    const offsetMin = Math.round((db.clockOffsetMs || 0) / 60000)

    const actions = [
      {
        id: 'action:sweep',
        group: 'Operations',
        label: 'Run no-show sweep now',
        hint: 'autoReleaseNoShows',
        icon: Play,
        run: () => {
          const result = runJob('autoReleaseNoShows')
          push({ title: 'Sweep complete', body: result?.message, kind: 'ai' })
        },
      },
      {
        id: 'action:jobs',
        group: 'Operations',
        label: 'Run every automation job',
        hint: 'Ops Automator',
        icon: Activity,
        run: () => {
          const results = runAllJobs()
          push({
            title: `Ran ${results.length} jobs`,
            body: 'Automation log updated in Operations.',
            kind: 'ai',
          })
          navigate('/admin')
        },
      },
      {
        id: 'action:ambient',
        group: 'Operations',
        label: ambientOn ? 'Pause live campus simulation' : 'Resume live campus simulation',
        hint: 'ambientActivity',
        icon: Sparkles,
        run: () => {
          setWorkerEnabled('ambientActivity', !ambientOn)
          push({
            title: ambientOn ? 'Simulation paused' : 'Simulation resumed',
            body: 'Other people booking will stop or resume appearing on the calendar.',
            kind: 'info',
          })
        },
      },
      {
        id: 'action:warp',
        group: 'Demo',
        label: 'Fast-forward 2 hours',
        hint: offsetMin ? `${offsetMin} min ahead already` : 'trigger the workers',
        icon: FastForward,
        run: () => {
          setClockOffset((db.clockOffsetMs || 0) + 2 * 3600000)
          push({
            title: 'Clock moved +2 h',
            body: 'Countdowns, offers and the no-show sweep now read the new time.',
            kind: 'warning',
          })
        },
      },
      {
        id: 'action:warp-reset',
        group: 'Demo',
        label: 'Reset the demo clock',
        hint: offsetMin ? `currently +${offsetMin} min` : 'already in real time',
        icon: CalendarClock,
        run: () => {
          setClockOffset(0)
          push({ title: 'Back to real time', kind: 'info' })
        },
      },
      {
        id: 'action:reset',
        group: 'Demo',
        label: 'Reset all demo data',
        hint: 'fresh seed, keeps you signed in',
        icon: RotateCcw,
        run: () => {
          const session = db.session
          resetDatabase()
          // Keep the operator signed in so a reseed is never disruptive.
          if (session?.userId) signInWithGoogle({ userId: session.userId, provider: session.provider })
          push({ title: 'Demo data reseeded', body: 'Every table is back to its opening state.', kind: 'info' })
        },
      },
      {
        id: 'action:explore',
        group: 'Jump to',
        label: 'Find an available space',
        hint: '/explore',
        icon: Search,
        run: () => navigate('/explore'),
      },
      {
        id: 'action:waitlist',
        group: 'Jump to',
        label: 'My waitlist offers',
        hint: '/waitlist',
        icon: Hourglass,
        run: () => navigate('/waitlist'),
      },
      {
        id: 'action:approvals',
        group: 'Jump to',
        label: 'Approvals inbox',
        hint: '/approvals',
        icon: Inbox,
        run: () => navigate('/approvals'),
      },
      {
        id: 'action:mediator',
        group: 'Jump to',
        label: 'Mediator desk',
        hint: '/mediator',
        icon: Scale,
        run: () => navigate('/mediator'),
      },
      {
        id: 'action:signout',
        group: 'Account',
        label: 'Sign out',
        hint: user?.email,
        icon: LogOut,
        run: () => signOut(),
      },
    ]

    return [...nav, ...actions]
  }, [db, navigate, push, signOut, user])

  const filtered = useMemo(
    () => commands.filter((c) => fuzzy(query, `${c.label} ${c.hint ?? ''} ${c.group}`)),
    [commands, query]
  )

  useEffect(() => setActive(0), [query, open])

  useEffect(() => {
    if (!open) return undefined
    const t = window.setTimeout(() => inputRef.current?.focus(), 30)
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActive((i) => Math.min(i + 1, filtered.length - 1))
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActive((i) => Math.max(i - 1, 0))
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        const item = filtered[active]
        if (item) {
          item.run()
          onClose()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, filtered, active])

  const scope = useRef(null)
  useGSAP(
    () => {
      if (!open || prefersReducedMotion()) return
      gsap.from('[data-palette]', { y: -12, opacity: 0, duration: 0.24, ease: 'power2.out' })
    },
    { scope, dependencies: [open] }
  )

  if (!open) return null

  const groups = filtered.reduce((acc, item) => {
    ;(acc[item.group] ||= []).push(item)
    return acc
  }, {})

  let runningIndex = -1

  return createPortal(
    <div ref={scope} className="fixed inset-0 z-[90] flex items-start justify-center p-4 pt-[12vh] sm:p-6">
      <div className="fixed inset-0 bg-ink-950/80 backdrop-blur" onClick={onClose} aria-hidden="true" />
      <div
        data-palette
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="card relative z-10 w-full max-w-2xl overflow-hidden p-0"
      >
        <div className="flex items-center gap-3 border-b border-white/8 px-4 py-3.5">
          <Command className="size-4 shrink-0 text-brand-300" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search spaces, jump to a console, run an operation…"
            className="w-full bg-transparent text-[14.5px] text-white placeholder:text-slate-500 focus:outline-none"
          />
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-500 hover:text-white">
            <X className="size-4" />
          </button>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-slate-500">Nothing matches that.</p>
          ) : (
            Object.entries(groups).map(([group, items]) => (
              <div key={group} className="mb-1">
                <p className="px-3 py-2 text-[10.5px] font-semibold tracking-[0.14em] text-slate-500 uppercase">
                  {group}
                </p>
                {items.map((item) => {
                  runningIndex += 1
                  const index = runningIndex
                  const Icon = item.icon
                  const isActive = index === active
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onMouseEnter={() => setActive(index)}
                      onClick={() => {
                        item.run()
                        onClose()
                      }}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition',
                        isActive ? 'bg-brand-500/18 text-white' : 'text-slate-300 hover:bg-white/6'
                      )}
                    >
                      <Icon className={cn('size-4 shrink-0', isActive ? 'text-brand-300' : 'text-slate-500')} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium">{item.label}</span>
                        {item.hint ? (
                          <span className="block truncate font-mono text-[11px] text-slate-500">{item.hint}</span>
                        ) : null}
                      </span>
                      {isActive ? <CornerDownLeft className="size-3.5 shrink-0 text-brand-300" /> : null}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/8 px-4 py-2.5 text-[11px] text-slate-500">
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> navigate
            </span>
            <span className="flex items-center gap-1">
              <Kbd>↵</Kbd> run
            </span>
          </span>
          <span className="flex items-center gap-1">
            <Kbd>esc</Kbd> close
          </span>
        </div>
      </div>
    </div>,
    document.body
  )
}
