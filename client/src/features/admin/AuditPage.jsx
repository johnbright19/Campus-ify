import { useMemo, useState } from 'react'
import { Bot, FileClock, Search, ScrollText, ShieldCheck, Sparkles } from 'lucide-react'
import { cn, fmtDayShort, fmtRelative } from '../../lib/utils'
import { useDb, useNow } from '../../lib/query'
import { useStaggerIn } from '../../lib/gsap'
import { auditFeed, aiFeed } from '../../services/analytics'
import { Card, SectionTitle } from '../../components/ui/Card'
import { Badge, Button, EmptyState, Input, Segmented, Select } from '../../components/ui/primitives'
import { UserChip } from '../../components/UserChip'

const ACTION_TONES = {
  create: 'mint',
  approve: 'mint',
  cancel: 'amber',
  reject: 'rose',
  update: 'brand',
  offer: 'brand',
  expire: 'amber',
  release: 'rose',
  expireActor: 'slate',
}

function toneFor(action = '') {
  if (action.includes('approve') || action.includes('confirm') || action.includes('checkin')) return 'mint'
  if (action.includes('reject') || action.includes('release') || action.includes('no_show')) return 'rose'
  if (action.includes('cancel') || action.includes('expire')) return 'amber'
  if (action.includes('ai') || action.includes('worker')) return 'brand'
  return 'slate'
}

