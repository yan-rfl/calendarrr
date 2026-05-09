import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'

vi.stubEnv('NEXT_PUBLIC_LINE_ADD_FRIEND_URL', 'https://line.me/R/ti/p/@testbot')

const mockSB = { auth: { getUser: vi.fn() }, from: vi.fn() }
vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => mockSB }))

const req = () => new Request('http://localhost/api/settings/line/connect')

describe('GET /api/settings/line/connect', () => {
  beforeEach(() => {
    mockSB.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  })

  it('returns 401 when unauthenticated', async () => {
    mockSB.auth.getUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await GET(req())).status).toBe(401)
  })

  it('returns connected: true when verified session exists', async () => {
    mockSB.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { line_user_id: 'U123', display_name: 'Test User', verified_at: '2026-05-09T00:00:00Z' },
        error: null,
      }),
    })
    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.connected).toBe(true)
    expect(body.displayName).toBe('Test User')
  })

  it('returns connected: false with code and addFriendUrl when not yet linked', async () => {
    mockSB.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    })
    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.connected).toBe(false)
    expect(body.code).toMatch(/^\d{6}$/)
    expect(body.addFriendUrl).toBe('https://line.me/R/ti/p/@testbot')
  })
})
