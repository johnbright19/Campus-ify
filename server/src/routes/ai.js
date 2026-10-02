import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { db } from '../supabase.js'
import { parseBookingRequest } from '../ai/skills/parseBookingRequest.js'
import { explainConflict } from '../ai/skills/explainConflict.js'
import { summarizeRequestForApprover } from '../ai/skills/summarizeRequest.js'
import { generateInsightsDigest } from '../ai/skills/insightsDigest.js'

const router = Router()

// Rate limiting on AI endpoints (20 calls per minute per user)
router.use(rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false
}))

// POST /api/ai/parse - Natural-Language Booking Concierge (Skill S4 / Agent A1)
router.post('/parse', async (req, res) => {
  try {
    const text = String(req.body.text || '').slice(0, 600)
    if (!text.trim()) {
      return res.status(400).json({ error: { code: 'EMPTY_TEXT', message: 'Please provide a booking request query' } })
    }

    const { output, usedFallback } = await parseBookingRequest(text, req.user)

    // Resolve candidates to REAL database resources (LLM never invents IDs!)
    let q = db.from('resources').select('*').eq('is_active', true)

    if (output.resourceType) {
      q = q.eq('type', output.resourceType)
    }
    if (output.attendees) {
      q = q.gte('capacity', output.attendees)
    }

    const { data: candidates } = await q
    const wantedFeatures = output.features || []

    const rankedOptions = (candidates || [])
      .map(r => {
        const matchingFeatures = wantedFeatures.filter(f => (r.features || []).includes(f))
        return {
          ...r,
          matchScore: wantedFeatures.length > 0 ? matchingFeatures.length / wantedFeatures.length : 1
        }
      })
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 3)

    res.json({
      parsed: output,
      usedFallback,
      recommendedResources: rankedOptions
    })
  } catch (err) {
    res.status(500).json({ error: { code: 'AI_PARSE_ERROR', message: err.message } })
  }
})

// POST /api/ai/explain-conflict - Conflict Mediator AI explanation (Skill S6 / Agent A2)
router.post('/explain-conflict', async (req, res) => {
  try {
    const { requesterBooking, existingBooking, requesterScore, existingScore } = req.body

    const { output, usedFallback } = await explainConflict({
      requesterBooking,
      existingBooking,
      requesterScore,
      existingScore,
      user: req.user
    })

    res.json({ explanation: output, usedFallback })
  } catch (err) {
    res.status(500).json({ error: { code: 'AI_EXPLAIN_ERROR', message: err.message } })
  }
})

// POST /api/ai/summarize - Approval Copilot decision brief (Skill S8 / Agent A3)
router.post('/summarize', async (req, res) => {
  try {
    const { booking, requester, softConflicts = 0 } = req.body

    const { output, usedFallback } = await summarizeRequestForApprover({
      booking,
      requester,
      softConflicts,
      user: req.user
    })

    res.json({ brief: output, usedFallback })
  } catch (err) {
    res.status(500).json({ error: { code: 'AI_SUMMARIZE_ERROR', message: err.message } })
  }
})

// POST /api/ai/digest - Utilization Analyst AI digest (Skill S13 / Agent A4)
router.post('/digest', async (req, res) => {
  try {
    const { stats } = req.body

    const { output, usedFallback } = await generateInsightsDigest({
      stats: stats || {},
      user: req.user
    })

    res.json({ digest: output, usedFallback })
  } catch (err) {
    res.status(500).json({ error: { code: 'AI_DIGEST_ERROR', message: err.message } })
  }
})

export default router
