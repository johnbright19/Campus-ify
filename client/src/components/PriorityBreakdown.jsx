import { Info, ShieldCheck, Sparkles } from 'lucide-react'
import { SCORE_FACTORS } from '../lib/constants'
import { cn, fmtScore, sum } from '../lib/utils'
import { Progress, Tooltip } from './ui/primitives'

const FACTOR_META = Object.fromEntries(SCORE_FACTORS.map((f) => [f.key, f]))

/**
 * The transparency requirement from Skills.md S2: "Every decision can show its
 * breakdown to users." Renders signed factor bars so a losing requester can see
 * exactly which dimension decided it.
 */
export function PriorityBreakdown({
  score,
  breakdown = {},
  extras = [],
  notes = [],
  verified = false,
  comparison = null,
  className,
  dense = false,
}) {
  const entries = SCORE_FACTORS.map((factor) => ({
    key: factor.key,
    label: factor.label,
    hint: factor.hint,
    value: Number(breakdown[factor.key] ?? 0),
  })).filter((e) => e.value !== 0)

  for (const extra of extras ?? []) {
    entries.push({
      key: `extra-${extra.key}`,
      label: extra.label,
      hint: 'Off-peak scheduling credit',
      value: extra.points,
    })
  }

  const maxAbs = Math.max(1, ...entries.map((e) => Math.abs(e.value)))
  const total = sum(entries, (e) => e.value)

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="num text-2xl font-bold tracking-tight text-white">{fmtScore(score ?? total)}</span>
          <span className="text-[11.5px] font-medium text-slate-500">priority score</span>
          {verified ? (
            <Tooltip content="An approver verified this high-priority claim">
              <span className="inline-flex items-center gap-1 rounded-full border border-mint-400/30 bg-mint-400/12 px-2 py-0.5 text-[10.5px] font-semibold text-mint-400">
                <ShieldCheck className="size-3" />
                verified
              </span>
            </Tooltip>
          ) : null}
        </div>
        {comparison ? (
          <span className="num text-[11.5px] font-semibold text-slate-400">
            vs {fmtScore(comparison.score)} · gap {fmtScore(Math.abs((score ?? total) - comparison.score))}
          </span>
        ) : null}
      </div>

      {entries.length ? (
        <div className={cn('space-y-2', dense && 'space-y-1.5')}>
          {entries.map((entry) => {
            const positive = entry.value >= 0
            return (
              <div key={entry.key} className="flex items-center gap-3">
                <Tooltip content={entry.hint} className="w-28 shrink-0 sm:w-36">
                  <span className="flex w-full items-center gap-1 truncate text-[12px] font-medium text-slate-400">
                    {entry.label}
                    <Info className="size-3 shrink-0 opacity-40" />
                  </span>
                </Tooltip>
                <div className="flex-1">
                  <Progress
                    value={Math.abs(entry.value)}
                    max={maxAbs}
                    tone={positive ? (entry.key === 'fairness' ? 'mint' : 'brand') : 'rose'}
                    thin
                  />
                </div>
                <span
                  className={cn(
                    'num w-10 shrink-0 text-right text-[12px] font-semibold',
                    positive ? 'text-slate-200' : 'text-rose-450'
                  )}
                >
                  {positive ? '+' : ''}
                  {fmtScore(entry.value)}
                </span>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-[12px] text-slate-500">No score factors recorded for this request.</p>
      )}

      {notes?.length ? (
        <ul className="space-y-1.5 border-t border-white/6 pt-3">
          {notes.map((note, index) => (
            <li key={`${note.key}-${index}`} className="flex items-start gap-2 text-[12px] leading-snug text-slate-400">
              <Sparkles
                className={cn(
                  'mt-0.5 size-3.5 shrink-0',
                  note.tone === 'rose' ? 'text-rose-450' : note.tone === 'mint' ? 'text-mint-400' : 'text-amber-450'
                )}
              />
              <span>{note.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export { FACTOR_META }
