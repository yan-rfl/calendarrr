import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, PUT } from './route'

const mockRules = [
  { id: 'r1', user_id: 'u1', event_id: null, offset_minutes: -15, created_at: '2026-05-08T00:00:00.000Z' },
  { id: 'r2', user_id: 'u1', event_id: null, offset_minutes: -60, created_at: '2026-05-08T00:00:00.000Z' },
]
const mockSB = { auth: { getUser: vi.fn() }, from: vi.fn() }
vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => mockSB }))

const req = (method: string, body?: unknown) => new Request('http://localhost/api/settings/notifications', {
  method,
  headers: body ? { 'Content-Type': 'application/json' } : {},
  body: body ? JSON.stringify(body) : undefined,
})

describe('GET /api/settings/notifications', () => {
  beforeEach(() => {
    mockSB.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockSB.from.mockReturnValue({
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockResolvedValue({ data: mockRules, error: null }),
    })
  })
  it('returns global rules', async () => {
    const res = await GET(req('GET'))
    expect(res.status).toBe(200)
    expect((await res.json()).rules).toHaveLength(2)
  })
  it('returns 401 when unauthenticated', async () => {
    mockSB.auth.getUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await GET(req('GET'))).status).toBe(401)
  })
})

describe('PUT /api/settings/notifications', () => {
  beforeEach(() => {
    mockSB.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockSB.from.mockReturnValue({
      delete: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockResolvedValue({ error: null }),
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: mockRules, error: null }),
    })
  })
  it('returns 400 for non-array', async () => {
    expect((await PUT(req('PUT', { offsets: 'bad' }))).status).toBe(400)
  })
  it('replaces rules and returns them', async () => {
    const res = await PUT(req('PUT', { offsets: [-15, -60] }))
    expect(res.status).toBe(200)
    expect((await res.json()).rules).toBeDefined()
  })
  it('returns 401 when unauthenticated', async () => {
    mockSB.auth.getUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await PUT(req('PUT', { offsets: [-15] }))).status).toBe(401)
  })
})
