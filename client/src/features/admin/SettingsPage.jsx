import { useMemo, useState } from 'react'
import {
  Bot,
  Cog,
  Gauge,
  RefreshCw,
  Scale,
  ShieldAlert,
  SlidersHorizontal,
  Timer,
  TriangleAlert,
  UserCog,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { EVENT_TYPES, ROLE_LABEL, ROLES, WORKER_JOBS } from '../../lib/constants'
import { useDb } from '../../lib/query'
import { useAuth } from '../../app/AuthProvider'
import { useToast } from '../../app/ToastProvider'
import { useStaggerIn } from '../../lib/gsap'
import {
  resetDemoData,
  updateAiConfig,
  updatePriorityConfig,
  updateSettings,
} from '../../services/settings'
import { setRole } from '../../services/auth'
import { Card, CardHeader, SectionTitle } from '../../components/ui/Card'
import {
  Avatar,
  Badge,
  Button,
  Field,
  Input,
  Select,
  Switch,
  Tooltip,
} from '../../components/ui/primitives'
import { ConfirmDialog } from '../../components/ui/Modal'

export default function SettingsPage() {
  const db = useDb()
  const { user } = useAuth()
  const { push } = useToast()
  const scope = useStaggerIn([])
  const [confirmReset, setConfirmReset] = useState(false)

  const priority = db.settings.priority
  const set = (patch) => {
    updateSettings(patch, user.id)
    push({ title: 'Settings saved', body: 'Written to the audit trail.', kind: 'success' })
  }
  const setPriority = (patch) => {
    updatePriorityConfig(patch, user.id)
  }

  const simulate = useMemo(() => {
    // Show the effect of the current weights on a worked example.
    const studentClub = priority.eventWeights.club + priority.roleWeights.student
    const facultyExam = Math.min(priority.eventWeights.exam, priority.unverifiedHighPriorityCap) + priority.roleWeights.faculty
    const verifiedExam = priority.eventWeights.exam + priority.roleWeights.faculty
    return { studentClub, facultyExam, verifiedExam }
  }, [priority])

  return (
    <div ref={scope} className="space-y-6">
      <SectionTitle
        icon={SlidersHorizontal}
        title="Settings"
        subtitle="Weights, windows and automation. Everything here is auditable and reversible."
        action={
          <Badge tone="brand" icon={ShieldAlert}>
            admin only
          </Badge>
        }
      />

      {/* Priority weights */}
      <Card className="reveal">
        <CardHeader
          icon={Scale}
          accent="brand"
          title="Priority weights"
          subtitle="The rules every request is scored by. Change them and the next request uses the new values — existing scores are frozen with their own breakdown."
        />

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div>
            <p className="field-label">Event type weights</p>
            <div className="space-y-2">
              {EVENT_TYPES.map((type) => (
                <div key={type.value} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 truncate text-[12.5px] text-slate-300">
                    {type.label}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={priority.eventWeights[type.value] ?? 0}
                    onChange={(event) =>
                      setPriority({
                        eventWeights: {
                          ...priority.eventWeights,
                          [type.value]: Number(event.target.value),
                        },
                      })
                    }
                    className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/12 accent-brand-500"
                    aria-label={`${type.label} weight`}
                  />
                  <span className="num w-8 shrink-0 text-right text-[12px] font-semibold text-white">
                    {priority.eventWeights[type.value] ?? 0}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="field-label">Requester role weights</p>
            <div className="space-y-2">
              {ROLES.map((role) => (
                <div key={role.value} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 truncate text-[12.5px] text-slate-300">
                    {role.label}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={40}
                    step={1}
                    value={priority.roleWeights[role.value] ?? 0}
                    onChange={(event) =>
                      setPriority({
                        roleWeights: {
                          ...priority.roleWeights,
                          [role.value]: Number(event.target.value),
                        },
                      })
                    }
                    className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/12 accent-brand-500"
                    aria-label={`${role.label} weight`}
                  />
                  <span className="num w-8 shrink-0 text-right text-[12px] font-semibold text-white">
                    {priority.roleWeights[role.value] ?? 0}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 border-t border-white/8 pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Fairness cap" hint="Max bonus for under-used groups">
            <Input
              type="number"
              min={0}
              max={40}
              value={priority.fairnessCap}
              onChange={(event) => setPriority({ fairnessCap: Number(event.target.value) })}
            />
          </Field>
          <Field label="Advance notice cap" hint="+1 per day booked ahead">
            <Input
              type="number"
              min={0}
              max={30}
              value={priority.advanceNoticeCap}
              onChange={(event) => setPriority({ advanceNoticeCap: Number(event.target.value) })}
            />
          </Field>
          <Field label="No-show penalty" hint="Points lost per strike">
            <Input
              type="number"
              min={0}
              max={30}
              value={priority.noShowPenaltyPer}
              onChange={(event) => setPriority({ noShowPenaltyPer: Number(event.target.value) })}
            />
          </Field>
          <Field label="Close-call margin" hint="Gap under which a human decides">
            <Input
              type="number"
              min={0}
              max={60}
              value={priority.closeCallMargin}
              onChange={(event) => setPriority({ closeCallMargin: Number(event.target.value) })}
            />
          </Field>
        </div>

        <div className="mt-4 rounded-xl border border-white/8 bg-ink-950/50 p-3.5">
          <p className="text-[11.5px] font-semibold tracking-[0.12em] text-slate-500 uppercase">
            Worked example with these weights
          </p>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            {[
              ['Student · club meeting', simulate.studentClub],
              ['Faculty · exam (unverified)', simulate.facultyExam],
              ['Faculty · exam (verified)', simulate.verifiedExam],
            ].map(([label, value]) => (
              <div key={label} className="surface-sunken px-3 py-2">
                <p className="text-[11px] text-slate-500">{label}</p>
                <p className="num text-lg font-bold text-white">{value}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            The unverified exam is capped at {priority.unverifiedHighPriorityCap}, so declaring
            “exam” cannot be used to jump the queue — only an approver's verification unlocks the
            remaining {priority.eventWeights.exam - priority.unverifiedHighPriorityCap} points.
          </p>
        </div>
      </Card>

      {/* Operations */}
      <Card className="reveal">
        <CardHeader
          icon={Timer}
          accent="amber"
          title="Operational windows"
          subtitle="The clocks the automation obeys."
        />
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="No-show grace (min)" hint="Check-in closes this long after start">
            <Input
              type="number"
              min={1}
              max={120}
              value={db.settings.noShowGraceMin}
              onChange={(event) =>
                updateSettings({ noShowGraceMin: Number(event.target.value) }, user.id)
              }
            />
          </Field>
          <Field label="Waitlist offer window (min)" hint="How long an offer stays open">
            <Input
              type="number"
              min={5}
              max={240}
              value={db.settings.offerWindowMin}
              onChange={(event) =>
                updateSettings({ offerWindowMin: Number(event.target.value) }, user.id)
              }
            />
          </Field>
          <Field label="Approval SLA (hours)" hint="Pending longer than this escalates">
            <Input
              type="number"
              min={1}
              max={168}
              value={db.settings.approvalSlaHours}
              onChange={(event) =>
                updateSettings({ approvalSlaHours: Number(event.target.value) }, user.id)
              }
            />
          </Field>
          <Field label="Reminder lead (min)" hint="How early the nudge goes out">
            <Input
              type="number"
              min={5}
              max={240}
              value={db.settings.remindersLeadMin}
              onChange={(event) =>
                updateSettings({ remindersLeadMin: Number(event.target.value) }, user.id)
              }
            />
          </Field>
        </div>
      </Card>

      {/* Automation */}
      <Card className="reveal">
        <CardHeader
          icon={Bot}
          accent="mint"
          title="Automation jobs"
          subtitle="Turn a worker off and its effect stops at the next tick — useful for isolating behaviour in a demo."
        />
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {WORKER_JOBS.map((job) => (
            <div
              key={job.name}
              className="flex items-start justify-between gap-4 rounded-xl border border-white/8 bg-white/3 p-3.5"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-white">
                  {job.label}
                  <span className="text-[10.5px] font-normal tracking-wide text-slate-500 uppercase">
                    {job.cadence}
                  </span>
                </p>
                <p className="mt-0.5 text-[11.5px] leading-snug text-slate-400">{job.description}</p>
              </div>
              <Switch
                checked={db.settings.workers?.[job.name] !== false}
                onChange={(next) => {
                  updateSettings(
                    { workers: { ...db.settings.workers, [job.name]: next } },
                    user.id
                  )
                }}
                label=""
              />
            </div>
          ))}
        </div>
      </Card>

      {/* AI */}
      <Card className="reveal">
        <CardHeader
          icon={Cog}
          accent="aqua"
          title="AI layer"
          subtitle="Model, timeout and the demo-safety switch. Fallbacks are always available, so disabling the model never breaks a flow."
        />
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="space-y-4">
            <Field label="Model" hint="Vendor string shown in the UI">
              <Input
                value={db.settings.ai.model}
                onChange={(event) => updateAiConfig({ model: event.target.value }, user.id)}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Timeout (ms)" hint="Then the fallback takes over">
                <Input
                  type="number"
                  min={1000}
                  max={60000}
                  step={500}
                  value={db.settings.ai.timeoutMs}
                  onChange={(event) =>
                    updateAiConfig({ timeoutMs: Number(event.target.value) }, user.id)
                  }
                />
              </Field>
              <Field label="Retries" hint="Attempts before falling back">
                <Input
                  type="number"
                  min={0}
                  max={5}
                  value={db.settings.ai.retries}
                  onChange={(event) => updateAiConfig({ retries: Number(event.target.value) }, user.id)}
                />
              </Field>
            </div>
          </div>

          <div className="space-y-3">
            <Switch
              checked={db.settings.ai.llmDisabled}
              onChange={(next) => updateAiConfig({ llmDisabled: next }, user.id)}
              label="Force deterministic fallbacks (LLM_DISABLED)"
              description="Run the entire product with no model calls at all. This is the dry-run from the pre-demo checklist."
            />
            <div
              className={cn(
                'rounded-xl border p-3.5',
                db.settings.ai.llmDisabled
                  ? 'border-amber-450/25 bg-amber-450/8'
                  : 'border-mint-400/25 bg-mint-400/8'
              )}
            >
              <p className="text-[12.5px] font-semibold text-white">
                {db.settings.ai.llmDisabled
                  ? 'Fallback engine active'
                  : 'Model path active (simulated)'}
              </p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-slate-300">
                {db.settings.ai.llmDisabled
                  ? 'Parsing, classification, explanations, briefs and digests come from deterministic rules. Every run is still logged to the AI activity log.'
                  : 'In this build the “model” is still the local engine — swap the body of runSkill() for an Anthropic call and this switch becomes a real kill-switch.'}
              </p>
            </div>
            <div className="surface-sunken px-3 py-2.5">
              <p className="text-[11px] text-slate-500">Calls recorded</p>
              <p className="num text-lg font-bold text-white">{db.aiRuns.length}</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Roles */}
      <Card className="reveal">
        <CardHeader
          icon={UserCog}
          accent="amber"
          title="Roles & access"
          subtitle="Only an administrator can change a role. Default for a new profile is student."
        />
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[42rem] text-left">
            <thead>
              <tr className="border-b border-white/8">
                {['Account', 'Department / club', 'No-shows', 'Role'].map((heading) => (
                  <th
                    key={heading}
                    className="px-3 py-2.5 text-[10.5px] font-semibold tracking-[0.12em] text-slate-500 uppercase"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {db.profiles.map((profile) => (
                <tr key={profile.id} className="table-row">
                  <td className="px-3 py-3">
                    <span className="flex items-center gap-2.5">
                      <Avatar name={profile.fullName} accent={profile.accent} size={30} />
                      <span className="min-w-0">
                        <span className="block truncate text-[12.5px] font-medium text-white">
                          {profile.fullName}
                        </span>
                        <span className="block truncate text-[11px] text-slate-500">
                          {profile.email}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-3 text-[12px] text-slate-400">
                    {profile.club || profile.department}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={cn(
                        'num text-[12px] font-semibold',
                        profile.noShowCount >= 2 ? 'text-rose-450' : 'text-slate-300'
                      )}
                    >
                      {profile.noShowCount ?? 0}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <Select
                      value={profile.role}
                      onChange={(event) => {
                        try {
                          setRole(profile.id, event.target.value, user.id)
                          push({
                            title: 'Role updated',
                            body: `${profile.fullName} is now ${ROLE_LABEL[event.target.value]}.`,
                            kind: 'success',
                          })
                        } catch (error) {
                          push({ title: 'Could not change role', body: error.message, kind: 'error' })
                        }
                      }}
                      className="w-40"
                    >
                      {ROLES.map((role) => (
                        <option key={role.value} value={role.value}>
                          {role.label}
                        </option>
                      ))}
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Danger zone */}
      <Card className="reveal border-rose-450/25">
        <CardHeader
          icon={TriangleAlert}
          accent="rose"
          title="Danger zone"
          subtitle="Reseed every table back to the opening demo state. You stay signed in."
        />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="danger" leftIcon={RefreshCw} onClick={() => setConfirmReset(true)}>
            Reset all demo data
          </Button>
          <span className="text-[11.5px] text-slate-500">
            {db.bookings.length} bookings · {db.waitlist.length} waitlist rows · {db.auditLogs.length}{' '}
            audit entries will be regenerated.
          </span>
        </div>
      </Card>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => {
          resetDemoData(user.id)
          setConfirmReset(false)
          push({ title: 'Demo data reseeded', body: 'Every table is back to its opening state.', kind: 'info' })
        }}
        title="Reset the whole demo?"
        description="Bookings, waitlist entries, notifications and audit history are regenerated from the deterministic seed. Anything you created during this session is discarded."
        confirmLabel="Reset everything"
      />

      <Card className="reveal">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-brand-400/25 bg-brand-500/12 text-brand-300">
            <Gauge className="size-4" />
          </span>
          <div>
            <p className="text-[13.5px] font-semibold text-white">Settings are a decision, not a preference</p>
            <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-slate-400">
              Every change on this page writes an audit entry with the actor and the diff. Tuning the
              weights mid-term is exactly the kind of move a student body will ask about, and the log
              is where you answer it.
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
