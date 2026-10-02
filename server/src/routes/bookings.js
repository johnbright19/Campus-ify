import { Router } from 'express'
import { z } from 'zod'
import { db } from '../supabase.js'
import { detectConflicts } from '../services/conflicts.js'
import { scorePriority } from '../services/priority.js'
import { suggestAlternatives } from '../services/suggestions.js'
import { promoteWaitlist } from '../services/waitlist.js'
import { notify, audit } from '../services/notify.js'
import { generateQRToken, verifyQRToken } from '../services/qr.js'
import { requireRole } from '../middleware/auth.js'
import { validateFacilityPolicy, getPolicyForResource } from '../services/policies.js'

const router = Router()

const BookingBodySchema = z.object({
  resourceId: z.string().uuid(),
  title: z.string().min(3).max(120),
  purpose: z.string().max(500).optional(),
  eventType: z.enum(['exam', 'placement', 'academic', 'fest', 'club', 'personal']).default('club'),
  attendees: z.number().int().min(1).max(5000),
  start: z.string().datetime(),
  end: z.string().datetime()
}).refine(v => new Date(v.end) > new Date(v.start), 'End time must be after start time')

// POST /api/bookings - Create booking with deterministic priority & exclusion protection
router.post('/', async (req, res) => {
  const parsed = BookingBodySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'INVALID', message: parsed.error.issues[0].message } })
  }
  const b = parsed.data

  const { data: resource, error: resErr } = await db.from('resources').select('*').eq('id', b.resourceId).single()
  if (resErr || !resource?.is_active) {
    return res.status(404).json({ error: { code: 'NO_RESOURCE', message: 'Requested resource is not available' } })
  }
  if (b.attendees > resource.capacity) {
    return res.status(400).json({ error: { code: 'CAPACITY', message: `Resource capacity is ${resource.capacity}` } })
  }
  if (new Date(b.start) < new Date()) {
    return res.status(400).json({ error: { code: 'PAST', message: 'Cannot create a booking in the past' } })
  }

  const policyCheck = validateFacilityPolicy({ resource, user: req.user, start: b.start, end: b.end })
  if (!policyCheck.valid) {
    return res.status(403).json({ error: { code: 'POLICY_VIOLATION', message: policyCheck.error.message } })
  }

  // 1. Conflict detection (S1)
  const { hard, soft, blackout } = await detectConflicts({
    resourceId: b.resourceId,
    start: b.start,
    end: b.end
  })

  if (blackout) {
    return res.status(409).json({
      error: { code: 'BLACKOUT', message: blackout.reason || 'Resource is closed for scheduled maintenance/holiday' }
    })
  }

  // 2. Priority scoring (S2)
  const { score, breakdown } = await scorePriority({
    user: req.user,
    eventType: b.eventType,
    start: b.start
  })

  // 3. Hard conflict handling -> suggest smart alternatives (S3)
  if (hard.length) {
    const alternatives = await suggestAlternatives({ ...b, resource })
    return res.status(409).json({
      error: { code: 'CONFLICT', message: 'This slot is already booked and approved.' },
      conflictingBookings: hard,
      alternatives,
      canJoinWaitlist: true,
      score,
      breakdown
    })
  }

  // 4. Initial status determination
  const status = resource.requires_approval ? 'pending' : 'approved'
  const qrToken = status === 'approved' ? generateQRToken('pending-id', b.start) : null

  // 5. Database insert protected by Postgres exclusion constraint
  const { data: created, error } = await db.from('bookings').insert({
    user_id: req.user.id,
    resource_id: b.resourceId,
    title: b.title,
    purpose: b.purpose,
    event_type: b.eventType,
    attendees: b.attendees,
    start_time: b.start,
    end_time: b.end,
    status,
    priority_score: score,
    priority_breakdown: breakdown,
    qr_token: qrToken
  }).select().single()

  // 6. Exclusion constraint race condition catch (23P01)
  if (error?.code === '23P01') {
    const alternatives = await suggestAlternatives({ ...b, resource })
    return res.status(409).json({
      error: { code: 'RACE_CONFLICT', message: 'Another user just confirmed this slot a moment ago.' },
      alternatives,
      canJoinWaitlist: true
    })
  }

  if (error) {
    return res.status(500).json({ error: { code: 'DB_ERROR', message: error.message } })
  }

  // Update actual QR token with generated UUID if approved
  if (status === 'approved') {
    const realQr = generateQRToken(created.id, b.start)
    await db.from('bookings').update({ qr_token: realQr }).eq('id', created.id)
    created.qr_token = realQr
  }

  await audit(req.user.id, 'booking.create', 'booking', created.id, { status, score })

  res.status(201).json({
    booking: created,
    softConflictsCount: soft.length,
    softConflicts: soft
  })
})

