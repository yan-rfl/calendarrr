import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'

const mockSB = { auth: { getUser: vi.fn() }, from: vi.fn() }
vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => mockSB }))

describe('GET /api/settings/email/status', () => {
  beforeEach(() => {
    mockSB.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockSB.from.mockReset()
  })

  it('returns 401 when unauthenticated', async () => {
    mockSB.auth.getUser.mockResolvedValueOnce({ data: { user: null } })
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns gmail connected: true when row exists', async () => {
    mockSB.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        data: [{ provider: 'gmail', imap_user: 'user@gmail.com' }],
        error: null,
      }),
    })
    const res = await GET()
    const body = await res.json()
    expect(body.gmail.connected).toBe(true)
    expect(body.gmail.email).toBe('user@gmail.com')
  })

  it('returns gmail connected: false when no row exists', async () => {
    mockSB.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    })
    const res = await GET()
    const body = await res.json()
    expect(body.gmail.connected).toBe(false)
  })

  it('returns 500 when database query fails', async () => {
    mockSB.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'db error' } }),
    })
    const res = await GET()
    expect(res.status).toBe(500)
  })
})
