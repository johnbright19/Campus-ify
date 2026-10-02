import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeftRight,
  ArrowRight,
  BellRing,
  CalendarX2,
  CircleDollarSign,
  Clock,
  Gauge,
  Hourglass,
  ListChecks,
  Lock,
  Scale,
  ScanLine,
  ScrollText,
  Sparkles,
  Timer,
  TrendingUp,
  Users,
  Wand2,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { usePageTransition, useStaggerIn } from '../../lib/gsap'
import { CAMPUS } from '../../lib/constants'
import { Logo } from '../../components/Logo'
import { Badge, Button } from '../../components/ui/primitives'

const PROBLEMS = [
  {
    icon: CalendarX2,
    title: 'Double bookings',
    body: 'Two clubs, one hall, two WhatsApp screenshots. Someone has to lose and someone has to explain.',
  },
  {
    icon: CircleDollarSign,
    title: 'Quiet favouritism',
    body: 'Approvals happen in DMs. Nobody can say why one request won over another.',
  },
  {
    icon: Gauge,
    title: 'Rooms sitting idle',
    body: 'A booking is abandoned, the room stays dark, and the people who wanted it never find out.',
  },
]

const PIPELINE = [
  { icon: Wand2, label: 'Parse', body: '“Hall for 80 tomorrow 2–4 with a projector” becomes structured intent.' },
  { icon: Users, label: 'Match', body: 'Capacity, features and location are checked against the real inventory.' },
  { icon: ArrowLeftRight, label: 'Detect', body: 'Overlaps are classified hard, soft or blackout — to the millisecond.' },
  { icon: Scale, label: 'Score', body: 'Every request gets a transparent priority breakdown.' },
  { icon: Sparkles, label: 'Resolve', body: 'Alternatives, mediation and a written reason, every time.' },
  { icon: Timer, label: 'Automate', body: 'No-shows release, waitlists promote, reminders go out on their own.' },
]

const FEATURES = [
  {
    icon: Lock,
    title: 'A constraint, not a promise',
    body: 'A Postgres exclusion constraint makes overlapping approvals impossible — even if application code has a bug.',
    tone: 'brand',
  },
  {
    icon: Scale,
    title: 'Explainable priority',
    body: 'Event type, role, fairness, advance notice and no-show history, shown as signed factors a user can contest.',
    tone: 'aqua',
  },
  {
    icon: ListChecks,
    title: 'Ranked alternatives',
    body: 'One click moves a rejected request to the same room later, or a similar room at the same time.',
    tone: 'mint',
  },
  {
    icon: Hourglass,
    title: 'Waitlist that promotes itself',
    body: 'Cancel anything and the highest-scoring person gets a 30-minute offer, then the next, then the next.',
    tone: 'amber',
  },
  {
    icon: Wand2,
    title: 'Concierge booking',
    body: 'Natural language in, ranked options out. The model drafts; only you can confirm.',
    tone: 'brand',
  },
  {
    icon: Clock,
    title: 'No-show auto-release',
    body: 'Nobody checked in within the grace window? The slot goes back to the pool and the abuser gets a strike.',
    tone: 'rose',
  },
  {
    icon: TrendingUp,
    title: 'Insights, not just charts',
    body: 'A digest that quotes only its own aggregates: “Hall A is 94% booked weekdays; shift club meetings.”',
    tone: 'aqua',
  },
  {
    icon: ScrollText,
    title: 'Everything is auditable',
    body: 'Every AI recommendation, override and override-reason lands in the audit trail next to the decision.',
    tone: 'mint',
  },
]

const TONE_RING = {
  brand: 'border-brand-400/25 bg-brand-500/10 text-brand-300',
  aqua: 'border-aqua-400/25 bg-aqua-400/10 text-aqua-400',
  mint: 'border-mint-400/25 bg-mint-400/10 text-mint-400',
  amber: 'border-amber-450/25 bg-amber-450/10 text-amber-450',
  rose: 'border-rose-450/25 bg-rose-450/10 text-rose-450',
}