// GET /api/bookings/mine - List all current user's bookings
router.get('/mine', async (req, res) => {
  const { data, error } = await db.from('bookings')
    .select('*, resources(name, location, type)')
    .eq('user_id', req.user.id)
    .order('start_time', { ascending: false })

  if (error) return res.status(500).json({ error: { code: 'DB_ERROR', message: error.message } })
  res.json(data || [])
})

// GET /api/bookings/calendar - Public / authenticated calendar entries
router.get('/calendar', async (req, res) => {
  const { resourceId, from, to } = req.query
  let q = db.from('bookings')
    .select('id, title, event_type, start_time, end_time, status, resource_id, resources(name)')
    .in('status', ['pending', 'approved'])

  if (resourceId) q = q.eq('resource_id', resourceId)
  if (from) q = q.gte('start_time', from)
  if (to) q = q.lte('end_time', to)

  const { data, error } = await q
  if (error) return res.status(500).json({ error: { code: 'DB_ERROR', message: error.message } })
  res.json(data || [])
})

// POST /api/bookings/:id/cancel - User or admin cancels booking -> triggers waitlist auto-promotion (S10)
router.post('/:id/cancel', async (req, res) => {
  const { data: booking } = await db.from('bookings').select('*').eq('id', req.params.id).single()

  if (!booking || (booking.user_id !== req.user.id && req.user.role !== 'admin')) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You do not have permission to cancel this booking' } })
  }

  const { error } = await db.from('bookings').update({ status: 'cancelled' }).eq('id', booking.id)
  if (error) return res.status(500).json({ error: { code: 'DB_ERROR', message: error.message } })

  await audit(req.user.id, 'booking.cancel', 'booking', booking.id)

  // Promote waiting user immediately
  const promoted = await promoteWaitlist(booking.resource_id, booking.start_time, booking.end_time)

  res.json({ ok: true, promotedWaitlistEntry: promoted })
})

// PATCH /api/bookings/:id/approve - Approver verifies & confirms booking
router.patch('/:id/approve', requireRole('faculty', 'hod', 'admin'), async (req, res) => {
  const { verified = false } = req.body
  const { data: existing } = await db.from('bookings').select('*, resources(*)').eq('id', req.params.id).single()

  if (!existing) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Booking not found' } })
  }

  const policy = getPolicyForResource(existing.resources)
  const roleHierarchy = { admin: 4, hod: 3, faculty: 2, student: 1 }
  const userLevel = roleHierarchy[req.user.role] || 1
  const requiredLevel = roleHierarchy[policy.approverRole] || 2
  
  if (userLevel < requiredLevel) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: `Only ${policy.approverRole} or higher can approve bookings for this facility.` } })
  }

  const qrToken = generateQRToken(existing.id, existing.start_time)

  const { data, error } = await db.from('bookings')
    .update({ status: 'approved', verified, qr_token: qrToken })
    .eq('id', req.params.id)
    .select()
    .single()

  if (error?.code === '23P01') {
    return res.status(409).json({
      error: { code: 'CONFLICT', message: 'Another approved booking already occupies this resource and time slot.' }
    })
  }

  if (error) return res.status(500).json({ error: { code: 'DB_ERROR', message: error.message } })

  await notify(data.user_id, 'Booking Approved! 🎉', `Your reservation for "${data.title}" has been confirmed.`, '/my-bookings')
  await audit(req.user.id, 'booking.approve', 'booking', data.id, { verified })

  res.json(data)
})

// PATCH /api/bookings/:id/reject - Approver rejects booking with reason
router.patch('/:id/reject', requireRole('faculty', 'hod', 'admin'), async (req, res) => {
  const { reason = 'Facility unavailable or scheduling priority conflict' } = req.body
  const { data: existing } = await db.from('bookings').select('*, resources(*)').eq('id', req.params.id).single()

  if (!existing) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Booking not found' } })
  }

  const policy = getPolicyForResource(existing.resources)
  const roleHierarchy = { admin: 4, hod: 3, faculty: 2, student: 1 }
  if ((roleHierarchy[req.user.role] || 1) < (roleHierarchy[policy.approverRole] || 2)) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: `Only ${policy.approverRole} or higher can reject bookings for this facility.` } })
  }

  const { data, error } = await db.from('bookings')
    .update({ status: 'rejected' })
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: { code: 'DB_ERROR', message: error.message } })

  await notify(data.user_id, 'Booking Request Update', `Your request for "${data.title}" was not approved: ${reason}`, '/my-bookings')
  await audit(req.user.id, 'booking.reject', 'booking', data.id, { reason })

  res.json(data)
})

