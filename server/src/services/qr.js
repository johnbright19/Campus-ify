import crypto from 'crypto'

const QR_SECRET = process.env.QR_SECRET || 'dev-qr-secret-key-1234'

/**
 * Generate a cryptographically signed check-in token for a booking (Skill S15)
 *
 * @param {string} bookingId
 * @param {string} startTime - ISO string
 * @returns {string} Token formatted as bookingId:expiry:hmac
 */
export function generateQRToken(bookingId, startTime) {
  // Token expires at start_time + 30 minutes
  const expiry = new Date(startTime).getTime() + 30 * 60 * 1000
  const payload = `${bookingId}:${expiry}`
  const hmac = crypto.createHmac('sha256', QR_SECRET).update(payload).digest('hex')
  return `${payload}:${hmac}`
}

/**
 * Verify a check-in QR token
 *
 * @param {string} token
 * @returns {{ valid: boolean, bookingId?: string, message?: string }}
 */
export function verifyQRToken(token) {
  if (!token || typeof token !== 'string') {
    return { valid: false, message: 'Invalid token structure' }
  }

  const parts = token.split(':')
  if (parts.length !== 3) {
    return { valid: false, message: 'Malformed QR code token' }
  }

  const [bookingId, expiryStr, receivedHmac] = parts
  const expiry = parseInt(expiryStr, 10)

  if (isNaN(expiry) || Date.now() > expiry) {
    return { valid: false, message: 'QR code has expired' }
  }

  const payload = `${bookingId}:${expiry}`
  const expectedHmac = crypto.createHmac('sha256', QR_SECRET).update(payload).digest('hex')

  if (
    receivedHmac.length !== expectedHmac.length ||
    !crypto.timingSafeEqual(Buffer.from(receivedHmac), Buffer.from(expectedHmac))
  ) {
    return { valid: false, message: 'Invalid QR signature' }
  }

  return { valid: true, bookingId }
}
