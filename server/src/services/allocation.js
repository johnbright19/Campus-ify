import { db } from '../supabase.js'
import { detectConflicts } from './conflicts.js'
import { scorePriority } from './priority.js'
import { suggestAlternatives } from './suggestions.js'
import { notify, audit } from './notify.js'
import { validateFacilityPolicy } from './policies.js'

/**
 * Skill S16 / Dynamic Allocation:
 * Find the least contested, optimal free windows for a resource given a duration and target date.
 *
 * @param {Object} params
 * @param {string} params.resourceId
 * @param {number} [params.durationMinutes=120]
 * @param {string} [params.date] - YYYY-MM-DD (defaults to today/tomorrow)
 * @returns {Promise<Array>} List of recommended free time slots
 */
export async function suggestBestTimes({ resourceId, durationMinutes = 120, date = null }) {
  const targetDateStr = date || new Date().toISOString().slice(0, 10)
  const targetDate = new Date(targetDateStr)

  // Standard campus operational hours: 08:00 to 20:00 (8 AM - 8 PM)
  const startOfDay = new Date(targetDate)
  startOfDay.setHours(8, 0, 0, 0)

  const endOfDay = new Date(targetDate)
  endOfDay.setHours(20, 0, 0, 0)

  // Fetch all existing bookings and blackouts for this resource on this day
  const { data: bookings } = await db.from('bookings')
    .select('start_time, end_time, status')
    .eq('resource_id', resourceId)
    .in('status', ['pending', 'approved'])
    .gte('end_time', startOfDay.toISOString())
    .lte('start_time', endOfDay.toISOString())
    .order('start_time', { ascending: true })

  const { data: blackouts } = await db.from('blackouts')
    .select('start_time, end_time, reason')
    .or(`resource_id.eq.${resourceId},resource_id.is.null`)
    .gte('end_time', startOfDay.toISOString())
    .lte('start_time', endOfDay.toISOString())

  const blockedRanges = [
    ...(bookings || []).map(b => ({ start: new Date(b.start_time).getTime(), end: new Date(b.end_time).getTime(), type: b.status })),
    ...(blackouts || []).map(b => ({ start: new Date(b.start_time).getTime(), end: new Date(b.end_time).getTime(), type: 'blackout' }))
  ]

  const durationMs = durationMinutes * 60 * 1000
  const stepMs = 30 * 60 * 1000 // 30-minute intervals
  const recommendations = []

  let slotStart = startOfDay.getTime()
  const now = Date.now()

  while (slotStart + durationMs <= endOfDay.getTime()) {
    const slotEnd = slotStart + durationMs

    if (slotStart > now) {
      // Check overlap against blocked ranges
      const isBlocked = blockedRanges.some(r => slotStart < r.end && slotEnd > r.start)

      if (!isBlocked) {
        const sDate = new Date(slotStart)
        const eDate = new Date(slotEnd)

        // Give a slight score preference to prime afternoon/morning slots vs edge hours
        const hour = sDate.getHours()
        const isPrimeTime = hour >= 10 && hour <= 16

        recommendations.push({
          start: sDate.toISOString(),
          end: eDate.toISOString(),
          startTime: sDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
          endTime: eDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
          durationMinutes,
          score: isPrimeTime ? 0.95 : 0.85,
          tag: isPrimeTime ? 'Peak Convenience' : 'Less Contested'
        })
      }
    }

    slotStart += stepMs
  }

  return recommendations.slice(0, 6)
}

/**
 * Atomic Multi-Resource Bundle Allocation:
 * Allocates a primary venue and accompanying equipment/rooms simultaneously (e.g. Hall + Projector kit).
 * Guarantees all-or-nothing allocation: if any item clashes, none are booked and alternatives are provided.
 *
 * @param {Object} params
 * @param {Object} params.user
 * @param {string} params.title
 * @param {string} [params.purpose]
 * @param {string} [params.eventType='club']
 * @param {number} params.attendees
 * @param {string} params.start - ISO string
 * @param {string} params.end - ISO string
 * @param {Array<string>} params.resourceIds - Array of resource UUIDs to bundle
 */
