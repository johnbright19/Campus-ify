import { scorePriority } from './priority.js'
import { generateQRToken, verifyQRToken } from './qr.js'

describe('Deterministic Priority Scoring (S2)', () => {
  test('unverified exam caps at 60 points', async () => {
    const user = { role: 'student', no_show_count: 0 }
    const result = await scorePriority({
      user,
      eventType: 'exam',
      verified: false,
      start: new Date(Date.now() + 86400000 * 2).toISOString()
    })

    expect(result.breakdown.eventType).toBe(60)
    expect(result.breakdown.role).toBe(10)
  })

  test('verified exam receives full 100 points', async () => {
    const user = { role: 'faculty', no_show_count: 0 }
    const result = await scorePriority({
      user,
      eventType: 'exam',
      verified: true,
      start: new Date(Date.now() + 86400000 * 5).toISOString()
    })

    expect(result.breakdown.eventType).toBe(100)
    expect(result.breakdown.role).toBe(20)
    expect(result.breakdown.advanceNotice).toBe(5)
  })

  test('no-show penalty deducts 5 points per incident', async () => {
    const user = { role: 'student', no_show_count: 3 }
    const result = await scorePriority({
      user,
      eventType: 'club',
      verified: false,
      start: new Date(Date.now() + 86400000).toISOString()
    })

    expect(result.breakdown.noShowPenalty).toBe(-15)
  })
})

describe('QR Token Generation and Verification (S15)', () => {
  test('valid token generates and verifies correctly', () => {
    const bookingId = '3fa85f64-5717-4562-b3fc-2c963f66afa6'
    const startTime = new Date().toISOString()
    const token = generateQRToken(bookingId, startTime)

    const result = verifyQRToken(token)
    expect(result.valid).toBe(true)
    expect(result.bookingId).toBe(bookingId)
  })

  test('tampered token fails verification', () => {
    const bookingId = '3fa85f64-5717-4562-b3fc-2c963f66afa6'
    const token = generateQRToken(bookingId, new Date().toISOString())
    const tampered = token.slice(0, -4) + 'abcd'

    const result = verifyQRToken(tampered)
    expect(result.valid).toBe(false)
    expect(result.message).toBe('Invalid QR signature')
  })
})
