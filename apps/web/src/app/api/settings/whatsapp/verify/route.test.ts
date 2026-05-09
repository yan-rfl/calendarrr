import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'

const mockSB = { auth: { getUser: vi.fn() }, from: vi.fn() }
vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => mockSB }))
vi.mock('@/lib/whatsapp', () => ({ sendWhatsAppMessage: vi.fn().mockResolvedValue(undefined) }))

const req = (body: unknown) => new Request('http://localhost/api/settings/whatsapp/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

describe('POST /api/settings/whatsapp/verify', () => {
  beforeEach(() => {
    mockSB.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  })

  it('returns 401 when unauthenticated', async () => {
    mockSB.auth.getUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await POST(req({ phone: '+1234567890' }))).status).toBe(401)
  })

  it('returns 400 for missing phone', async () => {
    expect((await POST(req({}))).status).toBe(400)
  })

  it('sends OTP and returns sent: true when no otp provided', async () => {
    mockSB.from.mockReturnValue({ upsert: vi.fn().mockResolvedValue({ error: null }) })
    const res = await POST(req({ phone: '+1234567890' }))
    expect(res.status).toBe(200)
    expect((await res.json()).sent).toBe(true)
  })

  it('returns 400 for wrong OTP', async () => {
    const expires = new Date(Date.now() + 60000).toISOString()
    mockSB.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { pending_otp: '123456', pending_otp_expires_at: expires },
        error: null,
      }),
    })
    expect((await POST(req({ phone: '+1234567890', otp: '999999' }))).status).toBe(400)
  })

  it('verifies correct OTP and returns verified: true', async () => {
    const expires = new Date(Date.now() + 60000).toISOString()
    mockSB.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { pending_otp: '123456', pending_otp_expires_at: expires },
        error: null,
      }),
      update: vi.fn().mockReturnThis(),
    })
    const res = await POST(req({ phone: '+1234567890', otp: '123456' }))
    expect(res.status).toBe(200)
    expect((await res.json()).verified).toBe(true)
  })
})