export default function AuditPage() {
  const db = useDb()
  const nowInstant = useNow(30000)
  const scope = useStaggerIn([])

  const [tab, setTab] = useState('audit')
  const [query, setQuery] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [actorFilter, setActorFilter] = useState('')
  const [openRow, setOpenRow] = useState(null)

  const audit = useMemo(() => auditFeed(200, db), [db])
  const aiRuns = useMemo(() => aiFeed(100, db), [db])

  const actions = useMemo(
    () => [...new Set(db.auditLogs.map((l) => l.action))].sort(),
    [db.auditLogs]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return audit
      .filter((entry) => (actionFilter ? entry.action === actionFilter : true))
      .filter((entry) => {
        if (!actorFilter) return true
        if (actorFilter === 'system') return !entry.actorId
        return entry.actorId === actorFilter
      })
      .filter((entry) => {
        if (!q) return true
        return (
          entry.action.toLowerCase().includes(q) ||
          String(entry.entity ?? '').toLowerCase().includes(q) ||
          (entry.actor?.fullName ?? '').toLowerCase().includes(q) ||
          JSON.stringify(entry.details ?? {}).toLowerCase().includes(q)
        )
      })
  }, [audit, query, actionFilter, actorFilter])

  const filteredRuns = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return aiRuns
    return aiRuns.filter(
      (run) =>
        run.name.toLowerCase().includes(q) ||
        JSON.stringify(run.output ?? {}).toLowerCase().includes(q)
    )
  }, [aiRuns, query])

  const rows = tab === 'audit' ? filtered : filteredRuns

  return (
    <div ref={scope} className="space-y-6">
      <SectionTitle
        icon={ScrollText}
        title="Audit trail"
        subtitle="Every decision, every override and every AI recommendation — who did it, to what, and why."
        action={
          <Badge tone="brand" icon={ShieldCheck}>
            {db.auditLogs.length} entries · {db.aiRuns.length} AI runs
          </Badge>
        }
      />

      <Card className="reveal">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'audit', label: 'Decisions & actions', count: audit.length },
              { value: 'ai', label: 'AI activity', count: aiRuns.length },
            ]}
          />
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={tab === 'audit' ? 'Search actions, entities, details…' : 'Search skill names and outputs…'}
              className="pl-9"
            />
          </div>
          {tab === 'audit' ? (
            <>
              <Select
                value={actionFilter}
                onChange={(event) => setActionFilter(event.target.value)}
                className="w-auto"
              >
                <option value="">All actions</option>
                {actions.map((action) => (
                  <option key={action} value={action}>
                    {action}
                  </option>
                ))}
              </Select>
              <Select
                value={actorFilter}
                onChange={(event) => setActorFilter(event.target.value)}
                className="w-auto"
              >
                <option value="">All actors</option>
                {db.profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.fullName}
                  </option>
                ))}
                <option value="system">System / automation</option>
              </Select>
            </>
          ) : null}
        </div>
      </Card>

      {rows.length === 0 ? (
        <EmptyState
          className="reveal"
          icon={FileClock}
          title="Nothing recorded yet"
          description="Make a booking, approve a request or run an automation job and it will appear here."
        />
      ) : (
        <Card className="reveal overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[60rem] text-left">
              <thead>
                <tr className="border-b border-white/8 bg-white/3">
                  {['When', 'Actor', tab === 'audit' ? 'Action' : 'Skill', 'Entity', 'Detail'].map(
                    (heading) => (
                      <th
                        key={heading}
                        className="px-4 py-3 text-[10.5px] font-semibold tracking-[0.12em] text-slate-500 uppercase"
                      >
                        {heading}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => {
                  const isAi = tab === 'ai'
                  return (
                    <tr key={entry.id} className="table-row align-top">
                      <td className="px-4 py-3">
                        <p className="num text-[12px] font-medium text-slate-300">
                          {new Date(isAi ? entry.createdAt : entry.createdAt).toLocaleTimeString('en-GB', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </p>
                        <p className="text-[10.5px] text-slate-500">
                          {fmtRelative(entry.createdAt, nowInstant)}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {isAi ? (
                          <span className="flex items-center gap-2 text-[12px] text-slate-400">
                            <Bot className="size-3.5 text-brand-300" />
                            {entry.userId
                              ? db.profiles.find((p) => p.id === entry.userId)?.fullName ?? 'unknown'
                              : 'system'}
                          </span>
                        ) : entry.actor ? (
                          <UserChip user={entry.actor} size={28} />
                        ) : (
                          <span className="flex items-center gap-2 text-[12px] text-slate-400">
                            <Bot className="size-3.5 text-amber-450" />
                            automation
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={isAi ? (entry.usedFallback ? 'amber' : 'brand') : toneFor(entry.action)}>
                          {isAi ? entry.name : entry.action}
                        </Badge>
                        {isAi ? (
                          <p className="num mt-1 text-[10.5px] text-slate-500">{entry.latencyMs} ms</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-[12px] text-slate-300">{entry.entity ?? '—'}</p>
                        <p className="num truncate text-[10.5px] text-slate-600">
                          {entry.entityId ?? ''}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setOpenRow(openRow === entry.id ? null : entry.id)}
                        >
                          {openRow === entry.id ? 'Hide' : 'Inspect'}
                        </Button>
                        {openRow === entry.id ? (
                          <pre className="mt-2 max-w-md overflow-x-auto rounded-lg border border-white/8 bg-ink-950/70 p-2.5 font-mono text-[10.5px] leading-relaxed text-slate-400">
                            {JSON.stringify(isAi ? { input: entry.input, output: entry.output } : entry.details, null, 2)}
                          </pre>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="reveal">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-brand-400/25 bg-brand-500/12 text-brand-300">
            <Sparkles className="size-4" />
          </span>
          <div>
            <p className="text-[13.5px] font-semibold text-white">Why this matters</p>
            <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-slate-400">
              When an AI assists a decision, somebody will eventually ask “why did it do that?”. Each
              row above answers it: the skill, the exact input, the output a human accepted or
              overrode, and the latency. Overridden recommendations stay visible next to the decision
              that replaced them.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone="slate">{db.aiRuns.filter((r) => r.usedFallback).length} fallback runs</Badge>
              <Badge tone="slate">
                {db.aiRuns.filter((r) => !r.usedFallback).length} model runs
              </Badge>
              <Badge tone="slate">
                {db.auditLogs.filter((l) => !l.actorId).length} system actions
              </Badge>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