// POST /api/bookings/waitlist - Join waitlist for contested slot
router.post('/waitlist', async (req, res) => {
  const { resourceId, title, eventType = 'club', start, end } = req.body
  if (!resourceId || !start || !end) {
    return res.status(400).json({ error: { code: 'INVALID', message: 'resourceId, start, end required' } })
  }

  const { score } = await scorePriority({ user: req.user, eventType, start })

  const { data, error } = await db.from('waitlist').insert({
    user_id: req.user.id,
    resource_id: resourceId,
    title: title || 'Waitlisted slot',
    event_type: eventType,
    start_time: start,
    end_time: end,
    priority_score: score,
    status: 'waiting'
  }).select().single()

  if (error) return res.status(500).json({ error: { code: 'DB_ERROR', message: error.message } })

  await audit(req.user.id, 'waitlist.join', 'waitlist', data.id, { score })
  res.status(201).json(data)
})

// POST /api/bookings/waitlist/:id/confirm - Claim offered waitlist reservation
router.post('/waitlist/:id/confirm', async (req, res) => {
  const { data: entry } = await db.from('waitlist').select('*').eq('id', req.params.id).single()
  if (!entry || entry.user_id !== req.user.id || entry.status !== 'offered') {
    return res.status(400).json({ error: { code: 'INVALID', message: 'No active offer for this waitlist item' } })
  }

  if (entry.offer_expires_at && new Date() > new Date(entry.offer_expires_at)) {
    await db.from('waitlist').update({ status: 'expired' }).eq('id', entry.id)
    return res.status(400).json({ error: { code: 'EXPIRED', message: 'Waitlist offer has expired' } })
  }

  // Convert waitlist to confirmed booking
  const qrToken = generateQRToken('pending', entry.start_time)
  const { data: booking, error } = await db.from('bookings').insert({
    user_id: req.user.id,
    resource_id: entry.resource_id,
    title: entry.title || 'Waitlist Confirmed Booking',
    event_type: entry.event_type,
    attendees: 30,
    start_time: entry.start_time,
    end_time: entry.end_time,
    status: 'approved',
    priority_score: entry.priority_score,
    qr_token: qrToken
  }).select().single()

  if (error) {
    return res.status(409).json({ error: { code: 'CONFLICT', message: 'Slot was claimed or conflicted' } })
  }

  await db.from('waitlist').update({ status: 'confirmed' }).eq('id', entry.id)
  res.json({ ok: true, booking })
})

// POST /api/bookings/:id/checkin - Check-in via manual tap or signed QR code (Skill S15)
router.post('/:id/checkin', async (req, res) => {
  const { qrToken } = req.body
  const { data: b } = await db.from('bookings').select('*').eq('id', req.params.id).single()

  if (!b || b.status !== 'approved') {
    return res.status(400).json({ error: { code: 'CANNOT_CHECKIN', message: 'Booking is not in approved state' } })
  }

  // Verify permission
  if (b.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not authorized to check in for this booking' } })
  }

  // Optional QR verification if token passed
  if (qrToken) {
    const verified = verifyQRToken(qrToken)
    if (!verified.valid) {
      return res.status(400).json({ error: { code: 'BAD_QR', message: verified.message } })
    }
  }

  const now = Date.now()
  const start = new Date(b.start_time).getTime()
  const graceMinutes = Number(process.env.NO_SHOW_GRACE_MIN) || 15

  // Window: 10 min prior to start ... start + grace period
  if (now < start - 10 * 60 * 1000 || now > start + graceMinutes * 60 * 1000) {
    return res.status(400).json({
      error: {
        code: 'WINDOW_CLOSED',
        message: `Check-in is open from 10 mins before start until ${graceMinutes} mins after start.`
      }
    })
  }

  const { data, error } = await db.from('bookings')
    .update({ checked_in_at: new Date().toISOString() })
    .eq('id', b.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: { code: 'DB_ERROR', message: error.message } })

  await audit(req.user.id, 'booking.checkin', 'booking', b.id)
  res.json({ ok: true, booking: data })
})

export default router
