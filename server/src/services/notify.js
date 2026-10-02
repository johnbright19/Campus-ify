import { db } from '../supabase.js'

/**
 * Insert an in-app notification for a user
 */
export async function notify(userId, title, body, link = '/') {
  try {
    const { data, error } = await db.from('notifications').insert({
      user_id: userId,
      title,
      body,
      link,
      is_read: false
    }).select().single()

    if (error) {
      console.error('Failed to insert notification:', error.message)
    }
    return data
  } catch (err) {
    console.error('Notification error:', err)
    return null
  }
}

/**
 * Record an audit log entry for system accountability
 */
export async function audit(actorId, action, entity, entityId, details = {}) {
  try {
    const { data, error } = await db.from('audit_logs').insert({
      actor_id: actorId,
      action,
      entity,
      entity_id: entityId,
      details
    }).select().single()

    if (error) {
      console.error('Failed to insert audit log:', error.message)
    }
    return data
  } catch (err) {
    console.error('Audit error:', err)
    return null
  }
}
