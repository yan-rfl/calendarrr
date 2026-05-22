import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DELETE } from './route'

const mockSB = {
  auth: { getUser: vi.fn() },
  from: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { access_token: 'at' } }),
    delete: vi.fn().mockReturnThis(),
  })),
}
vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => mockSB }))
vi.mock('@/lib/gmail', () => ({ stopGmailWatch: vi.fn().mockResolvedValue(undefined) }))

import { stopGmailWatch } from '@/lib/gmail'

describe('DELETE /api/settings/email/gmail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSB.from.mockReset()
    // First call: select query
    mockSB.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { access_token: 'at' }, error: null }),
    })
    // Second call: delete query
    mockSB.from.mockReturnValueOnce({
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    })
    mockSB.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  })

  it('returns 401 when unauthenticated', async () => {
    mockSB.auth.getUser.mockResolvedValueOnce({ data: { user: null } })
    const res = await DELETE()
    expect(res.status).toBe(401)
  })

  it('calls stopGmailWatch and deletes the row', async () => {
    const res = await DELETE()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(stopGmailWatch).toHaveBeenCalledWith('at')
  })

  it('still deletes row even when stopGmailWatch throws', async () => {
    ;(stopGmailWatch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('network'))
    const res = await DELETE()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })
})
