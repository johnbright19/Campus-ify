import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarCheck,
  ChevronRight,
  Gauge,
  Lock,
  Scale,
  ShieldCheck,
  Sparkles,
  Wand2,
} from 'lucide-react'
import { usePageTransition } from '../../lib/gsap'
import { CAMPUS, ROLE_LABEL, ROLE_RANK } from '../../lib/constants'
import { DEMO_ACCOUNTS } from '../../lib/seed'
import { useAuth } from '../../app/AuthProvider'
import { useToast } from '../../app/ToastProvider'
import { Logo } from '../../components/Logo'
import { Badge, Button } from '../../components/ui/primitives'

const HIGHLIGHTS = [
  {
    icon: Scale,
    title: 'Priorities you can argue with',
    body: 'Six signed factors, shown to whoever loses the slot. No more “because I said so”.',
  },
  {
    icon: Wand2,
    title: 'Book by describing it',
    body: 'Type a sentence. The concierge parses it, checks live availability and drafts the form.',
  },
  {
    icon: CalendarCheck,
    title: 'Automation that keeps rooms full',
    body: 'No-show release, waitlist promotion, reminders and escalations run without anyone asking.',
  },
]

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { signIn } = useAuth()
  const { push } = useToast()
  const [pending, setPending] = useState(null)
  const [selectedId, setSelectedId] = useState('usr_ieee')
  const pageRef = usePageTransition('login')

  const redirectTo = location.state?.from || '/dashboard'

  const handleChoose = async (account) => {
    setPending(account.id)
    try {
      // signIn links the session to the matching row in Postgres, so the toast
      // names the identity the rest of the app (and every booking) will use.
      const result = await signIn(account.id)
      const identity = result?.linked ?? account
      push({
        title: `Signed in as ${identity.fullName}`,
        body: `${ROLE_LABEL[identity.role] ?? account.role} · ${identity.club || identity.department || 'campus'}`,
        kind: 'success',
      })
      navigate(redirectTo, { replace: true })
    } catch (error) {
      // Never leave the buttons disabled if the handshake fails.
      push({ title: 'Could not sign in', body: error.message, kind: 'error' })
    } finally {
      setPending(null)
    }
  }

  const grouped = DEMO_ACCOUNTS.slice().sort((a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role])
  // The primary button signs in straight away; the grid below switches role.
  const defaultAccount = DEMO_ACCOUNTS.find((a) => a.id === selectedId) ?? DEMO_ACCOUNTS[0]

  return (
    <div ref={pageRef} className="relative min-h-dvh overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="aurora-blob top-[-12rem] left-[-8rem] size-[34rem] bg-brand-500/22" />
        <div className="aurora-blob right-[-10rem] bottom-[-14rem] size-[32rem] bg-aqua-500/14" style={{ animationDelay: '-8s' }} />
        <div className="grid-noise absolute inset-0 opacity-30" />
      </div>

      <div className="mx-auto grid min-h-dvh max-w-6xl items-center gap-10 px-5 py-10 lg:grid-cols-[1.15fr_0.85fr]">
        {/* Left: pitch */}
        <section>
          <button type="button" onClick={() => navigate('/')} className="mb-10 inline-flex">
            <Logo />
          </button>

          <Badge tone="brand" dot>
            {CAMPUS.name}
          </Badge>

          <h1 className="mt-5 text-3xl leading-tight font-bold tracking-tight text-balance sm:text-4xl">
            <span className="gradient-text">Sign in to the operations console.</span>
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-400">
            Choose a seeded campus account to open its role-based workspace. With the API connected,
            bookings are saved to Supabase; otherwise the app runs on its offline demo data.
          </p>

          <ul className="mt-8 space-y-4">
            {HIGHLIGHTS.map((item) => (
              <li key={item.title} className="flex items-start gap-3.5">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-brand-400/25 bg-brand-500/10 text-brand-300">
                  <item.icon className="size-4" />
                </span>
                <span>
                  <span className="block text-[14px] font-semibold text-white">{item.title}</span>
                  <span className="mt-0.5 block max-w-md text-[12.5px] leading-relaxed text-slate-400">
                    {item.body}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-10 flex flex-wrap items-center gap-4 text-[11.5px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-mint-400" />
              Roles enforced on every route
            </span>
            <span className="flex items-center gap-1.5">
              <Gauge className="size-3.5 text-brand-300" />
              Supabase sync when connected
            </span>
            <span className="flex items-center gap-1.5">
              <Lock className="size-3.5 text-aqua-400" />
              Offline demo available
            </span>
          </div>
        </section>

        {/* Right: sign-in card */}
        <section className="card card-pad relative overflow-hidden">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/5">
              <ShieldCheck className="size-5 text-mint-400" />
            </span>
            <div>
              <p className="text-[14px] font-semibold text-white">Choose your campus account</p>
              <p className="text-[11.5px] text-slate-500">Student, committee, department or administration</p>
            </div>
          </div>

          <label className="mt-5 block text-[11.5px] font-medium text-slate-400" htmlFor="demo-account">
            Sign in as
          </label>
          <select
            id="demo-account"
            value={defaultAccount?.id ?? ''}
            onChange={(event) => setSelectedId(event.target.value)}
            disabled={Boolean(pending)}
            className="mt-1.5 w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-3 text-[13px] text-white outline-none focus:border-brand-400/50"
          >
            {grouped.map((account) => (
              <option key={account.id} value={account.id}>
                {ROLE_LABEL[account.role]} · {account.fullName} · {account.department || account.club}
              </option>
            ))}
          </select>

          <Button
            size="lg"
            className="mt-5 w-full"
            leftIcon={Sparkles}
            rightIcon={ArrowRight}
            loading={Boolean(pending)}
            onClick={() => handleChoose(defaultAccount)}
          >
            Continue as {defaultAccount?.fullName}
          </Button>
          <p className="mt-2 text-center text-[11px] text-slate-500">
            Select a profile, then continue directly to its workspace.
          </p>

          <p className="mt-5 flex items-start gap-2 rounded-xl border border-white/8 bg-white/3 p-3 text-[11.5px] leading-relaxed text-slate-400">
            <Building2 className="mt-0.5 size-3.5 shrink-0 text-slate-500" />
            In a real deployment this button calls
            <code className="mx-1 rounded bg-white/8 px-1 font-mono text-[10.5px]">signInWithOAuth</code>
            and Google returns a JWT that the Node API verifies on every request.
          </p>
        </section>
      </div>
    </div>
  )
}

function GoogleGlyph({ className }) {
  return (
    <svg viewBox="0 0 18 18" className={className} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path fill="#FBBC05" d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  )
}
