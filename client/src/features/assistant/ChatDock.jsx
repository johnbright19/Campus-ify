import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  CalendarPlus,
  CalendarSearch,
  CheckCheck,
  CornerDownLeft,
  MessageSquareText,
  Pencil,
  RotateCcw,
  SendHorizontal,
  ShieldCheck,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react'
import { cn, fmtDayShort, fmtRange, humanizeFeature } from '../../lib/utils'
import { AI_VENDOR } from '../../services/ai'
import { useDb } from '../../lib/query'
import { useAuth } from '../../app/AuthProvider'
import { PriorityBreakdown } from '../../components/PriorityBreakdown'
import { useConcierge } from './useConcierge'
import { Avatar, Badge, Button, IconButton, Tooltip } from '../../components/ui/primitives'

/**
 * A1 — Booking Concierge.
 *
 * A conversational front door to the deterministic booking engine. The agent
 * can parse, search and draft; the only thing that commits a booking is the
 * user pressing Confirm (Architecture.md §6.4, "human-in-the-loop").
 */
export function ChatDock() {
  const { user } = useAuth()
  const db = useDb()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  const concierge = useConcierge({ userId: user?.id })
  const { messages, busy, send, sendChip, chooseOption, confirmDraft, openInForm, substitute, reset, quickStarts } =
    concierge

  const showStarts = messages.length <= 1

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, busy, open])

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 80)
  }, [open])

  if (!user) return null

  const submit = (event) => {
    event.preventDefault()
    if (!input.trim() || busy) return
    send(input)
    setInput('')
  }

  return (
    <>
      {/* Launcher */}
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group fixed right-5 bottom-5 z-[60] flex items-center gap-2.5 rounded-2xl border border-brand-400/40 bg-gradient-to-br from-brand-500 to-brand-700 px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_50px_-18px_rgb(109_94_248)] transition hover:scale-[1.02] active:scale-[0.98]"
        >
          <span className="relative flex size-5 items-center justify-center">
            <Sparkles className="size-4.5" />
          </span>
          <span className="hidden sm:block">Ask the concierge</span>
          <span className="sm:hidden">Book</span>
        </button>
      ) : null}

      {/* Panel */}
      {open ? (
        <section
          role="dialog"
          aria-label="Booking concierge"
          className="card fixed right-3 bottom-3 z-[60] flex h-[min(38rem,88dvh)] w-[min(26rem,calc(100vw-1.5rem))] flex-col overflow-hidden p-0"
        >
          <header className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-brand-400/30 bg-brand-500/14 text-brand-300">
                <Wand2 className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-semibold text-white">Booking concierge</p>
                <p className="truncate text-[10.5px] text-slate-500">
                  {db.settings.ai.llmDisabled ? `${AI_VENDOR} · fallbacks on` : 'Model online'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Tooltip content="Start a fresh conversation">
                <IconButton label="Reset conversation" className="size-8" onClick={reset}>
                  <RotateCcw className="size-3.5" />
                </IconButton>
              </Tooltip>
              <IconButton label="Close concierge" className="size-8" onClick={() => setOpen(false)}>
                <X className="size-3.5" />
              </IconButton>
            </div>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                onChip={sendChip}
                onChoose={chooseOption}
                onConfirm={confirmDraft}
                onEdit={openInForm}
                onSubstitute={substitute}
              />
            ))}

            {showStarts ? (
              <div className="space-y-2 pt-1">
                <p className="text-[10.5px] font-semibold tracking-[0.13em] text-slate-500 uppercase">
                  Try one of these
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {quickStarts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => send(prompt)}
                      className="rounded-xl border border-white/10 bg-white/4 px-2.5 py-1.5 text-left text-[11.5px] leading-snug text-slate-300 transition hover:border-brand-400/40 hover:text-white"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {busy ? (
              <div className="flex items-center gap-2 text-[12px] text-slate-500">
                <span className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="size-1.5 animate-bounce rounded-full bg-brand-400"
                      style={{ animationDelay: `${i * 120}ms` }}
                    />
                  ))}
                </span>
                checking live availability…
              </div>
            ) : null}
          </div>

          <form onSubmit={submit} className="border-t border-white/8 p-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    submit(event)
                  }
                }}
                placeholder="“Need a hall for 80 people tomorrow 2 to 4 with a projector”"
                className="field max-h-28 min-h-11 flex-1 resize-none py-2.5"
              />
              <Button type="submit" className="size-11 shrink-0 p-0" disabled={busy || !input.trim()} aria-label="Send">
                <SendHorizontal className="size-4" />
              </Button>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[10.5px] text-slate-500">
              <ShieldCheck className="size-3" />
              Nothing is booked without your confirmation.
            </p>
          </form>
        </section>
      ) : null}
    </>
  )
}

