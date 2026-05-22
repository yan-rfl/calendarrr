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
    mockSB.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  })

  it('returns 401 when unauthenticated', async () => {
    mockSB.auth.getUser.mockResolvedValueOnce({ data: { user: null } })
    const res = await DELETE()
    expect(res.status).toBe(401)
  })

  it('calls stopGmailWatch and deletes the row', async () => {
    mockSB.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { access_token: 'at' } }),
      delete: vi.fn().mockReturnThis(),
    })
    const res = await DELETE()
    expect(res.status).toBe(200)
    expect(stopGmailWatch).toHaveBeenCalledWith('at')
  })

  it('still deletes row even when stopGmailWatch throws', async () => {
    const deleteMock = vi.fn().mockReturnThis()
    ;(stopGmailWatch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('network'))
    mockSB.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { access_token: 'at' } }),
      delete: deleteMock,
    })
    const res = await DELETE()
    expect(res.status).toBe(200)
    expect(deleteMock).toHaveBeenCalled()
  })
})
