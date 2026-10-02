import { getState } from '../lib/store'
import { resetDatabase } from '../lib/store'
import { signInWithGoogle } from './auth'
import { commit, makeAudit } from './notifications'

// ---------------------------------------------------------------------------
// Configuration writes.
//
// Admin settings are the only place weights and windows can change, and every
// change is audited — the same rule the server middleware would enforce.
// ---------------------------------------------------------------------------

export function updateSettings(patch, actorId) {
  const db = getState()
  const next = { ...db.settings, ...patch }
  commit(
    'settings.update',
    { settings: next },
    { audits: [makeAudit(actorId, 'settings.update', 'settings', null, patch)] }
  )
  return next
}

export function updatePriorityConfig(patch, actorId) {
  const db = getState()
  const next = {
    ...db.settings,
    priority: { ...db.settings.priority, ...patch },
  }
  commit(
    'settings.priority',
    { settings: next },
    { audits: [makeAudit(actorId, 'settings.priority', 'settings', null, patch)] }
  )
  return next
}

export function updateWorker(name, enabled, actorId) {
  const db = getState()
  const next = {
    ...db.settings,
    workers: { ...db.settings.workers, [name]: enabled },
  }
  commit(
    'settings.workers',
    { settings: next },
    { audits: [makeAudit(actorId, 'settings.worker', 'settings', name, { enabled })] }
  )
  return next
}

export function updateAiConfig(patch, actorId) {
  const db = getState()
  const next = { ...db.settings, ai: { ...db.settings.ai, ...patch } }
  commit(
    'settings.ai',
    { settings: next },
    { audits: [makeAudit(actorId, 'settings.ai', 'settings', null, patch)] }
  )
  return next
}

/** Reseed every table, then restore the operator's session. */
export function resetDemoData(actorId) {
  resetDatabase()
  if (actorId) signInWithGoogle({ userId: actorId })
  commit('settings.reset', {}, {}, {})
  return true
}