export async function allocateBundle({
  user,
  title,
  purpose,
  eventType = 'club',
  attendees,
  start,
  end,
  resourceIds = []
}) {
  if (!resourceIds || resourceIds.length === 0) {
    throw new Error('At least one resourceId is required for bundle allocation')
  }

  // 1. Fetch details of all requested resources
  const { data: resources, error: resErr } = await db.from('resources')
    .select('*')
    .in('id', resourceIds)

  if (resErr || !resources || resources.length !== resourceIds.length) {
    throw new Error('One or more requested resources do not exist')
  }

  // 2. Validate all resources for conflicts and policies
  const conflictsReport = []
  for (const res of resources) {
    if (!res.is_active) {
      conflictsReport.push({ resourceId: res.id, name: res.name, reason: 'Resource is marked inactive' })
      continue
    }

    const policyCheck = validateFacilityPolicy({ resource: res, user, start, end })
    if (!policyCheck.valid) {
      conflictsReport.push({
        resourceId: res.id,
        name: res.name,
        reason: `Policy Violation: ${policyCheck.error.message}`
      })
      continue
    }

    if (res.type !== 'equipment' && attendees > res.capacity) {
      conflictsReport.push({
        resourceId: res.id,
        name: res.name,
        reason: `Capacity exceeded (Max: ${res.capacity}, Requested: ${attendees})`
      })
      continue
    }

    const conflict = await detectConflicts({
      resourceId: res.id,
      start,
      end
    })

    if (conflict.blackout) {
      conflictsReport.push({
        resourceId: res.id,
        name: res.name,
        reason: `Blackout: ${conflict.blackout.reason || 'Closed'}`
      })
    } else if (conflict.hard.length > 0) {
      const alternatives = await suggestAlternatives({ resource: res, start, end, attendees })
      conflictsReport.push({
        resourceId: res.id,
        name: res.name,
        reason: 'Hard conflict with an approved booking',
        conflicts: conflict.hard,
        alternatives
      })
    }
  }

  // If any resource in the bundle has a conflict, reject the entire bundle atomically
  if (conflictsReport.length > 0) {
    return {
      success: false,
      code: 'BUNDLE_CONFLICT',
      message: 'One or more items in the resource bundle are unavailable for the requested window.',
      conflicts: conflictsReport
    }
  }

  // 3. Score priority for the request
  const { score, breakdown } = await scorePriority({
    user,
    eventType,
    start
  })

  // 4. Create booking group container
  const { data: group, error: groupErr } = await db.from('booking_groups').insert({
    user_id: user.id
  }).select().single()

  if (groupErr) {
    throw new Error(`Failed to create booking group: ${groupErr.message}`)
  }

  // 5. Insert individual bookings linked to group_id
  const insertedBookings = []
  for (const res of resources) {
    const status = res.requires_approval ? 'pending' : 'approved'

    const { data: booking, error: bookErr } = await db.from('bookings').insert({
      group_id: group.id,
      user_id: user.id,
      resource_id: res.id,
      title: `${title} [${res.name}]`,
      purpose,
      event_type: eventType,
      attendees: res.type === 'equipment' ? 0 : attendees,
      start_time: start,
      end_time: end,
      status,
      priority_score: score,
      priority_breakdown: breakdown
    }).select().single()

    if (bookErr) {
      // Rollback inserted items if exclusion constraint fails
      await db.from('bookings').delete().eq('group_id', group.id)
      await db.from('booking_groups').delete().eq('id', group.id)
      throw new Error(`Exclusion constraint triggered during bundle insert: ${bookErr.message}`)
    }

    insertedBookings.push(booking)
  }

  await audit(user.id, 'allocation.bundle', 'booking_group', group.id, {
    bundleSize: insertedBookings.length,
    score
  })

  return {
    success: true,
    groupId: group.id,
    score,
    breakdown,
    bookings: insertedBookings
  }
}

/**
 * Create an institutional blackout window (Exams, maintenance, campus holiday)
 *
 * @param {Object} params
 * @param {string|null} params.resourceId - Null for all campus facilities
 * @param {string} params.reason
 * @param {string} params.start
 * @param {string} params.end
 * @param {string} params.actorId
 */
export async function createBlackout({ resourceId = null, reason, start, end, actorId }) {
  const { data: blackout, error } = await db.from('blackouts').insert({
    resource_id: resourceId,
    reason,
    start_time: start,
    end_time: end
  }).select().single()

  if (error) {
    throw new Error(`Failed to create blackout: ${error.message}`)
  }

  // Detect affected bookings and notify them
  let q = db.from('bookings').select('*, profiles(id, email, full_name)')
    .in('status', ['pending', 'approved'])
    .lt('start_time', end)
    .gt('end_time', start)

  if (resourceId) {
    q = q.eq('resource_id', resourceId)
  }

  const { data: impacted } = await q
  for (const b of impacted || []) {
    await notify(
      b.user_id,
      'Schedule Alert: Facility Blackout',
      `Your booking "${b.title}" clashes with a scheduled blackout: ${reason}. Please choose an alternative slot.`,
      '/my-bookings'
    )
  }

  await audit(actorId, 'blackout.create', 'blackout', blackout.id, {
    reason,
    impactedCount: impacted?.length || 0
  })

  return {
    blackout,
    impactedBookings: impacted || []
  }
}
