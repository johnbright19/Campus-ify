import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BadgeCheck,
  Building2,
  Check,
  GraduationCap,
  KeyRound,
  LogOut,
  ShieldCheck,
  Ticket,
  TriangleAlert,
  UserRound,
  Users,
} from 'lucide-react'
import { cn, fmtDayShort, fmtRange, humanizeFeature } from '../../lib/utils'
import { TZ } from '../../lib/utils'
import { ROLE_LABEL } from '../../lib/constants'
import { useDb } from '../../lib/query'
import { useAuth } from '../../app/AuthProvider'
import { useToast } from '../../app/ToastProvider'
import { useStaggerIn } from '../../lib/gsap'
import { bookingsFor } from '../../services/bookings'
import { Card, CardHeader, SectionTitle } from '../../components/ui/Card'
import { Avatar, Badge, Button, Field, Input, Progress } from '../../components/ui/primitives'
import { StatusBadge } from '../../components/StatusBadge'

export default function ProfilePage() {
  const db = useDb()
  const { user, session, role, signOut, updateProfile } = useAuth()
  const { push } = useToast()
  const navigate = useNavigate()
  const scope = useStaggerIn([user?.id])

  const [fullName, setFullName] = useState(user?.fullName ?? '')
  const [department, setDepartment] = useState(user?.department ?? '')
  const [club, setClub] = useState(user?.club ?? '')
  const [title, setTitle] = useState(user?.title ?? '')

  const mine = useMemo(() => bookingsFor(user.id, db), [db, user.id])

  const attendance = useMemo(() => {
    const finished = mine.filter((b) => ['completed', 'no_show'].includes(b.status))
    const attended = finished.filter((b) => b.status === 'completed').length
    return {
      finished: finished.length,
      attended,
      rate: finished.length ? attended / finished.length : 1,
    }
  }, [mine])

  const totalHours = useMemo(
    () =>
      mine
        .filter((b) => ['approved', 'completed'].includes(b.status))
        .reduce((acc, b) => acc + (new Date(b.endTime) - new Date(b.startTime)) / 3600000, 0),
    [mine]
  )

  const save = () => {
    updateProfile({ fullName, department, club, title })
    push({ title: 'Profile updated', body: 'Your details are saved.', kind: 'success' })
  }

  const dirty =
    fullName !== (user?.fullName ?? '') ||
    department !== (user?.department ?? '') ||
    club !== (user?.club ?? '') ||
    title !== (user?.title ?? '')

  return (
    <div ref={scope} className="space-y-6">
      <SectionTitle
        icon={UserRound}
        title="My profile"
        subtitle="Identity, role and the record the priority engine reads when it scores your requests."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Card className="reveal">
            <div className="flex flex-wrap items-center gap-5">
              <Avatar name={user?.fullName} accent={user?.accent} size={72} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold tracking-tight text-white">{user?.fullName}</h2>
                  <Badge tone={role === 'admin' ? 'rose' : role === 'student' ? 'aqua' : 'mint'}>
                    <ShieldCheck className="size-3" />
                    {ROLE_LABEL[role]}
                  </Badge>
                </div>
                <p className="mt-1 text-[13px] text-slate-400">{user?.email}</p>
                <p className="mt-0.5 text-[12px] text-slate-500">{user?.title}</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[11.5px] text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <Building2 className="size-3.5" />
                    {user?.department || 'No department'}
                  </span>
                  {user?.club ? (
                    <span className="flex items-center gap-1.5">
                      <Users className="size-3.5" />
                      {user.club}
                    </span>
                  ) : null}
                  <span className="flex items-center gap-1.5">
                    <GraduationCap className="size-3.5" />
                    joined {fmtDayShort(user?.createdAt ?? new Date(), TZ)}
                  </span>
                </div>
              </div>
            </div>
          </Card>

          <Card className="reveal">
            <CardHeader
              icon={UserRound}
              accent="brand"
              title="Details"
              subtitle="Your club or department feeds the fairness bonus; your role feeds the role weight."
            />
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Full name">
                <Input value={fullName} onChange={(event) => setFullName(event.target.value)} />
              </Field>
              <Field label="Title / designation">
                <Input value={title} onChange={(event) => setTitle(event.target.value)} />
              </Field>
              <Field label="Department">
                <Input value={department} onChange={(event) => setDepartment(event.target.value)} />
              </Field>
              <Field label="Club / committee" hint="Used for the fairness bonus across groups">
                <Input value={club} onChange={(event) => setClub(event.target.value)} />
              </Field>
            </div>
            <div className="mt-5 flex items-center gap-3">
              <Button leftIcon={Check} disabled={!dirty} onClick={save}>
                Save changes
              </Button>
              {dirty ? (
                <span className="text-[11.5px] text-amber-450">You have unsaved changes.</span>
              ) : (
                <span className="text-[11.5px] text-slate-500">Everything is saved.</span>
              )}
            </div>
          </Card>

          <Card className="reveal">
            <CardHeader
              icon={Ticket}
              accent="aqua"
              title="Recent activity"
              subtitle="Your last five bookings and how they ended."
            />
            <ul className="mt-4 space-y-2.5">
              {mine.slice(0, 5).map((booking) => (
                <li
                  key={booking.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/3 px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-medium text-white">{booking.title}</p>
                    <p className="num truncate text-[11px] text-slate-500">
                      {booking.resource?.name} · {fmtDayShort(booking.startTime, TZ)} ·{' '}
                      {fmtRange(booking.startTime, booking.endTime, TZ)}
                    </p>
                  </div>
                  <StatusBadge status={booking.status} showIcon={false} />
                </li>
              ))}
              {!mine.length ? (
                <li className="rounded-xl border border-dashed border-white/12 px-3 py-6 text-center text-[12px] text-slate-500">
                  No bookings yet.
                </li>
              ) : null}
            </ul>
          </Card>
        </div>

        {/* Right rail */}
        <div className="space-y-6">
          <Card className="reveal">
            <CardHeader icon={BadgeCheck} accent="mint" title="Reliability" subtitle="What approvers see about you" />
            <div className="mt-4 space-y-4">
              <div>
                <div className="flex items-center justify-between text-[11.5px]">
                  <span className="text-slate-400">Attendance rate</span>
                  <span className="num font-semibold text-white">
                    {Math.round(attendance.rate * 100)}%
                  </span>
                </div>
                <div className="mt-1.5">
                  <Progress
                    value={attendance.rate}
                    max={1}
                    tone={attendance.rate > 0.85 ? 'mint' : attendance.rate > 0.6 ? 'amber' : 'rose'}
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500">
                  {attendance.attended} of {attendance.finished} finished sessions attended
                </p>
              </div>

              <div className="flex items-center justify-between border-t border-white/8 pt-3">
                <span className="text-[12px] text-slate-400">No-show strikes</span>
                <span
                  className={cn(
                    'num text-[13px] font-semibold',
                    (user?.noShowCount ?? 0) >= 2 ? 'text-rose-450' : 'text-slate-200'
                  )}
                >
                  {user?.noShowCount ?? 0} / 4
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[12px] text-slate-400">Hours booked</span>
                <span className="num text-[13px] font-semibold text-slate-200">
                  {totalHours.toFixed(1)} h
                </span>
              </div>

              {(user?.noShowCount ?? 0) > 0 ? (
                <p className="flex items-start gap-2 rounded-xl border border-rose-450/25 bg-rose-500/8 px-3 py-2.5 text-[11.5px] leading-relaxed text-rose-200">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                  Each strike costs a fixed number of priority points. Check in on time and they age
                  out of the window.
                </p>
              ) : (
                <p className="flex items-start gap-2 rounded-xl border border-mint-400/25 bg-mint-400/8 px-3 py-2.5 text-[11.5px] leading-relaxed text-mint-100">
                  <BadgeCheck className="mt-0.5 size-3.5 shrink-0" />
                  Clean record — no penalty applied to your scores.
                </p>
              )}
            </div>
          </Card>

          <Card className="reveal">
            <CardHeader icon={KeyRound} accent="amber" title="Session" subtitle="The token the API would verify" />
            <div className="mt-4 space-y-2.5">
              {[
                ['Provider', session?.provider ?? '—'],
                ['Role', ROLE_LABEL[role] ?? role],
                ['Issued', session?.issuedAt ? fmtDayShort(session.issuedAt, TZ) : '—'],
                ['Expires', session?.expiresAt ? fmtDayShort(session.expiresAt, TZ) : '—'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 border-b border-white/6 pb-2 last:border-0">
                  <span className="text-[12px] text-slate-500">{label}</span>
                  <span className="truncate text-[12px] font-medium text-slate-200">{value}</span>
                </div>
              ))}
              <p className="num truncate rounded-lg border border-white/8 bg-ink-950/60 px-2.5 py-2 text-[10.5px] text-slate-500">
                {session?.accessToken ?? 'no token'}
              </p>
              <p className="text-[11px] leading-relaxed text-slate-500">
                In production the Node API sends this token to Supabase on every request and loads
                your profile row — exactly what the browser is emulating here.
              </p>
              <Button variant="danger" leftIcon={LogOut} className="w-full" onClick={() => signOut()}>
                Sign out
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => navigate('/bookings')}
              >
                Manage my bookings
              </Button>
            </div>
          </Card>

          <Card className="reveal">
            <CardHeader icon={Users} accent="slate" title="Groups on campus" subtitle="Everyone in the fairness ledger" />
            <ul className="mt-4 space-y-2">
              {[...new Set(db.profiles.map((p) => p.club || p.department).filter(Boolean))].map((group) => (
                <li key={group} className="flex items-center justify-between gap-3 text-[12px]">
                  <span className="truncate text-slate-300">{group}</span>
                  <span className="num shrink-0 text-slate-500">
                    {db.profiles.filter((p) => (p.club || p.department) === group).length} member(s)
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-slate-500">
              Highest-consuming group: {humanizeFeature('')}
              {(() => {
                const byGroup = new Map()
                for (const booking of db.bookings) {
                  if (!['approved', 'completed'].includes(booking.status)) continue
                  const person = db.profiles.find((p) => p.id === booking.userId)
                  const key = person?.club || person?.department
                  if (!key) continue
                  byGroup.set(
                    key,
                    (byGroup.get(key) ?? 0) +
                      (new Date(booking.endTime) - new Date(booking.startTime)) / 3600000
                  )
                }
                const top = [...byGroup.entries()].sort((a, b) => b[1] - a[1])[0]
                return top ? `${top[0]} (${top[1].toFixed(1)} h)` : 'nobody yet'
              })()}
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}