/* ---------------------------------------------------------------------------
 * Message rendering
 * ------------------------------------------------------------------------- */

function MessageBubble({ message, onChip, onChoose, onConfirm, onEdit, onSubstitute }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md border border-brand-400/25 bg-brand-500/16 px-3.5 py-2.5 text-[13px] leading-relaxed text-white">
          {message.text}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-brand-400/30 bg-brand-500/12 text-brand-300">
          <Sparkles className="size-3.5" />
        </span>
        <p
          className={cn(
            'rounded-2xl rounded-tl-md border border-white/10 bg-white/4 px-3.5 py-2.5 text-[13px] leading-relaxed',
            message.tone === 'amber' && 'border-amber-450/25 text-amber-100',
            message.tone === 'rose' && 'border-rose-450/25 text-rose-100',
            !message.tone && 'text-slate-200'
          )}
        >
          {message.text}
        </p>
      </div>

      {message.chips?.length ? (
        <div className="flex flex-wrap gap-1.5 pl-9">
          {message.chips.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => onChip(chip, message.askFor)}
              className="rounded-full border border-white/12 bg-white/5 px-2.5 py-1 text-[11.5px] font-medium text-slate-300 transition hover:border-brand-400/40 hover:text-white"
            >
              {chip}
            </button>
          ))}
        </div>
      ) : null}

      {message.kind === 'options' ? (
        <div className="space-y-2 pl-9">
          {(message.options ?? []).map((option, index) => (
            <OptionCard
              key={`${option.resourceId}-${option.start ?? index}`}
              option={option}
              intent={message.intent}
              onChoose={() => onChoose(option, message.intent)}
            />
          ))}
          <button
            type="button"
            onClick={() =>
              onEdit({
                resourceId: message.options?.[0]?.resourceId,
                title: '',
                purpose: message.intent?.purpose ?? '',
                eventType: 'club',
                attendees: message.intent?.attendees ?? 1,
                start: message.intent?.resolvedStart,
                end: message.intent?.resolvedEnd,
              })
            }
            className="flex items-center gap-1.5 text-[11.5px] font-medium text-slate-400 transition hover:text-white"
          >
            <CalendarSearch className="size-3.5" />
            Open the full form instead
            <ArrowRight className="size-3" />
          </button>
        </div>
      ) : null}

      {message.kind === 'best_times' ? (
        <div className="space-y-2 pl-9">
          {(message.windows ?? []).map((window) => (
            <button
              key={window.start}
              type="button"
              onClick={() =>
                onChoose(
                  {
                    resourceId: message.resource.id,
                    resourceName: message.resource.name,
                    location: message.resource.location,
                    start: window.start,
                    end: window.end,
                  },
                  message.intent
                )
              }
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/4 px-3 py-2.5 text-left transition hover:border-brand-400/40 hover:bg-white/8"
            >
              <span className="min-w-0">
                <span className="block truncate text-[12.5px] font-semibold text-white">{window.label}</span>
                <span className="block text-[11px] text-slate-500">
                  {window.contested === 0 ? 'Completely free' : `${window.contested} pending request nearby`}
                  {window.offPeak ? ' · off-peak credit' : ''}
                </span>
              </span>
              <CalendarPlus className="size-4 shrink-0 text-brand-300" />
            </button>
          ))}
        </div>
      ) : null}

      {message.kind === 'draft' ? <DraftCard draft={message.draft} onConfirm={onConfirm} onEdit={onEdit} /> : null}

      {message.kind === 'success' ? (
        <div className="space-y-1.5 pl-9">
          <div className="flex items-center gap-2 text-[12px] text-mint-400">
            <CheckCheck className="size-4" />
            <span className="font-semibold">{message.resourceName}</span>
            <Badge tone={message.status === 'approved' ? 'mint' : 'amber'}>{message.status}</Badge>
          </div>
        </div>
      ) : null}

      {message.kind === 'conflict' ? (
        <div className="space-y-2 pl-9">
          <div className="rounded-xl border border-rose-450/25 bg-rose-500/8 p-3">
            <p className="text-[11.5px] font-semibold text-rose-200">Conflict — {message.code}</p>
            {message.alternatives?.length ? (
              <div className="mt-2 space-y-1.5">
                {message.alternatives.slice(0, 3).map((alt) => (
                  <button
                    key={`${alt.resourceId}-${alt.start}`}
                    type="button"
                    onClick={() => onSubstitute(alt, message.intent)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/4 px-2.5 py-2 text-left transition hover:border-brand-400/40"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] font-semibold text-white">{alt.name}</span>
                      <span className="block text-[10.5px] text-slate-400">
                        {fmtRange(alt.start, alt.end)} · {Math.round(alt.matchScore * 100)}% fit
                      </span>
                    </span>
                    <ArrowRight className="size-3.5 shrink-0 text-brand-300" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-[11.5px] text-slate-400">Try a different time or space type.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function OptionCard({ option, intent, onChoose }) {
  const blocked = option.available === false
  return (
    <div
      className={cn(
        'rounded-xl border p-3 transition',
        blocked ? 'border-white/8 bg-white/2 opacity-70' : 'border-white/12 bg-white/4 hover:border-brand-400/40'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-white">{option.resourceName}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {option.location}
            {option.capacity ? ` · seats ${option.capacity}` : ''}
          </p>
        </div>
        {!blocked ? (
          <span className="shrink-0 rounded-full border border-mint-400/30 bg-mint-400/12 px-2 py-0.5 text-[10px] font-semibold text-mint-400">
            free
          </span>
        ) : (
          <span className="shrink-0 rounded-full border border-rose-450/30 bg-rose-450/12 px-2 py-0.5 text-[10px] font-semibold text-rose-350">
            busy
          </span>
        )}
      </div>

      {option.start && option.end ? (
        <p className="num mt-2 text-[11.5px] font-medium text-slate-300">
          {fmtDayShort(option.start)} · {fmtRange(option.start, option.end)}
        </p>
      ) : (
        <p className="mt-2 text-[11px] text-slate-500">{option.note}</p>
      )}

      {(option.matched?.length || option.missing?.length) ? (
        <p className="mt-1.5 text-[10.5px] text-slate-500">
          {option.matched?.length ? `${option.matched.map(humanizeFeature).join(', ')} ✔` : ''}
          {option.missing?.length ? `${option.matched?.length ? ' · ' : ''}missing ${option.missing.map(humanizeFeature).join(', ')}` : ''}
        </p>
      ) : null}

      {option.blockedReason ? (
        <p className="mt-1.5 text-[10.5px] text-amber-450">{option.blockedReason}</p>
      ) : null}

      <Button
        size="sm"
        variant={blocked ? 'secondary' : 'primary'}
        className="mt-2.5 w-full"
        onClick={onChoose}
        disabled={blocked}
      >
        {blocked ? 'Unavailable' : 'Use this space'}
      </Button>
      <span className="sr-only">{intent?.purpose}</span>
    </div>
  )
}

function DraftCard({ draft, onConfirm, onEdit }) {
  if (!draft) return null
  return (
    <div className="space-y-3 rounded-xl border border-brand-400/25 bg-brand-500/6 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-semibold text-white">{draft.resourceName}</p>
          <p className="num mt-0.5 text-[11.5px] text-slate-300">
            {fmtDayShort(draft.start)} · {fmtRange(draft.start, draft.end)}
          </p>
        </div>
        <Badge tone="brand">{humanizeFeature(draft.eventType)}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11.5px]">
        <span className="text-slate-500">
          Title<span className="mt-0.5 block truncate font-medium text-slate-200">{draft.title}</span>
        </span>
        <span className="text-slate-500">
          Headcount<span className="num mt-0.5 block font-medium text-slate-200">{draft.attendees}</span>
        </span>
      </div>

      <PriorityBreakdown score={draft.score} breakdown={draft.breakdown} notes={draft.notes} dense />

      {draft.blocked ? (
        <p className="rounded-lg border border-rose-450/25 bg-rose-500/10 px-2.5 py-2 text-[11.5px] text-rose-200">
          {draft.blockedReason}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button size="sm" className="flex-1" onClick={() => onConfirm(draft)}>
          <CornerDownLeft className="size-3.5" />
          Confirm booking
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onEdit(draft)}>
          <Pencil className="size-3.5" />
          Edit
        </Button>
      </div>
      <p className="text-[10.5px] text-slate-500">
        {draft.eventTypeConfidence != null
          ? `Purpose classified as “${humanizeFeature(draft.eventType)}” (${Math.round(draft.eventTypeConfidence * 100)}% confidence).`
          : null}
      </p>
    </div>
  )
}

export { MessageSquareText }
