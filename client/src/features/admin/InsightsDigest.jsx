import { useState } from 'react'
import { CornerDownLeft, Lightbulb, ListChecks, ShieldCheck, Sparkles, Wand2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { answerInsightQuestion, INSIGHT_TOOLS } from '../../services/ai'
import { Badge, Button, Input } from '../../components/ui/primitives'

function renderMarkdownLine(line) {
  return line
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>')
    .replace(/^[-•]\s*/, '')
}

/**
 * S13 — the daily digest, rendered.
 *
 * Deliberately highlights that every number is traceable: the panel lists the
 * aggregates the digest drew from, and the Q&A box only answers from a fixed,
 * SQL-backed tool set (never free-form SQL).
 */
export function InsightsDigest({ digest, aggregates, className }) {
  const [question, setQuestion] = useState('')
  const [thread, setThread] = useState([])

  const ask = (text) => {
    const value = String(text ?? '').trim()
    if (!value) return
    // An explicit user action, so it is recorded in the AI activity log —
    // render-time calls stay silent to avoid a write loop.
    const answer = answerInsightQuestion(value, aggregates, { log: true })
    setThread((list) => [...list, { id: `${list.length}-${value}`, q: value, a: answer }])
    setQuestion('')
  }

  if (!digest) return null

  return (
    <div className={cn('space-y-4', className)}>
      <div className="rounded-2xl border border-aqua-400/25 bg-aqua-400/5 p-4">
        <div className="flex items-start justify-between gap-3">
          <p className="flex items-center gap-2 text-[12.5px] font-semibold text-aqua-200">
            <Sparkles className="size-3.5" />
            Generated digest
          </p>
          <Badge tone="aqua" icon={ShieldCheck}>
            numbers traced
          </Badge>
        </div>

        <ul className="mt-3 space-y-2">
          {digest.insights.map((line) => (
            <li key={line} className="flex items-start gap-2 text-[12.5px] leading-relaxed text-slate-300">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-aqua-400" />
              <span dangerouslySetInnerHTML={{ __html: renderMarkdownLine(line) }} />
            </li>
          ))}
        </ul>

        <div className="mt-4 border-t border-white/10 pt-3">
          <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-300">
            <Lightbulb className="size-3.5 text-amber-450" />
            Recommended actions
          </p>
          <ul className="mt-2 space-y-1.5">
            {digest.actions.map((action) => (
              <li key={action} className="flex items-start gap-2 text-[12px] leading-relaxed text-slate-400">
                <ListChecks className="mt-0.5 size-3.5 shrink-0 text-mint-400" />
                {action}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-ink-950/50 p-4">
        <p className="flex items-center gap-2 text-[12.5px] font-semibold text-white">
          <Wand2 className="size-3.5 text-brand-300" />
          Ask the utilisation analyst
        </p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-slate-500">
          Answers come only from fixed aggregate tools — the model never writes SQL.
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {INSIGHT_TOOLS.map((tool) => (
            <button
              key={tool.id}
              type="button"
              onClick={() => ask(tool.question)}
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-400 transition hover:border-brand-400/40 hover:text-white"
            >
              {tool.question}
            </button>
          ))}
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            ask(question)
          }}
          className="mt-3 flex items-center gap-2"
        >
          <Input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="e.g. Which resource has the most no-shows this month?"
          />
          <Button type="submit" size="sm" leftIcon={CornerDownLeft} disabled={!question.trim()}>
            Ask
          </Button>
        </form>

        {thread.length ? (
          <ul className="mt-3 space-y-2.5 border-t border-white/8 pt-3">
            {thread.slice(-3).map((entry) => (
              <li key={entry.id} className="space-y-1.5">
                <p className="text-[12px] font-medium text-slate-400">{entry.q}</p>
                <p className="rounded-xl border border-aqua-400/20 bg-aqua-400/5 px-3 py-2 text-[12.5px] leading-relaxed text-slate-200">
                  {entry.a}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
