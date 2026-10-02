import { db } from '../supabase.js'

export async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) {
    return res.status(401).json({ error: { code: 'NO_TOKEN', message: 'Sign in required' } })
  }

  // Developer / Demo quick bypass (e.g. Bearer demo-admin, Bearer demo-faculty, Bearer demo-student)
  if (token.startsWith('dev-') || token.startsWith('demo-')) {
    const roleCandidate = token.replace('dev-', '').replace('demo-', '')
    const role = ['admin', 'hod', 'faculty', 'student'].includes(roleCandidate) ? roleCandidate : 'student'
    const email = `${role}.demo@campus.edu`
    const { data: profile } = await db.from('profiles').select('*').eq('email', email).maybeSingle()
    if (profile) {
      req.user = profile
    } else {
      req.user = {
        id: 'a8ae6034-2f70-446a-a396-e57eb57cf9d5',
        email,
        full_name: `Demo ${role.charAt(0).toUpperCase() + role.slice(1)}`,
        role,
        department: 'Computer Science',
        club: 'IEEE',
        no_show_count: 0
      }
    }
    return next()
  }

  const { data, error } = await db.auth.getUser(token)
  if (error || !data?.user) {
    return res.status(401).json({ error: { code: 'BAD_TOKEN', message: 'Invalid session' } })
  }

  const domain = process.env.ALLOWED_EMAIL_DOMAIN
  if (domain && !data.user.email?.endsWith('@' + domain)) {
    return res.status(403).json({ error: { code: 'DOMAIN', message: `Use your @${domain} account` } })
  }

  const { data: profile } = await db.from('profiles').select('*').eq('id', data.user.id).single()
  req.user = profile || {
    id: data.user.id,
    email: data.user.email,
    role: 'student',
    full_name: data.user.user_metadata?.full_name || data.user.email?.split('@')[0],
    no_show_count: 0
  }
  next()
}

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Action not allowed for your role' } })
  }
  next()
}
