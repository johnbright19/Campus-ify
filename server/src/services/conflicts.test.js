import { overlaps } from './conflicts.js'

describe('Conflict Engine Overlap Detection (S1)', () => {
  test('touching ranges do not conflict (end == start)', () => {
    expect(
      overlaps(
        '2026-10-03T12:00:00Z',
        '2026-10-03T14:00:00Z',
        '2026-10-03T14:00:00Z',
        '2026-10-03T16:00:00Z'
      )
    ).toBe(false)
  })

  test('partial overlap conflicts', () => {
    expect(
      overlaps(
        '2026-10-03T12:00:00Z',
        '2026-10-03T15:00:00Z',
        '2026-10-03T14:00:00Z',
        '2026-10-03T16:00:00Z'
      )
    ).toBe(true)
  })

  test('nested range conflicts', () => {
    expect(
      overlaps(
        '2026-10-03T12:00:00Z',
        '2026-10-03T18:00:00Z',
        '2026-10-03T14:00:00Z',
        '2026-10-03T16:00:00Z'
      )
    ).toBe(true)
  })

  test('identical range conflicts', () => {
    expect(
      overlaps(
        '2026-10-03T14:00:00Z',
        '2026-10-03T16:00:00Z',
        '2026-10-03T14:00:00Z',
        '2026-10-03T16:00:00Z'
      )
    ).toBe(true)
  })

  test('completely disjoint ranges before and after do not conflict', () => {
    expect(
      overlaps(
        '2026-10-03T09:00:00Z',
        '2026-10-03T11:00:00Z',
        '2026-10-03T14:00:00Z',
        '2026-10-03T16:00:00Z'
      )
    ).toBe(false)

    expect(
      overlaps(
        '2026-10-03T18:00:00Z',
        '2026-10-03T20:00:00Z',
        '2026-10-03T14:00:00Z',
        '2026-10-03T16:00:00Z'
      )
    ).toBe(false)
  })
})
