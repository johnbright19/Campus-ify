import { Router } from 'express'
import { db } from '../supabase.js'
import { requireRole } from '../middleware/auth.js'
import {
  autoReleaseNoShows,
  expireWaitlistOffers,
  sendReminders,
  escalateStaleApprovals
} from '../workers/index.js'
import { generateInsightsDigest } from '../ai/skills/insightsDigest.js'

const router = Router()

// All admin routes require role 'admin', or 'hod' / 'faculty' for approvals
router.use(requireRole('admin', 'hod', 'faculty'))

// GET /api/admin/kpis - Key performance metrics for dashboard
router.get('/kpis', async (req, res) => {
  try {
    const { data: bookings } = await db.from('bookings').select('status, created_at')
    const { count: resourcesCount } = await db.from('resources').select('*', { count: 'exact', head: true })
    const { count: waitlistCount } = await db.from('waitlist').select('*', { count: 'exact', head: true }).eq('status', 'waiting')

    const all = bookings || []
    const approved = all.filter(b => b.status === 'approved').length
    const pending = all.filter(b => b.status === 'pending').length
    const noShows = all.filter(b => b.status === 'no_show').length
    const completed = all.filter(b => b.status === 'completed').length

    res.json({
      totalBookings: all.length,
      approved,
      pending,
      noShows,
      completed,
      activeWaitlist: waitlistCount || 0,
      totalResources: resourcesCount || 0
    })
  } catch (err) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } })
  }
})

// GET /api/admin/utilization - Utilization heatmap data
router.get('/utilization', async (req, res) => {
  try {
    const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await db.from('bookings')
      .select('resource_id, start_time, status, resources(name, type)')
      .in('status', ['approved', 'completed'])
      .gte('start_time', fourWeeksAgo)

    if (error) return res.status(500).json({ error: { code: 'DB_ERROR', message: error.message } })

    // Aggregate into (dayOfWeek, hour, resourceId) matrix
    const matrix = {}
    for (const b of data || []) {
      const dt = new Date(b.start_time)
      const dow = dt.getDay() // 0 = Sun, 1 = Mon ...
      const hour = dt.getHours()
      const key = `${b.resource_id}-${dow}-${hour}`

      if (!matrix[key]) {
        matrix[key] = {
          resourceId: b.resource_id,
          resourceName: b.resources?.name,
          dow,
          hour,
          count: 0
        }
      }
      matrix[key].count++
    }

    res.json(Object.values(matrix))
  } catch (err) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } })
  }
})

// GET /api/admin/approvals - Pending approvals queue
router.get('/approvals', async (req, res) => {
  try {
    const { data, error } = await db.from('bookings')
      .select('*, profiles(id, full_name, email, role, club, department, no_show_count), resources(name, location, capacity)')
      .eq('status', 'pending')
      .order('priority_score', { ascending: false })

    if (error) return res.status(500).json({ error: { code: 'DB_ERROR', message: error.message } })
    res.json(data || [])
  } catch (err) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } })
  }
})

// GET /api/admin/digest - Generate live AI utilization digest
router.get('/digest', async (req, res) => {
  try {
    const { data: bookings } = await db.from('bookings').select('status, event_type')
    const all = bookings || []
    const totalBookings = all.length
    const noShowCount = all.filter(b => b.status === 'no_show').length

    const stats = {
      totalBookings,
      noShowCount,
      approvedCount: all.filter(b => b.status === 'approved').length,
      pendingCount: all.filter(b => b.status === 'pending').length
    }

    const { output, usedFallback } = await generateInsightsDigest({ stats, user: req.user })
    res.json({ digest: output, usedFallback, stats })
  } catch (err) {
    res.status(500).json({ error: { code: 'DIGEST_FAILED', message: err.message } })
  }
})

// POST /api/admin/run-job/:name - Instant demo trigger for workers (no waiting for cron!)
router.post('/run-job/:name', requireRole('admin'), async (req, res) => {
  const { name } = req.params

  try {
    switch (name) {
      case 'autoReleaseNoShows':
        await autoReleaseNoShows()
        return res.json({ ok: true, message: 'Executed autoReleaseNoShows worker' })
      case 'expireWaitlistOffers':
        await expireWaitlistOffers()
        return res.json({ ok: true, message: 'Executed expireWaitlistOffers worker' })
      case 'sendReminders':
        await sendReminders()
        return res.json({ ok: true, message: 'Executed sendReminders worker' })
      case 'escalateStaleApprovals':
        await escalateStaleApprovals()
        return res.json({ ok: true, message: 'Executed escalateStaleApprovals worker' })
      default:
        return res.status(400).json({ error: { code: 'UNKNOWN_JOB', message: `Unknown worker job: ${name}` } })
    }
  } catch (err) {
    res.status(500).json({ error: { code: 'JOB_FAILED', message: err.message } })
  }
})

// GET /api/admin/audit - System audit log
router.get('/audit', async (req, res) => {
  try {
    const { data, error } = await db.from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) return res.status(500).json({ error: { code: 'DB_ERROR', message: error.message } })
    res.json(data || [])
  } catch (err) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } })
  }
})

// PATCH /api/admin/users/:id/role - Role change (admin only)
router.patch('/users/:id/role', requireRole('admin'), async (req, res) => {
  const { role } = req.body
  if (!['student', 'faculty', 'hod', 'admin'].includes(role)) {
    return res.status(400).json({ error: { code: 'INVALID_ROLE', message: 'Invalid role' } })
  }

  const { data, error } = await db.from('profiles').update({ role }).eq('id', req.params.id).select().single()
  if (error) return res.status(500).json({ error: { code: 'DB_ERROR', message: error.message } })
  res.json(data)
})

export default router
