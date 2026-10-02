import { Router } from 'express'
import { z } from 'zod'
import { db } from '../supabase.js'
import { allocateBundle, suggestBestTimes, createBlackout } from '../services/allocation.js'
import { requireRole } from '../middleware/auth.js'

const router = Router()

const BundleSchema = z.object({
  title: z.string().min(3).max(120),
  purpose: z.string().max(500).optional(),
  eventType: z.enum(['exam', 'placement', 'academic', 'fest', 'club', 'personal']).default('club'),
  attendees: z.number().int().min(1).max(5000),
  start: z.string().datetime(),
  end: z.string().datetime(),
  resourceIds: z.array(z.string().uuid()).min(1, 'Select at least one resource')
}).refine(v => new Date(v.end) > new Date(v.start), 'End time must be after start time')

const BlackoutSchema = z.object({
  resourceId: z.string().uuid().nullable().optional(),
  reason: z.string().min(3).max(200),
  start: z.string().datetime(),
  end: z.string().datetime()
}).refine(v => new Date(v.end) > new Date(v.start), 'End time must be after start time')

// POST /api/allocation/bundle - Allocate a multi-resource bundle atomically
router.post('/bundle', async (req, res) => {
  const parsed = BundleSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'INVALID', message: parsed.error.issues[0].message } })
  }

  try {
    const result = await allocateBundle({
      user: req.user,
      ...parsed.data
    })

    if (!result.success) {
      return res.status(409).json(result)
    }

    res.status(201).json(result)
  } catch (err) {
    res.status(500).json({ error: { code: 'ALLOCATION_FAILED', message: err.message } })
  }
})

// GET /api/allocation/best-times - Skill S16: Suggest least contested time windows
router.get('/best-times', async (req, res) => {
  const { resourceId, durationMinutes, date } = req.query

  if (!resourceId) {
    return res.status(400).json({ error: { code: 'MISSING_RESOURCE_ID', message: 'resourceId query param is required' } })
  }

  try {
    const recommendations = await suggestBestTimes({
      resourceId: String(resourceId),
      durationMinutes: durationMinutes ? parseInt(durationMinutes, 10) : 120,
      date: date ? String(date) : null
    })

    res.json({
      resourceId,
      date: date || new Date().toISOString().slice(0, 10),
      recommendations
    })
  } catch (err) {
    res.status(500).json({ error: { code: 'BEST_TIMES_FAILED', message: err.message } })
  }
})

// POST /api/allocation/blackouts - Allocate maintenance/exam blackout periods (Admin/HOD only)
router.post('/blackouts', requireRole('admin', 'hod'), async (req, res) => {
  const parsed = BlackoutSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'INVALID', message: parsed.error.issues[0].message } })
  }

  try {
    const result = await createBlackout({
      ...parsed.data,
      actorId: req.user.id
    })

    res.status(201).json(result)
  } catch (err) {
    res.status(500).json({ error: { code: 'BLACKOUT_FAILED', message: err.message } })
  }
})

// GET /api/allocation/matrix - Multi-resource time allocation grid across campus
router.get('/matrix', async (req, res) => {
  const { date = new Date().toISOString().slice(0, 10), type } = req.query

  try {
    const dayStart = new Date(`${date}T00:00:00Z`).toISOString()
    const dayEnd = new Date(`${date}T23:59:59Z`).toISOString()

    let resourceQuery = db.from('resources').select('id, name, type, capacity, location').eq('is_active', true)
    if (type) {
      resourceQuery = resourceQuery.eq('type', type)
    }

    const { data: resources } = await resourceQuery
    const resourceIds = (resources || []).map(r => r.id)

    // Fetch all bookings for this day
    const { data: bookings } = await db.from('bookings')
      .select('id, resource_id, title, event_type, status, start_time, end_time, priority_score')
      .in('resource_id', resourceIds)
      .in('status', ['pending', 'approved'])
      .lt('start_time', dayEnd)
      .gt('end_time', dayStart)

    // Group bookings by resource
    const allocationGrid = (resources || []).map(r => {
      const resourceBookings = (bookings || []).filter(b => b.resource_id === r.id)
      return {
        ...r,
        allocationsCount: resourceBookings.length,
        allocations: resourceBookings
      }
    })

    res.json({
      date,
      totalResources: resources?.length || 0,
      grid: allocationGrid
    })
  } catch (err) {
    res.status(500).json({ error: { code: 'MATRIX_FAILED', message: err.message } })
  }
})

export default router
