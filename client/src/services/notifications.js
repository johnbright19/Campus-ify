import { fireEvent, getState, now, onEvent, produce } from '../lib/store'
import { uid } from '../lib/utils'
import { api } from '../lib/api'
import { isRemoteMode } from './bookings'

// ---------------------------------------------------------------------------
// Notification service + audit trail.
//
// Every service that changes state funnels its side effects (in-app rows,
// audit entries, AI-run logs, worker logs) through `commit()`, so a single
// logical action produces exactly one atomic write and one realtime event.
// ---------------------------------------------------------------------------

export const NOTIFICATION_KINDS = ['info', 'success', 'warning', 'conflict', 'offer']

export function makeNotification(userId, { title, body, link = '/', kind = 'info' }) {
  return {
    id: uid('ntf'),
    userId,
    title,
    body,
    link,
    kind: NOTIFICATION_KINDS.includes(kind) ? kind : 'info',
    isRead: false,
    createdAt: now().toISOString(),
  }
}

export function makeAudit(actorId, action, entity, entityId, details = {}) {
  return {
    id: uid('aud'),
    actorId: actorId ?? null,
    action,
    entity,
    entityId: entityId ?? null,
    details,
    createdAt: now().toISOString(),
  }
}

export function makeAiRun({ name, userId, input = {}, output = null, latencyMs = 0, usedFallback = false, outcome = 'n/a' }) {
  return {
    id: uid('ai'),
    name,
    userId: userId ?? null,
    input,
    output,
    latencyMs,
    usedFallback,
    outcome,
    createdAt: now().toISOString(),
  }
}

export function makeWorkerLog({ job, level = 'info', message, count = 0 }) {
  return {
    id: uid('wlog'),
    job,
    level,
    message,
    count,
    at: now().toISOString(),
  }
}

/**
 * Apply a table patch plus any side effects in one atomic write.
 *
 * @param {string} reason short label for the realtime bus
 * @param {object} patch  tables to replace, e.g. { bookings }
 * @param {object} effects { notifications, audits, aiRuns, workerLog }
 * @param {object} [meta]  extra info broadcast on the bus
 */
export function commit(reason, patch = {}, effects = {}, meta = {}) {
  const { notifications = [], audits = [], aiRuns = [], workerLog = [] } = effects

  // Fire the transient bus after the state write so listeners see fresh data.
  const hasBusSignal = notifications.length > 0 || meta.pulse
  const broadcast = () => {
    for (const n of notifications) {
      fireEvent({ type: 'notification', notification: n, reason })
    }
    if (meta.pulse) fireEvent({ type: 'pulse', reason, ...meta.pulse })
    fireEvent({ type: 'changed', reason, ...meta })
  }

  const result = produce(reason, (db) => ({
    ...db,
    ...patch,
    notifications: notifications.length
      ? [...notifications, ...db.notifications].slice(0, 400)
      : db.notifications,
    auditLogs: audits.length ? [...audits, ...db.auditLogs].slice(0, 900) : db.auditLogs,
    aiRuns: aiRuns.length ? [...aiRuns, ...db.aiRuns].slice(0, 300) : db.aiRuns,
    workerLog: workerLog.length
      ? [...workerLog, ...db.workerLog].slice(0, 400)
      : db.workerLog,
  }))

  if (hasBusSignal && result) broadcast()
  return result
}

/* ---------------------------------------------------------------------------
 * Reads
 * ------------------------------------------------------------------------- */

export function notificationsFor(userId) {
  const db = getState()
  return db.notifications
    .filter((n) => n.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

export function unreadCount(userId) {
  return getState().notifications.filter((n) => n.userId === userId && !n.isRead).length
}

export function recentAiRuns(limit = 25) {
  return [...getState().aiRuns].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit)
}

/* ---------------------------------------------------------------------------
 * Writes
 * ------------------------------------------------------------------------- */

export function markNotificationRead(id) {
  // Optimistic locally; persisted too when a backend session exists so the read
  // state survives the next poll.
  if (isRemoteMode()) {
    api.markNotificationRead(id).catch(() => {})
  }
  produce('notification.read', (db) => ({
    ...db,
    notifications: db.notifications.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
  }))
}

export function markAllRead(userId) {
  if (isRemoteMode()) {
    api.markAllNotificationsRead().catch(() => {})
  }
  produce('notification.readAll', (db) => ({
    ...db,
    notifications: db.notifications.map((n) =>
      n.userId === userId ? { ...n, isRead: true } : n
    ),
  }))
}

export function clearNotifications(userId) {
  produce('notification.clear', (db) => ({
    ...db,
    notifications: db.notifications.filter((n) => n.userId !== userId),
  }))
}

export { onEvent }
