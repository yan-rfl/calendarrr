import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'

vi.stubEnv('GOOGLE_CLIENT_ID', 'test-client-id')

const mockSB = { auth: { getUser: vi.fn() } }
vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => mockSB }))

const mockCookies = { set: vi.fn() }
vi.mock('next/headers', () => ({ cookies: async () => mockCookies }))

const req = (url = 'http://localhost:3000/api/settings/email/gmail/connect') =>
  new Request(url)

describe('GET /api/settings/email/gmail/connect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSB.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  })

  it('returns 401 when unauthenticated', async () => {
    mockSB.auth.getUser.mockResolvedValueOnce({ data: { user: null } })
    const res = await GET(req())
    expect(res.status).toBe(401)
  })

  it('redirects to Google OAuth with required params', async () => {
    const res = await GET(req())
    expect(res.status).toBe(307)
    const location = res.headers.get('location')!
    expect(location).toContain('accounts.google.com')
    expect(location).toContain('client_id=test-client-id')
    expect(location).toContain('gmail.readonly')
    expect(location).toContain('redirect_uri=')
    expect(location).toContain('state=')
  })

  it('sets oauth_state cookie', async () => {
    await GET(req())
    expect(mockCookies.set).toHaveBeenCalledWith(
      'oauth_state',
      expect.any(String),
      expect.objectContaining({ httpOnly: true }),
    )
  })
})
