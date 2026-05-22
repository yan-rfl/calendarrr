import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'

const mockSB = { from: vi.fn() }
vi.mock('@supabase/supabase-js', () => ({ createClient: () => mockSB }))
vi.mock('@calendarrr/utils', () => ({
  parseICS: vi.fn().mockReturnValue({
    name: 'Dentist',
    start_at: new Date('2026-05-10T14:00:00Z'),
    end_at: new Date('2026-05-10T15:00:00Z'),
    detail: 'Bring X-rays',
  }),
}))
vi.mock('@/lib/gmail', () => ({
  getGmailHistory: vi.fn().mockResolvedValue(['msg1']),
  getICSFromMessage: vi.fn().mockResolvedValue({ ics: 'BEGIN:VCALENDAR...', gmailId: 'msg1' }),
  registerGmailWatch: vi.fn().mockResolvedValue({ historyId: '200', expiry: '2026-05-18T00:00:00Z' }),
  refreshAccessToken: vi.fn().mockResolvedValue('new-token'),
}))
vi.mock('@/lib/notifications', () => ({ generateNotificationQueue: vi.fn() }))

function makeBody(emailAddress: string, historyId: string) {
  const data = Buffer.from(JSON.stringify({ emailAddress, historyId })).toString('base64')
  return JSON.stringify({ message: { data } })
}

function makeConn(overrides = {}) {
  return {
    user_id: 'u1',
    access_token: 'at',
    refresh_token: 'rt',
    sync_metadata: { historyId: '99', watchExpiry: '2026-05-20T00:00:00Z' },
    ...overrides,
  }
}

function mockChain(conn: ReturnType<typeof makeConn> | null, existingEvent = false) {
  let callCount = 0
  mockSB.from.mockImplementation((table: string) => {
    if (table === 'email_connections') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: conn }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }),
      }
    }
    if (table === 'events') {
      callCount++
      if (callCount === 1) {
        // dedup check
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: existingEvent ? { id: 'existing' } : null }),
        }
      }
      // insert
      return {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 'e1', start_at: '2026-05-10T14:00:00Z' }, error: null }),
      }
    }
    return {
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    }
  })
}

describe('POST /api/webhooks/gmail', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 200 for empty/malformed body', async () => {
    const res = await POST(new Request('http://localhost', { method: 'POST', body: '{}' }))
    expect(res.status).toBe(200)
  })

  it('returns 200 and creates event when valid ICS found', async () => {
    mockChain(makeConn())
    const res = await POST(new Request('http://localhost', {
      method: 'POST',
      body: makeBody('user@gmail.com', '100'),
    }))
    expect(res.status).toBe(200)
    const { generateNotificationQueue } = await import('@/lib/notifications')
    expect(generateNotificationQueue).toHaveBeenCalled()
  })

  it('skips duplicate events', async () => {
    mockChain(makeConn(), true)
    const { generateNotificationQueue } = await import('@/lib/notifications')
    vi.clearAllMocks()
    mockChain(makeConn(), true)
    await POST(new Request('http://localhost', {
      method: 'POST',
      body: makeBody('user@gmail.com', '100'),
    }))
    expect(generateNotificationQueue).not.toHaveBeenCalled()
  })

  it('returns 200 when no connection found for email', async () => {
    mockChain(null)
    const res = await POST(new Request('http://localhost', {
      method: 'POST',
      body: makeBody('unknown@gmail.com', '100'),
    }))
    expect(res.status).toBe(200)
  })
})
