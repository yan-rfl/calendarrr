import { describe, it, expect, vi } from 'vitest'
import { generateNotificationQueue } from './notifications'

describe('generateNotificationQueue', () => {
  it('inserts queue rows for each notification rule', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    const mockSB = {
      from: vi.fn((table: string) => {
        if (table === 'notification_rules') return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockResolvedValue({
            data: [{ offset_minutes: -15 }, { offset_minutes: -60 }],
            error: null,
          }),
        }
        return { insert: mockInsert }
      }),
    } as never

    await generateNotificationQueue(mockSB, 'u1', 'e1', '2026-05-10T14:00:00.000Z')

    expect(mockInsert).toHaveBeenCalledOnce()
    const rows = mockInsert.mock.calls[0][0]
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ event_id: 'e1', user_id: 'u1', channel: 'line' })
    const t1 = new Date('2026-05-10T14:00:00.000Z').getTime() - 15 * 60000
    expect(new Date(rows[0].scheduled_at).getTime()).toBe(t1)
  })

  it('does nothing when user has no notification rules', async () => {
    const mockInsert = vi.fn()
    const mockSB = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockResolvedValue({ data: [], error: null }),
        insert: mockInsert,
      })),
    } as never
    await generateNotificationQueue(mockSB, 'u1', 'e1', '2026-05-10T14:00:00.000Z')
    expect(mockInsert).not.toHaveBeenCalled()
  })
})
