import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'

vi.stubEnv('GOOGLE_CLIENT_ID', 'cid')
vi.stubEnv('GOOGLE_CLIENT_SECRET', 'csecret')

const mockSB = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
}
vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => mockSB }))

const mockCookies = { get: vi.fn(), delete: vi.fn() }
vi.mock('next/headers', () => ({ cookies: async () => mockCookies }))

vi.mock('@/lib/gmail', () => ({
  registerGmailWatch: vi.fn().mockResolvedValue({ historyId: '100', expiry: '2026-05-18T00:00:00Z' }),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const req = (params = 'code=abc&state=validstate') =>
  new Request(`http://localhost:3000/api/settings/email/gmail/callback?${params}`)

describe('GET /api/settings/email/gmail/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSB.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockCookies.get.mockReturnValue({ value: 'validstate' })
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'at', refresh_token: 'rt' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ email: 'user@gmail.com' }) })
    mockSB.from.mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ error: null }),
    })
  })

  it('redirects to /settings?error=oauth_failed when state mismatch', async () => {
    mockCookies.get.mockReturnValue({ value: 'differentstate' })
    const res = await GET(req('code=abc&state=wrongstate'))
    expect(res.headers.get('location')).toContain('error=oauth_failed')
  })

  it('redirects to /settings?error=oauth_failed when code is missing', async () => {
    const res = await GET(req('state=validstate'))
    expect(res.headers.get('location')).toContain('error=oauth_failed')
  })

  it('upserts email_connections and redirects to /settings?connected=gmail on success', async () => {
    const upsertMock = vi.fn().mockResolvedValue({ error: null })
    mockSB.from.mockReturnValue({ upsert: upsertMock })

    const res = await GET(req())
    expect(res.headers.get('location')).toContain('connected=gmail')
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'gmail', imap_user: 'user@gmail.com' }),
      expect.objectContaining({ onConflict: 'user_id,provider' }),
    )
  })
})
