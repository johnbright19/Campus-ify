import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { requireAuth } from './middleware/auth.js'
import resourcesRouter from './routes/resources.js'
import bookingsRouter from './routes/bookings.js'
import allocationRouter from './routes/allocation.js'
import aiRouter from './routes/ai.js'
import adminRouter from './routes/admin.js'
import { startWorkers } from './workers/index.js'

const app = express()

// Middleware
const allowedOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173'
app.use(cors({
  origin: (origin, callback) => {
    // Allow local development and standard origins
    if (!origin || origin.startsWith('http://localhost') || origin === allowedOrigin) {
      callback(null, true)
    } else {
      callback(null, true) // Permissive for local testing / demo
    }
  },
  credentials: true
}))

app.use(express.json())

// Health check endpoint
app.get('/health', (_, res) => {
  res.json({
    status: 'ok',
    service: 'Campus-ify API',
    timestamp: new Date().toISOString()
  })
})

// Current user profile route
app.get('/api/me', requireAuth, (req, res) => {
  res.json(req.user)
})

// Core resource and booking routes
app.use('/api/resources', requireAuth, resourcesRouter)
app.use('/api/bookings', requireAuth, bookingsRouter)
app.use('/api/allocation', requireAuth, allocationRouter)
app.use('/api/ai', requireAuth, aiRouter)
app.use('/api/admin', requireAuth, adminRouter)

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]:', err)
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: err.message || 'An unexpected server error occurred'
    }
  })
})

const PORT = process.env.PORT || 4000
app.listen(PORT, () => {
  console.log(`🚀 Campus-ify API server running on port ${PORT}`)
  console.log(`📡 Client Origin allowed: ${allowedOrigin}`)
  startWorkers()
})
