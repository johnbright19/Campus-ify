import { useMemo, useState } from 'react'
import {
  Bot,
  Clock,
  Cog,
  Pause,
  Play,
  Sparkles,
  Terminal,
  Zap,
} from 'lucide-react'
import { cn, fmtRelative } from '../../lib/utils'
import { WORKER_JOBS } from '../../lib/constants'
import { runAllJobs, runJob, setWorkerEnabled, workerLog, workerRuntime } from '../../services/workers'
import { useNow } from '../../lib/query'
import { useToast } from '../../app/ToastProvider'
import { Badge, Button, Switch, Tooltip } from '../../components/ui/primitives'

const LEVEL_STYLES = {
  info: 'text-aqua-400',
  warn: 'text-amber-450',
  error: 'text-rose-450',
}

/**
 * A5 — Ops Automator.
 *
 * In production these are node-cron jobs on an always-on instance. Here they
 * run on compressed intervals so the automation is observable: flip a switch
 * off and the effect stops within seconds.
 */
export function AutomationPanel({ db, className, onRan }) {
  const { push } = useToast()
  const nowInstant = useNow(5000)
  const [, force] = useState(0)
  const runtime = workerRuntime()

  const logs = useMemo(() => workerLog(30, db), [db])

  const run = (name) => {
    const result = runJob(name)
    force((n) => n + 1)
    push({ title: `Ran ${name}`, body: result?.message ?? 'Job completed.', kind: 'ai' })
    onRan?.()
  }

  const runEverything = () => {
    const results = runAllJobs()
    force((n) => n + 1)
    push({
      title: `Ran ${results.length} jobs`,
      body: results.map((r) => r.message).join(' · ').slice(0, 180),
      kind: 'ai',
    })
    onRan?.()
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-[11.5px] text-slate-500">
          <Cog className="size-3.5" />
          Cadences are compressed for demonstration · every job is idempotent
        </p>
        <Button size="sm" variant="secondary" leftIcon={Play} onClick={runEverything}>
          Run every job now
        </Button>
      </div>

      <ul className="space-y-2">
        {WORKER_JOBS.map((job) => {
          const enabled = db.settings.workers?.[job.name] !== false
          const last = runtime.lastRun[job.name]
          const runs = runtime.runs[job.name] ?? 0
          return (
            <li
              key={job.name}
              className={cn(
                'rounded-xl border p-3.5 transition',
                enabled ? 'border-white/10 bg-white/3' : 'border-white/6 bg-ink-950/40 opacity-70'
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={cn(
                      'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border',
                      enabled
                        ? 'border-mint-400/25 bg-mint-400/10 text-mint-400'
                        : 'border-white/10 bg-white/5 text-slate-500'
                    )}
                  >
                    {enabled ? <Zap className="size-4" /> : <Pause className="size-4" />}
                  </span>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-white">
                      {job.label}
                      <Badge tone="slate">{job.cadence}</Badge>
                      {job.ai ? (
                        <Badge tone="brand" icon={Sparkles}>
                          AI wording
                        </Badge>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-[11.5px] leading-snug text-slate-400">{job.description}</p>
                    <p className="num mt-1 text-[10.5px] text-slate-500">
                      {job.name}.js · {runs} run(s) this session
                      {last ? ` · last ${fmtRelative(last, nowInstant)}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <Tooltip content="Run this job right now">
                    <Button size="sm" variant="ghost" onClick={() => run(job.name)}>
                      Run now
                    </Button>
                  </Tooltip>
                  <Switch
                    checked={enabled}
                    onChange={(next) => {
                      setWorkerEnabled(job.name, next)
                      push({
                        title: `${job.label} ${next ? 'enabled' : 'paused'}`,
                        kind: next ? 'success' : 'warning',
                      })
                    }}
                    label=""
                  />
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      <div className="rounded-xl border border-white/8 bg-ink-950/60">
        <div className="flex items-center justify-between gap-3 border-b border-white/8 px-3.5 py-2.5">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold text-white">
            <Terminal className="size-3.5 text-slate-500" />
            Automation log
          </p>
          <span className="flex items-center gap-1.5 text-[10.5px] text-slate-500">
            <Bot className="size-3" />
            actors are recorded as their own audit entries
          </span>
        </div>
        <ul className="max-h-64 space-y-0.5 overflow-y-auto p-2">
          {logs.map((entry) => (
            <li
              key={entry.id}
              className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 font-mono text-[11px] leading-relaxed transition hover:bg-white/4"
            >
              <Clock className="mt-0.5 size-3 shrink-0 text-slate-600" />
              <span className="shrink-0 text-slate-600">
                {new Date(entry.at).toLocaleTimeString('en-GB', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
              <span className={cn('shrink-0 font-semibold', LEVEL_STYLES[entry.level] ?? 'text-slate-400')}>
                {entry.job}
              </span>
              <span className="min-w-0 text-slate-400">{entry.message}</span>
            </li>
          ))}
          {!logs.length ? (
            <li className="px-2 py-6 text-center text-[11.5px] text-slate-500">
              Nothing logged yet — jobs write here the first time they fire.
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  )
}
