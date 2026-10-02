import { Building2, FlaskConical, GraduationCap, Presentation, Trophy, Users } from 'lucide-react'
import { cn } from '../lib/utils'
import { RESOURCE_TYPES } from '../lib/constants'

const ICONS = {
  seminar_hall: Users,
  lab: FlaskConical,
  classroom: GraduationCap,
  auditorium: Building2,
  ground: Trophy,
  equipment: Presentation,
}

export const TYPE_ACCENT = Object.fromEntries(RESOURCE_TYPES.map((t) => [t.value, t.accent]))
export const TYPE_LABEL = Object.fromEntries(RESOURCE_TYPES.map((t) => [t.value, t.label]))

export function ResourceGlyph({ type, size = 40, className, active = true }) {
  const Icon = ICONS[type] ?? Building2
  const accent = TYPE_ACCENT[type] ?? '#6d5ef8'

  return (
    <span
      className={cn('relative flex shrink-0 items-center justify-center rounded-xl border', className)}
      style={{
        width: size,
        height: size,
        borderColor: `${accent}${active ? '45' : '20'}`,
        background: `linear-gradient(140deg, ${accent}22, ${accent}08)`,
        color: accent,
      }}
    >
      <Icon style={{ width: size * 0.46, height: size * 0.46 }} />
    </span>
  )
}

export function FeatureDots({ features = [], className }) {
  return (
    <span className={cn('flex flex-wrap items-center gap-1', className)}>
      {features.slice(0, 3).map((f) => (
        <span
          key={f}
          className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-slate-400"
        >
          {f.replace(/_/g, ' ')}
        </span>
      ))}
      {features.length > 3 ? (
        <span className="num text-[10px] font-semibold text-slate-500">+{features.length - 3}</span>
      ) : null}
    </span>
  )
}

export { ICONS as RESOURCE_ICONS }
