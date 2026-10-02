import cron from 'node-cron'
import { db } from '../supabase.js'
import { notify, audit } from '../services/notify.js'
import { promoteWaitlist } from '../services/waitlist.js'

const GRACE_MINUTES = Number(process.env.NO_SHOW_GRACE_MIN) || 15

/**
 * Worker: Auto-release approved bookings if user did not check in within grace period (Skill S11)
 */
export async function autoReleaseNoShows() {
  try {
    const cutoff = new Date(Date.now() - GRACE_MINUTES * 60 * 1000).toISOString()

    const { data: overdueBookings, error } = await db.from('bookings')
      .select('*')
      .eq('status', 'approved')
      .is('checked_in_at', null)
      .lt('start_time', cutoff)

    if (error || !overdueBookings?.length) return

    for (const b of overdueBookings) {
      // Idempotent conditional update
      const { data: updated, error: updateErr } = await db.from('bookings')
        .update({ status: 'no_show' })
        .eq('id', b.id)
        .eq('status', 'approved')
        .select()
        .single()

      if (updateErr || !updated) continue

      // Increment user penalty count
      const { data: userProfile } = await db.from('profiles')
        .select('no_show_count')
        .eq('id', b.user_id)
        .single()

      const newCount = (userProfile?.no_show_count || 0) + 1
      await db.from('profiles').update({ no_show_count: newCount }).eq('id', b.user_id)

      await notify(
        b.user_id,
        'Booking released (No-Show)',
        `"${b.title}" was auto-released because check-in was not completed within ${GRACE_MINUTES} minutes of start time.`,
        '/my-bookings'
      )

      await audit(null, 'booking.auto_release', 'booking', b.id, {
        reason: 'no_show_grace_exceeded',
        graceMinutes: GRACE_MINUTES
      })

      // Immediately re-open slot and promote next waitlisted candidate
      await promoteWaitlist(b.resource_id, b.start_time, b.end_time)
      console.log(`[Worker] Auto-released no-show booking ${b.id} and checked waitlist.`)
    }
  } catch (err) {
    console.error('[Worker Error] autoReleaseNoShows:', err)
  }
}

/**
 * Worker: Expire unconfirmed waitlist offers and promote next in queue
 */
export async function expireWaitlistOffers() {
  try {
    const nowIso = new Date().toISOString()
    const { data: expiredOffers, error } = await db.from('waitlist')
      .select('*')
      .eq('status', 'offered')
      .lt('offer_expires_at', nowIso)

    if (error || !expiredOffers?.length) return

    for (const offer of expiredOffers) {
      await db.from('waitlist')
        .update({ status: 'expired' })
        .eq('id', offer.id)
        .eq('status', 'offered')

      await notify(
        offer.user_id,
        'Waitlist offer expired',
        `Your 30-minute reservation offer for "${offer.title || 'a booking'}" has expired.`,
        '/my-bookings?tab=waitlist'
      )

      await audit(null, 'waitlist.expire', 'waitlist', offer.id)

      // Promote next candidate
      await promoteWaitlist(offer.resource_id, offer.start_time, offer.end_time)
      console.log(`[Worker] Expired waitlist offer ${offer.id}, promoting next in line.`)
    }
  } catch (err) {
    console.error('[Worker Error] expireWaitlistOffers:', err)
  }
}

/**
 * Worker: Send 30-minute pre-booking check-in reminders
 */
export async function sendReminders() {
  try {
    const windowStart = new Date(Date.now() + 25 * 60 * 1000).toISOString()
    const windowEnd = new Date(Date.now() + 35 * 60 * 1000).toISOString()

    const { data: upcomingBookings } = await db.from('bookings')
      .select('*')
      .eq('status', 'approved')
      .gte('start_time', windowStart)
      .lte('start_time', windowEnd)

    for (const b of upcomingBookings ?? []) {
      await notify(
        b.user_id,
        'Upcoming booking reminder',
        `"${b.title}" starts in ~30 minutes. Please remember to check in on arrival to prevent auto-release.`,
        '/my-bookings'
      )
    }
  } catch (err) {
    console.error('[Worker Error] sendReminders:', err)
  }
}

/**
 * Worker: Escalate pending bookings that have breached SLA (>24 hours)
 */
export async function escalateStaleApprovals() {
  try {
    const staleCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: staleBookings } = await db.from('bookings')
      .select('id, title, user_id')
      .eq('status', 'pending')
      .lt('created_at', staleCutoff)

    if (!staleBookings?.length) return

    const { data: admins } = await db.from('profiles').select('id').eq('role', 'admin')
    for (const admin of admins ?? []) {
      await notify(
        admin.id,
        'Pending Approvals SLA Escalation',
        `${staleBookings.length} booking request(s) have been waiting for approval for more than 24 hours.`,
        '/admin'
      )
    }
  } catch (err) {
    console.error('[Worker Error] escalateStaleApprovals:', err)
  }
}

/**
 * Start all periodic background workers
 */
export function startWorkers() {
  console.log('[Workers] Initializing automated background workers...')

  // Every 1 minute: auto-release no-shows and expire stale waitlist offers
  cron.schedule('* * * * *', () => {
    autoReleaseNoShows().catch(err => console.error('[Cron] autoReleaseNoShows failure:', err))
    expireWaitlistOffers().catch(err => console.error('[Cron] expireWaitlistOffers failure:', err))
  })

  // Every 5 minutes: send upcoming event reminders
  cron.schedule('*/5 * * * *', () => {
    sendReminders().catch(err => console.error('[Cron] sendReminders failure:', err))
  })

  // Every 15 minutes: escalate stale approvals
  cron.schedule('*/15 * * * *', () => {
    escalateStaleApprovals().catch(err => console.error('[Cron] escalateStaleApprovals failure:', err))
  })

  console.log('[Workers] Background workers scheduled successfully.')
}
