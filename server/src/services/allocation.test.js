import { suggestBestTimes } from './allocation.js'

describe('Resource Allocation Engine (Skill S16 & Bundling)', () => {
  test('suggestBestTimes returns time windows within operating hours', async () => {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 7)
    const dateStr = futureDate.toISOString().slice(0, 10)

    // Seminar Hall A
    const recommendations = await suggestBestTimes({
      resourceId: 'f9df0a29-f2f1-4e9d-aa21-ad84648f76cf',
      durationMinutes: 90,
      date: dateStr
    })

    expect(Array.isArray(recommendations)).toBe(true)
    if (recommendations.length > 0) {
      const first = recommendations[0]
      expect(first).toHaveProperty('start')
      expect(first).toHaveProperty('end')
      expect(first).toHaveProperty('durationMinutes', 90)
      expect(first).toHaveProperty('score')
      expect(first).toHaveProperty('tag')

      const startHour = parseInt(first.startTime.split(':')[0], 10)
      expect(startHour).toBeGreaterThanOrEqual(8)
      expect(startHour).toBeLessThan(20)
    }
  })
})
