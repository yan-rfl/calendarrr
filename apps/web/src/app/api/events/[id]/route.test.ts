import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, PATCH, DELETE } from './route'

const mockEvent = {
  id: 'e1', user_id: 'u1', name: 'Dentist', detail: null,
  start_at: '2026-05-10T14:00:00.000Z', end_at: null,
  source: 'manual', external_id: null,
  created_at: '2026-05-08T00:00:00.000Z', updated_at: '2026-05-08T00:00:00.000Z',
}

const mockSB = { auth: { getUser: vi.fn() }, from: vi.fn() }
vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => mockSB }))

const params = { params: Promise.resolve({ id: 'e1' }) }
const req = (method: string, body?: unknown) => new Request('http://localhost/api/events/e1', {
  method,
  headers: body ? { 'Content-Type': 'application/json' } : {},
  body: body ? JSON.stringify(body) : undefined,
})

describe('GET /api/events/[id]', () => {
  beforeEach(() => {
    mockSB.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockSB.from.mockReturnValue({
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockEvent, error: null }),
    })
  })
  it('returns event', async () => {
    const res = await GET(req('GET'), params)
    expect(res.status).toBe(200)
    expect((await res.json()).event.name).toBe('Dentist')
  })
  it('returns 404 when not found', async () => {
    mockSB.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    })
    expect((await GET(req('GET'), params)).status).toBe(404)
  })
})

describe('PATCH /api/events/[id]', () => {
  beforeEach(() => {
    mockSB.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockSB.from.mockReturnValue({
      update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { ...mockEvent, name: 'Updated' }, error: null }),
    })
  })
  it('returns 400 for empty body', async () => {
    expect((await PATCH(req('PATCH', {}), params)).status).toBe(400)
  })
  it('updates and returns event', async () => {
    const res = await PATCH(req('PATCH', { name: 'Updated' }), params)
    expect(res.status).toBe(200)
    expect((await res.json()).event.name).toBe('Updated')
  })
})

describe('DELETE /api/events/[id]', () => {
  beforeEach(() => {
    mockSB.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const eqChain = vi.fn()
    eqChain.mockReturnValueOnce({ eq: vi.fn().mockResolvedValue({ error: null }) })
    mockSB.from.mockReturnValue({
      delete: vi.fn().mockReturnValue({ eq: eqChain }),
    })
  })
  it('returns 204', async () => {
    expect((await DELETE(req('DELETE'), params)).status).toBe(204)
  })
})
