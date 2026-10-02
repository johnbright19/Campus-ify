import { useMemo, useState } from 'react'
import { Info, LayoutGrid } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useRowReveal } from '../../lib/gsap'
import { Tooltip } from '../../components/ui/primitives'

function tone(value, max) {
  if (!value) return 'rgba(255,255,255,0.035)'
  const ratio = Math.min(1, value / Math.max(1, max))
  if (ratio > 0.75) return 'rgba(244,63,94,0.85)'
  if (ratio > 0.5) return 'rgba(251,191,36,0.8)'
  if (ratio > 0.25) return 'rgba(109,94,248,0.72)'
  return 'rgba(34,211,238,0.5)'
}

/**
 * Resource × hour-of-day occupancy. This is the SQL from Build.md §13 rendered
 * as a grid, revealed row by row with GSAP.
 */
export function UtilizationHeatmap({ data, className, onSelectResource, selectedId }) {
  const scope = useRowReveal(data?.rows?.length)
  const [hover, setHover] = useState(null)

  const busiest = useMemo(() => {
    if (!data?.rows?.length) return null
    return data.rows.reduce((best, row) => (row.total > best.total ? row : best), data.rows[0])
  }, [data])

  if (!data) return null

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-[11.5px] text-slate-500">
          <LayoutGrid className="size-3.5" />
          Bookings per hour of day · last {data.days} days
        </p>
        <div className="flex items-center gap-2">
          <span className="text-[10.5px] text-slate-500">quiet</span>
          {[
            'rgba(255,255,255,0.06)',
            'rgba(34,211,238,0.5)',
            'rgba(109,94,248,0.72)',
            'rgba(251,191,36,0.8)',
            'rgba(244,63,94,0.85)',
          ].map((color) => (
            <span
              key={color}
              className="size-3 rounded-[3px] border border-white/10"
              style={{ background: color }}
            />
          ))}
          <span className="text-[10.5px] text-slate-500">saturated</span>
        </div>
      </div>

      <div ref={scope} className="overflow-x-auto">
        <table className="w-full min-w-[52rem] border-separate border-spacing-[3px]">
          <thead>
            <tr>
              <th className="w-40 text-left" />
              {data.hours.map((hour) => (
                <th
                  key={hour}
                  className="num pb-1 text-center text-[10px] font-semibold text-slate-500"
                >
                  {String(hour).padStart(2, '0')}
                </th>
              ))}
              <th className="pl-2 text-right text-[10px] font-semibold text-slate-500">Σ</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.id} data-heat-row>
                <td className="pr-2">
                  <button
                    type="button"
                    onClick={() => onSelectResource?.(row.id)}
                    className={cn(
                      'w-full truncate rounded-lg px-2 py-1.5 text-left text-[11.5px] font-medium transition',
                      selectedId === row.id
                        ? 'bg-brand-500/18 text-white'
                        : 'text-slate-400 hover:bg-white/6 hover:text-white'
                    )}
                  >
                    {row.name}
                  </button>
                </td>
                {row.cells.map((count, index) => (
                  <td key={`${row.id}-${index}`}>
                    <Tooltip
                      content={`${row.name} · ${String(data.hours[index]).padStart(2, '0')}:00 — ${count} booking(s)`}
                    >
                      <button
                        type="button"
                        onMouseEnter={() => setHover({ row: row.id, index, count })}
                        onMouseLeave={() => setHover(null)}
                        aria-label={`${row.name} at ${data.hours[index]}:00, ${count} bookings`}
                        className={cn(
                          'h-6 w-full rounded-[5px] border transition duration-200',
                          hover?.row === row.id && hover?.index === index
                            ? 'border-white/40 scale-105'
                            : 'border-white/6 hover:border-white/25'
                        )}
                        style={{ background: tone(count, data.max) }}
                      />
                    </Tooltip>
                  </td>
                ))}
                <td className="num pl-2 text-right text-[11px] font-semibold text-slate-400">
                  {row.total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {busiest ? (
        <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-slate-500">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          Peak pressure is {busiest.name} at{' '}
          <span className="num mx-1 font-semibold text-slate-300">
            {String(busiest.peakHour).padStart(2, '0')}:00
          </span>
          with {busiest.peakCount} booking(s) in that hour. Empty cells are genuinely free —
          the grid is built from the same rows the conflict engine reads.
        </p>
      ) : null}
    </div>
  )
}
