import { db } from '../supabase.js'
import { detectConflicts } from './conflicts.js'

/**
 * Suggest smart alternatives when a booking conflicts (Skill S3)
 * 1. Same resource, shifted hours (+1, +2, +3, -1, -2, -3, +24h, +48h)
 * 2. Similar resources of same type with sufficient capacity at requested time
 *
 * @param {Object} params
 * @param {Object} params.resource - Resource object
 * @param {string} params.start - ISO string
 * @param {string} params.end - ISO string
 * @param {number} [params.attendees=0] - Required attendee capacity
 * @returns {Promise<Array>} Ranked alternatives
 */
export async function suggestAlternatives({ resource, start, end, attendees = 0 }) {
  const durationMs = new Date(end).getTime() - new Date(start).getTime()
  const alternatives = []

  // 1) Same resource, shifted times
  const timeOffsets = [1, 2, 3, -1, -2, -3, 24, 48]
  for (const hrs of timeOffsets) {
    const s = new Date(new Date(start).getTime() + hrs * 3600000)
    const e = new Date(s.getTime() + durationMs)

    // Cannot recommend slots in the past
    if (s.getTime() < Date.now()) continue

    try {
      const conflict = await detectConflicts({
        resourceId: resource.id,
        start: s.toISOString(),
        end: e.toISOString()
      })

      if (!conflict.hard.length && !conflict.blackout) {
        const timePenalty = Math.min(Math.abs(hrs), 48) / 60
        const matchScore = +(1 - timePenalty).toFixed(2)
        const reason = hrs > 0
          ? (hrs >= 24 ? `Next day at ${s.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : `${hrs}h later`)
          : `${-hrs}h earlier`

        alternatives.push({
          type: 'other_time',
          resourceId: resource.id,
          name: resource.name,
          start: s.toISOString(),
          end: e.toISOString(),
          matchScore,
          reasons: [reason, 'same resource']
        })
      }
    } catch {
      // Continue searching
    }
  }

  // 2) Similar resources, same time
  try {
    const { data: others } = await db.from('resources').select('*')
      .eq('type', resource.type)
      .eq('is_active', true)
      .neq('id', resource.id)
      .gte('capacity', attendees)

    for (const other of others ?? []) {
      const conflict = await detectConflicts({
        resourceId: other.id,
        start,
        end
      })

      if (!conflict.hard.length && !conflict.blackout) {
        const wantedFeatures = resource.features ?? []
        const availableFeatures = other.features ?? []
        const featureMatchCount = wantedFeatures.filter(f => availableFeatures.includes(f)).length
        const featureScore = wantedFeatures.length > 0 ? featureMatchCount / wantedFeatures.length : 1

        alternatives.push({
          type: 'other_resource',
          resourceId: other.id,
          name: other.name,
          start,
          end,
          matchScore: +(0.6 + 0.4 * featureScore).toFixed(2),
          reasons: ['same time window', `capacity ${other.capacity}`, other.location || 'campus']
        })
      }
    }
  } catch {
    // Continue
  }

  return alternatives.sort((a, b) => b.matchScore - a.matchScore).slice(0, 5)
}
