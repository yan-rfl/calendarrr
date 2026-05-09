import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from './route'

vi.mock('@/lib/line', () => ({
  sendLineMessage: vi.fn().mockResolvedValue(undefined),
  verifyLineSignature: vi.fn().mockReturnValue(true),
}))
vi.mock('@/lib/notifications', () => ({
  generateNotificationQueue: vi.fn().mockResolvedValue(undefined),
}))

const mockSB = { from: vi.fn() }
vi.mock('@supabase/supabase-js', () => ({ createClient: () => mockSB }))

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
vi.stubEnv('LINE_CHANNEL_SECRET', 'test-secret')

const postReq = (body: unknown) => new Request('http://localhost/api/webhooks/line', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-line-signature': 'valid' },
  body: JSON.stringify(body),
})

const makeTextEvent = (lineUserId: string, text: string) => ({
  events: [{
    type: 'message',
    source: { type: 'user', userId: lineUserId },
    message: { type: 'text', text },
  }],
})

const mockChain = () => ({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  not: vi.fn().mockReturnThis(),
  gt: vi.fn().mockReturnThis(),
  gte: vi.fn().mockReturnThis(),
  lt: vi.fn().mockReturnThis(),
  lte: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue({ data: [], error: null }),
  single: vi.fn().mockResolvedValue({ data: { user_id: 'u1' }, error: null }),
  insert: vi.fn().mockResolvedValue({ data: { id: 'e1', name: 'Test', start_at: '2026-05-10T14:00:00Z' }, error: null }),
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
})

describe('GET /api/webhooks/line', () => {
  it('returns 200', async () => {
    expect((await GET()).status).toBe(200)
  })
})

describe('POST /api/webhooks/line', () => {
  beforeEach(() => {
    mockSB.from.mockReturnValue(mockChain())
  })

  it('returns 200 for valid message', async () => {
    expect((await POST(postReq(makeTextEvent('U123', 'today')))).status).toBe(200)
  })

  it('returns 200 for follow event', async () => {
    expect((await POST(postReq({ events: [{ type: 'follow', source: { userId: 'U123' } }] }))).status).toBe(200)
  })

  it('returns 200 when user not linked (sends link reminder)', async () => {
    mockSB.from.mockReturnValue({
      ...mockChain(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    })
    expect((await POST(postReq(makeTextEvent('U999', 'today')))).status).toBe(200)
  })

  it('handles link code message', async () => {
    const chain = mockChain()
    mockSB.from.mockReturnValue(chain)
    expect((await POST(postReq(makeTextEvent('U123', '123456')))).status).toBe(200)
  })
})
