import { Router } from 'express'
import { z } from 'zod'
import { db } from '../supabase.js'
import { detectConflicts } from '../services/conflicts.js'
import { suggestAlternatives } from '../services/suggestions.js'
import { requireRole } from '../middleware/auth.js'

const router = Router()

const ResourceSchema = z.object({
  name: z.string().min(2).max(100),
  type: z.enum(['seminar_hall', 'lab', 'classroom', 'auditorium', 'ground', 'equipment']),
  location: z.string().optional(),
  capacity: z.number().int().min(0).default(0),
  features: z.array(z.string()).default([]),
  requires_approval: z.boolean().default(true),
  approver_role: z.enum(['student', 'faculty', 'hod', 'admin']).default('hod'),
  owner_department: z.string().optional(),
  is_active: z.boolean().default(true)
})

// GET /api/resources - List all active campus resources with optional filters
router.get('/', async (req, res) => {
  try {
    let q = db.from('resources').select('*').order('name', { ascending: true })

    if (req.query.type) {
      q = q.eq('type', req.query.type)
    }
    if (req.query.capacity) {
      q = q.gte('capacity', parseInt(req.query.capacity, 10))
    }
    if (req.query.active !== 'false') {
      q = q.eq('is_active', true)
    }

    const { data, error } = await q
    if (error) return res.status(500).json({ error: { code: 'DB_ERROR', message: error.message } })

    res.json(data || [])
  } catch (err) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } })
  }
})

// GET /api/resources/:id - Get specific resource
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await db.from('resources').select('*').eq('id', req.params.id).single()
    if (error || !data) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found' } })
    }
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } })
  }
})

// GET /api/resources/:id/availability - Inline availability check for calendar/form feedback
router.get('/:id/availability', async (req, res) => {
  try {
    const { start, end } = req.query
    if (!start || !end) {
      return res.status(400).json({ error: { code: 'MISSING_PARAMS', message: 'start and end query params required' } })
    }

    const { data: resource } = await db.from('resources').select('*').eq('id', req.params.id).single()
    if (!resource) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found' } })
    }

    const conflict = await detectConflicts({
      resourceId: req.params.id,
      start: String(start),
      end: String(end)
    })

    const isAvailable = conflict.hard.length === 0 && !conflict.blackout
    let alternatives = []

    if (!isAvailable) {
      alternatives = await suggestAlternatives({
        resource,
        start: String(start),
        end: String(end)
      })
    }

    res.json({
      available: isAvailable,
      hardConflicts: conflict.hard,
      softConflicts: conflict.soft,
      blackout: conflict.blackout,
      alternatives
    })
  } catch (err) {
    res.status(500).json({ error: { code: 'CHECK_FAILED', message: err.message } })
  }
})

// POST /api/resources - Create resource (admin only)
router.post('/', requireRole('admin'), async (req, res) => {
  const parsed = ResourceSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } })
  }

  const { data, error } = await db.from('resources').insert(parsed.data).select().single()
  if (error) return res.status(500).json({ error: { code: 'DB_ERROR', message: error.message } })

  res.status(201).json(data)
})

// PATCH /api/resources/:id - Update resource (admin only)
router.patch('/:id', requireRole('admin'), async (req, res) => {
  const { data, error } = await db.from('resources').update(req.body).eq('id', req.params.id).select().single()
  if (error) return res.status(500).json({ error: { code: 'DB_ERROR', message: error.message } })
  res.json(data)
})

export default router
