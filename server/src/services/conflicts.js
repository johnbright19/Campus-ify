import { db } from '../supabase.js'

/**
 * Pure function to test time window overlaps.
 * [) interval semantics: touching boundaries (aE == bS or aS == bE) do NOT overlap.
 */
export function overlaps(aS, aE, bS, bE) {
  const startA = new Date(aS).getTime()
  const endA = new Date(aE).getTime()
  const startB = new Date(bS).getTime()
  const endB = new Date(bE).getTime()
  return startA < endB && endA > startB
}

/**
 * Detect hard conflicts (approved bookings), soft conflicts (pending bookings),
 * and blackouts (maintenance/holidays/exams) for a given resource and time window.
 */
export async function detectConflicts({ resourceId, start, end, excludeId = null }) {
  let q = db.from('bookings')
    .select('*, profiles(full_name, role, club, email)')
    .eq('resource_id', resourceId)
    .in('status', ['pending', 'approved'])
    .lt('start_time', end)
    .gt('end_time', start)

  if (excludeId) {
    q = q.neq('id', excludeId)
  }

  const { data: bookings, error } = await q
  if (error) {
    console.error('Error fetching bookings for conflict check:', error)
    throw error
  }

  const { data: blackouts, error: blackoutErr } = await db.from('blackouts')
    .select('*')
    .or(`resource_id.eq.${resourceId},resource_id.is.null`)
    .lt('start_time', end)
    .gt('end_time', start)
    .limit(1)

  if (blackoutErr) {
    console.error('Error checking blackouts:', blackoutErr)
  }

  const allBookings = bookings || []
  return {
    hard: allBookings.filter(b => b.status === 'approved'),
    soft: allBookings.filter(b => b.status === 'pending'),
    blackout: blackouts?.[0] || null
  }
}
