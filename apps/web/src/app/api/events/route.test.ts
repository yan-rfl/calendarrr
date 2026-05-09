import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from './route'

const mockEvent = {
  id: 'e1', user_id: 'u1', name: 'Dentist', detail: null,
  start_at: '2026-05-10T14:00:00.000Z', end_at: null,
  source: 'manual', external_id: null,
  created_at: '2026-05-08T00:00:00.000Z', updated_at: '2026-05-08T00:00:00.000Z',
}

const mockSB = { auth: { getUser: vi.fn() }, from: vi.fn() }
vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => mockSB }))
vi.mock('@/lib/notifications', () => ({ generateNotificationQueue: vi.fn().mockResolvedValue(undefined) }))

const req = (method: string, body?: unknown, qs?: Record<string, string>) => {
  const url = new URL('http://localhost/api/events')
  if (qs) Object.entries(qs).forEach(([k, v]) => url.searchParams.set(k, v))
  return new Request(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
}

describe('GET /api/events', () => {
  beforeEach(() => {
    mockSB.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockSB.from.mockReturnValue({
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [mockEvent], error: null }),
    })
  })
  it('returns 401 when unauthenticated', async () => {
    mockSB.auth.getUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await GET(req('GET'))).status).toBe(401)
  })
  it('returns events array', async () => {
    const res = await GET(req('GET'))
    expect(res.status).toBe(200)
    expect((await res.json()).events).toHaveLength(1)
  })
})

describe('POST /api/events', () => {
  beforeEach(() => {
    mockSB.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockSB.from.mockReturnValue({
      insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockEvent, error: null }),
    })
  })
  it('returns 401 when unauthenticated', async () => {
    mockSB.auth.getUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await POST(req('POST', { name: 'X', start_at: '2026-05-10T14:00:00.000Z' }))).status).toBe(401)
  })
  it('returns 400 for invalid body', async () => {
    expect((await POST(req('POST', { name: '' }))).status).toBe(400)
  })
  it('creates event and returns 201', async () => {
    const res = await POST(req('POST', { name: 'Dentist', start_at: '2026-05-10T14:00:00.000Z' }))
    expect(res.status).toBe(201)
    expect((await res.json()).event.name).toBe('Dentist')
  })
})
