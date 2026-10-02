import { db } from '../supabase.js'
import { detectConflicts } from './conflicts.js'
import { notify, audit } from './notify.js'

/**
 * Promote the highest priority waiting requester when a slot is freed (Skill S10)
 *
 * @param {string} resourceId
 * @param {string} freedStart - ISO string
 * @param {string} freedEnd - ISO string
 * @returns {Promise<Object|null>} Promoted waitlist entry
 */
export async function promoteWaitlist(resourceId, freedStart, freedEnd) {
  try {
    const { data: entries, error } = await db.from('waitlist')
      .select('*')
      .eq('resource_id', resourceId)
      .eq('status', 'waiting')
      .lt('start_time', freedEnd)
      .gt('end_time', freedStart)
      .order('priority_score', { ascending: false })
      .order('created_at', { ascending: true })

    if (error || !entries?.length) return null

    const offerWindowMin = Number(process.env.OFFER_WINDOW_MIN) || 30

    for (const w of entries) {
      // Re-verify that no approved booking or blackout blocks this waitlisted window
      const conflict = await detectConflicts({
        resourceId,
        start: w.start_time,
        end: w.end_time
      })

      if (conflict.hard.length || conflict.blackout) {
        continue
      }

      const offerExpiresAt = new Date(Date.now() + offerWindowMin * 60 * 1000).toISOString()

      const { data: updated, error: updateErr } = await db.from('waitlist')
        .update({
          status: 'offered',
          offer_expires_at: offerExpiresAt
        })
        .eq('id', w.id)
        .eq('status', 'waiting') // Guard against race conditions
        .select()
        .single()

      if (updateErr || !updated) continue

      await notify(
        w.user_id,
        'A slot opened up!',
        `Your waitlisted slot for ${w.title || 'a booking'} is available! Confirm within ${offerWindowMin} minutes to claim it.`,
        '/my-bookings?tab=waitlist'
      )

      await audit(null, 'waitlist.offer', 'waitlist', w.id, {
        resourceId,
        offerExpiresAt
      })

      return updated
    }
  } catch (err) {
    console.error('Error promoting waitlist:', err)
  }

  return null
}