export default function LandingPage() {
  const navigate = useNavigate()
  const scope = useStaggerIn([])
  const pageRef = usePageTransition('landing')

  return (
    <div ref={pageRef} className="relative min-h-dvh overflow-hidden">
      {/* Aurora background */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="aurora-blob top-[-14rem] left-[-10rem] size-[42rem] bg-brand-500/22" />
        <div className="aurora-blob top-[-6rem] right-[-12rem] size-[36rem] bg-aqua-500/16" style={{ animationDelay: '-6s' }} />
        <div className="aurora-blob bottom-[-18rem] left-1/3 size-[38rem] bg-lilac-400/14" style={{ animationDelay: '-11s' }} />
        <div className="grid-noise absolute inset-0 opacity-40" />
      </div>

      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-6">
        <Logo />
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate('/login')}>
            Sign in
          </Button>
          <Button size="sm" rightIcon={ArrowRight} onClick={() => navigate('/login')}>
            Enter console
          </Button>
        </div>
      </header>

      <main ref={scope} className="mx-auto max-w-6xl px-5 pb-24">
        {/* Hero */}
        <section className="pt-10 pb-16 sm:pt-16">
          <Badge tone="brand" dot className="reveal">
            {CAMPUS.short} · 4-hour build · deterministic core, AI on top
          </Badge>

          <h1 className="reveal mt-6 max-w-4xl text-4xl leading-[1.05] font-bold tracking-tight text-balance sm:text-6xl">
            <span className="gradient-text">Campus booking that resolves itself</span>
            <span className="block text-slate-300">fairly, explainably, automatically.</span>
          </h1>

          <p className="reveal mt-6 max-w-2xl text-[15px] leading-relaxed text-slate-400 sm:text-base">
            Campus-ify does not just prevent double-booking. It ranks every request with a
            transparent score, hands the loser real alternatives, promotes the waitlist the moment
            a slot frees up, and keeps rooms from sitting idle.
          </p>

          <div className="reveal mt-8 flex flex-wrap items-center gap-3">
            <Button size="lg" rightIcon={ArrowRight} onClick={() => navigate('/login')}>
              Try the live demo
            </Button>
            <Button size="lg" variant="secondary" leftIcon={ScanLine} onClick={() => navigate('/login')}>
              Sign in with Google
            </Button>
          </div>

          <dl className="reveal mt-12 grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ['10', 'bookable resources'],
              ['6', 'priority factors'],
              ['0', 'possible double bookings'],
              ['8', 'automation jobs'],
            ].map(([value, label]) => (
              <div key={label} className="surface-sunken px-3.5 py-3">
                <dt className="num text-2xl font-bold tracking-tight text-white">{value}</dt>
                <dd className="mt-1 text-[11.5px] leading-snug text-slate-500">{label}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Problem */}
        <section className="reveal border-t border-white/8 py-14">
          <p className="eyebrow">The status quo</p>
          <h2 className="h-title mt-2">Three ways a booking sheet fails</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {PROBLEMS.map((problem) => (
              <div key={problem.title} className="reveal card card-hover card-pad">
                <span className="flex size-10 items-center justify-center rounded-xl border border-rose-450/25 bg-rose-450/10 text-rose-450">
                  <problem.icon className="size-4.5" />
                </span>
                <h3 className="mt-4 text-[15px] font-semibold text-white">{problem.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-slate-400">{problem.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Pipeline */}
        <section className="reveal border-t border-white/8 py-14">
          <p className="eyebrow">Every request, end to end</p>
          <h2 className="h-title mt-2">The resolution pipeline</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Deterministic services make every decision. Language models parse, explain and
            summarise on top — and each one has a fallback, so the product never dies on a timeout.
          </p>

          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PIPELINE.map((step, index) => (
              <li key={step.label} className="reveal card card-hover card-pad">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-xl border border-brand-400/25 bg-brand-500/10 text-brand-300">
                    <step.icon className="size-4" />
                  </span>
                  <span className="num text-xs font-semibold text-slate-500">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h3 className="text-[14.5px] font-semibold text-white">{step.label}</h3>
                </div>
                <p className="mt-3 text-[12.5px] leading-relaxed text-slate-400">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Features */}
        <section className="reveal border-t border-white/8 py-14">
          <p className="eyebrow">What makes it advanced</p>
          <h2 className="h-title mt-2">Eight things that are not a spreadsheet</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="reveal card card-hover card-pad">
                <span className={cn('flex size-10 items-center justify-center rounded-xl border', TONE_RING[feature.tone])}>
                  <feature.icon className="size-4.5" />
                </span>
                <h3 className="mt-4 text-[14px] leading-snug font-semibold text-white">{feature.title}</h3>
                <p className="mt-2 text-[12.5px] leading-relaxed text-slate-400">{feature.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="reveal mt-6 overflow-hidden rounded-3xl border border-brand-400/25 bg-gradient-to-br from-brand-600/25 via-ink-900/60 to-aqua-500/12 p-8 sm:p-12">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-2xl">
              <p className="eyebrow">Ready when you are</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Sign in as a student, an approver or an administrator.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">
                Every role sees a different console: role-based views, an approvals inbox with AI
                briefs, a mediator desk for close calls, and an operations room wired to real
                automation.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" rightIcon={ArrowRight} onClick={() => navigate('/login')}>
                Choose an account
              </Button>
              <Link to="/login" className="btn-secondary px-5 py-3 text-[15px]">
                <BellRing className="size-4" />
                See the approvals inbox
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/8 py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 text-[11.5px] text-slate-500">
          <span>{CAMPUS.name} · {CAMPUS.tagline}</span>
          <span className="num">React · Tailwind · GSAP · FullCalendar · deterministic engines</span>
        </div>
      </footer>
    </div>
  )
}
