import { describe, it, expect } from 'vitest'
import { formatEventDate, formatEventTime } from './index'

describe('formatEventDate', () => {
  it('includes year and month', () => {
    const result = formatEventDate('2026-05-10T14:00:00.000Z')
    expect(result).toMatch(/May|2026/)
  })
})

describe('formatEventTime', () => {
  it('returns AM or PM string', () => {
    expect(formatEventTime('2026-05-10T14:00:00.000Z')).toMatch(/AM|PM/)
  })
})
